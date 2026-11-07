import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import type { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { MailerService } from '../mailer/mailer.service';
import { MediaService } from '../media/media.service';
import { SettingsService } from '../settings/settings.service';
import { WhatsAppOutboxService } from '../whatsapp/whatsapp-outbox.service';
import { AuthenticatedUser } from './types/authenticated-user.type';
import { ROLE_NAMES } from '../rbac/permissions.constants';
import type { RegisterParentDto } from './dto/register-parent.dto';

export interface LoginContext {
  ipAddress?: string;
  userAgent?: string;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  user: AuthenticatedUser;
}

const REFRESH_TOKEN_BYTES = 48;
const RESET_OTP_TTL_MINUTES = 10;
const RESET_OTP_RESEND_SECONDS = 60;
const RESET_OTP_MAX_ATTEMPTS = 5;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly mailer: MailerService,
    private readonly media: MediaService,
    private readonly settings: SettingsService,
    private readonly waOutbox: WhatsAppOutboxService,
  ) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private toAuthenticatedUser(
    user: {
      id: string;
      email: string;
      name: string;
      isActive: boolean;
      avatarUrl?: string | null;
    },
    roles: string[],
    permissions: string[],
    studentGroupless?: boolean,
  ): AuthenticatedUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl ?? null,
      roles,
      permissions,
      ...(studentGroupless !== undefined ? { studentGroupless } : {}),
    };
  }

  /** Siswa tanpa keanggotaan kelompok — akun luar (daftar-mandiri untuk
   *  try out) yang menunya disempitkan jadi Ujian + Profil. */
  private async studentGrouplessFlag(
    userId: string,
    roles: string[],
  ): Promise<boolean | undefined> {
    if (!roles.includes(ROLE_NAMES.SISWA)) return undefined;
    const count = await this.prisma.groupMember.count({
      where: { student: { userId } },
    });
    return count === 0;
  }

  /** Pesan error generik & human-friendly — jangan bocorkan apakah email terdaftar atau tidak. */
  private invalidCredentials(): never {
    throw new UnauthorizedException('Email atau kata sandi salah.');
  }

  /** Normalisasi nomor HP ke varian umum (0xxx, 62xxx, +62xxx, 8xxx). */
  private phoneVariants(raw: string): string[] {
    return UsersService.phoneVariants(raw);
  }

  async validateCredentials(identifier: string, password: string) {
    const id = identifier.trim();
    if (id.includes('@')) {
      const user = await this.usersService.findByEmailWithRoles(id);
      if (!user || !user.isActive) {
        this.invalidCredentials();
      }
      const passwordMatches = await bcrypt.compare(
        password,
        user.passwordHash,
      );
      if (!passwordMatches) {
        this.invalidCredentials();
      }
      return user;
    }

    // Login via no HP: nomor bisa dipakai lebih dari satu akun (mis. akun
    // lama dinonaktifkan lalu nomor didaftarkan ulang). Cocokkan sandi ke
    // setiap kandidat, bukan hanya akun tertua — dan akun nonaktif tidak
    // boleh menghalangi akun aktif bernomor sama.
    const candidates = await this.usersService.findAllByPhoneWithRoles(
      this.phoneVariants(id),
    );
    for (const user of candidates) {
      if (!user.isActive) continue;
      const matches = await bcrypt.compare(password, user.passwordHash);
      if (matches) return user;
    }
    this.invalidCredentials();
  }

  private signAccessToken(authUser: AuthenticatedUser): string {
    return this.jwtService.sign(
      {
        sub: authUser.id,
        email: authUser.email,
        name: authUser.name,
        roles: authUser.roles,
        permissions: authUser.permissions,
        studentGroupless: authUser.studentGroupless,
      },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: Number(
          this.config.get<string>('JWT_ACCESS_TTL_SECONDS', '900'),
        ),
      },
    );
  }

  private async issueRefreshToken(userId: string, ctx: LoginContext) {
    const ttlDays = Number(
      this.config.get<string>('JWT_REFRESH_TTL_DAYS', '7'),
    );
    const rawToken = randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(rawToken),
        expiresAt,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      },
    });

    return { rawToken, expiresAt };
  }

  /**
   * Pendaftaran mandiri orang tua (landing page → /daftar). Membuat akun
   * User role ORANG_TUA + profil Parent dalam satu transaksi. Sandi
   * dipilih sendiri oleh pendaftar — bukan temporary password.
   */
  /**
   * Email placeholder dari nomor HP untuk pendaftar yang tidak mengisi email —
   * kolom users.email wajib unik, jadi nomor HP dinormalisasi jadi alamat
   * sintetis yang tetap bisa dipakai login bila suatu saat dibutuhkan.
   */
  private async synthEmailFromPhone(
    tx: Prisma.TransactionClient,
    phone: string,
  ) {
    const digits = phone.replace(/\D/g, '') || 'x';
    for (let i = 0; i < 20; i += 1) {
      const candidate = `wa.${digits}${i ? `.${i}` : ''}@hp.bimbel.local`;
      const clash = await tx.user.findUnique({ where: { email: candidate } });
      if (!clash) return candidate;
    }
    return `wa.${digits}.${Date.now()}@hp.bimbel.local`;
  }

  async registerParent(dto: RegisterParentDto) {
    return this.prisma.$transaction(async (tx) => {
      const phone = dto.phone?.trim() || undefined;
      // Cegah duplikasi akun aktif: no HP yang sudah dipakai akun aktif
      // tidak boleh didaftarkan lagi (nanti login-nya ambigu). Akun
      // nonaktif dengan nomor sama tidak menghalangi — daftar ulang aman.
      if (phone) {
        const phoneTaken = await tx.user.findFirst({
          where: {
            phone: { in: this.phoneVariants(phone) },
            isActive: true,
          },
          select: { id: true },
        });
        if (phoneTaken) {
          throw new BadRequestException(
            'Nomor HP sudah terdaftar pada akun aktif. Silakan login atau hubungi admin.',
          );
        }
      }
      const email =
        dto.email?.trim() ||
        (phone
          ? await this.synthEmailFromPhone(tx, phone)
          : (() => {
              throw new BadRequestException('Isi nomor HP atau email — minimal salah satu.');
            })());
      const created = await this.usersService.createUserForPersonInTx(tx, {
        email,
        name: dto.name,
        phone,
        roleName: ROLE_NAMES.ORANG_TUA,
        tempPassword: dto.password,
        // Daftar-mandiri — wajib verifikasi no HP via OTP WhatsApp.
        phoneVerified: false,
      });
      const parent = await tx.parent.create({
        data: { userId: created.userId },
      });
      return { parentId: parent.id, userId: created.userId };
    });
  }

  /**
   * Pendaftaran mandiri siswa dari luar bimbel (mis. try out/promosi).
   * Membuat User role SISWA + Student isExternal. `joinCode` opsional:
   * bila cocok dengan `learning_groups.join_code`, siswa langsung jadi
   * anggota kelompok tsb — bisa mengerjakan ujian yang ditugaskan ke
   * kelompok itu tanpa menunggu penempatan admin.
   */
  async registerStudent(dto: {
    name: string;
    phone?: string;
    password: string;
    email?: string;
    joinCode?: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const phone = dto.phone?.trim() || undefined;
      if (phone) {
        const phoneTaken = await tx.user.findFirst({
          where: {
            phone: { in: this.phoneVariants(phone) },
            isActive: true,
          },
          select: { id: true },
        });
        if (phoneTaken) {
          throw new BadRequestException(
            'Nomor HP sudah terdaftar pada akun aktif. Silakan login atau hubungi admin.',
          );
        }
      }
      // Kode kelompok (opsional) — salah kode ditolak supaya tidak asal masuk.
      let group: { id: string; name: string } | null = null;
      if (dto.joinCode?.trim()) {
        const found = await tx.learningGroup.findUnique({
          where: { joinCode: dto.joinCode.trim().toUpperCase() },
          select: { id: true, name: true, isActive: true },
        });
        group = found && found.isActive ? { id: found.id, name: found.name } : null;
        if (!group) {
          throw new BadRequestException('Kode kelompok tidak valid atau sudah tidak aktif.');
        }
      }
      const email =
        dto.email?.trim() ||
        (phone
          ? await this.synthEmailFromPhone(tx, phone)
          : (() => {
              throw new BadRequestException('Isi nomor HP atau email — minimal salah satu.');
            })());
      const created = await this.usersService.createUserForPersonInTx(tx, {
        email,
        name: dto.name,
        phone,
        roleName: ROLE_NAMES.SISWA,
        tempPassword: dto.password,
        // Daftar-mandiri — wajib verifikasi no HP via OTP WhatsApp.
        phoneVerified: false,
      });
      const student = await tx.student.create({
        data: { userId: created.userId, isExternal: true },
      });
      if (group) {
        await tx.groupMember.create({
          data: { groupId: group.id, studentId: student.id },
        });
      }
      return { studentId: student.id, userId: created.userId, group };
    });
  }

  /** Preview kode kelompok untuk halaman daftar — nama + jenjang saja. */
  async groupJoinInfo(code: string) {
    const group = await this.prisma.learningGroup.findUnique({
      where: { joinCode: code.trim().toUpperCase() },
      select: {
        name: true,
        isActive: true,
        level: { select: { name: true } },
        program: { select: { name: true } },
      },
    });
    if (!group || !group.isActive) {
      throw new BadRequestException('Kode kelompok tidak valid.');
    }
    return { name: group.name, level: group.level?.name ?? null, program: group.program?.name ?? null };
  }

  async login(
    email: string,
    password: string,
    ctx: LoginContext,
  ): Promise<IssuedTokens> {
    const user = await this.validateCredentials(email, password);
    const { roles, permissions } =
      this.usersService.buildRolesAndPermissions(user);
    const authUser = this.toAuthenticatedUser(
      user,
      roles,
      permissions,
      await this.studentGrouplessFlag(user.id, roles),
    );

    const accessToken = this.signAccessToken(authUser);
    const { rawToken, expiresAt } = await this.issueRefreshToken(user.id, ctx);

    return {
      accessToken,
      refreshToken: rawToken,
      refreshTokenExpiresAt: expiresAt,
      user: authUser,
    };
  }

  async refresh(
    rawRefreshToken: string,
    ctx: LoginContext,
  ): Promise<IssuedTokens> {
    const tokenHash = this.hashToken(rawRefreshToken);
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!existing || existing.revokedAt || existing.expiresAt < new Date()) {
      throw new ForbiddenException('Sesi tidak valid, silakan login kembali.');
    }

    // Rotasi: token lama langsung direvoke supaya tidak bisa dipakai ulang (replay).
    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });

    const user = await this.usersService.findByIdWithRoles(existing.userId);
    if (!user || !user.isActive) {
      throw new ForbiddenException('Sesi tidak valid, silakan login kembali.');
    }

    const { roles, permissions } =
      this.usersService.buildRolesAndPermissions(user);
    const authUser = this.toAuthenticatedUser(
      user,
      roles,
      permissions,
      await this.studentGrouplessFlag(user.id, roles),
    );

    const accessToken = this.signAccessToken(authUser);
    const { rawToken, expiresAt } = await this.issueRefreshToken(user.id, ctx);

    return {
      accessToken,
      refreshToken: rawToken,
      refreshTokenExpiresAt: expiresAt,
      user: authUser,
    };
  }

  /**
   * Ubah kata sandi mandiri (semua role): verifikasi sandi lama dulu, lalu
   * pakai logika reset yang sama dengan admin (hash baru + revoke SEMUA
   * refresh token — user diminta login ulang, sesi perangkat lain ikut mati).
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.usersService.findByIdWithRoles(userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException(
        'Sesi tidak valid, silakan login kembali.',
      );
    }
    const passwordMatches = await bcrypt.compare(
      currentPassword,
      user.passwordHash,
    );
    if (!passwordMatches) {
      // Pesan jelas karena ini aksi user sendiri — bukan endpoint login publik.
      throw new UnauthorizedException('Kata sandi saat ini salah.');
    }
    await this.usersService.resetPassword(userId, newPassword);
    return { success: true as const };
  }

  /**
   * Profil mandiri: baca data segar dari DB (termasuk phone yang tidak
   * ada di JWT) dan edit nama/nomor HP sendiri.
   */
  async getProfile(userId: string) {
    const user = await this.usersService.findByIdWithRoles(userId);
    if (!user) throw new UnauthorizedException('Sesi tidak valid.');
    const profile = this.usersService.sanitize(user);
    // Data tambahan khusus siswa: NIS + pilihan kampus (untuk laporan cetak).
    const student = await this.prisma.student.findUnique({
      where: { userId },
      select: { nis: true, majorChoice1: true, majorChoice2: true },
    });
    return student ? { ...profile, student } : profile;
  }

  async updateProfile(
    userId: string,
    dto: {
      name?: string;
      phone?: string;
      majorChoice1?: string;
      majorChoice2?: string;
    },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException(
        'Sesi tidak valid, silakan login kembali.',
      );
    }
    const phoneChanged =
      dto.phone !== undefined && (dto.phone || null) !== user.phone;
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone || null } : {}),
        // Nomor berganti → harus verifikasi ulang lewat OTP WhatsApp.
        ...(phoneChanged ? { phoneVerifiedAt: null } : {}),
      },
    });
    // Pilihan kampus hanya berlaku kalau akun ini memang siswa.
    if (
      dto.majorChoice1 !== undefined ||
      dto.majorChoice2 !== undefined
    ) {
      await this.prisma.student.updateMany({
        where: { userId },
        data: {
          ...(dto.majorChoice1 !== undefined
            ? { majorChoice1: dto.majorChoice1.trim() || null }
            : {}),
          ...(dto.majorChoice2 !== undefined
            ? { majorChoice2: dto.majorChoice2.trim() || null }
            : {}),
        },
      });
    }
    return this.getProfile(userId);
  }

  /** Avatar ter-dedupe bisa dipakai beberapa user — hapus asetnya hanya bila
   *  tidak ada user lain yang masih menunjuk URL media yang sama. */
  private async deleteAvatarAssetIfUnused(
    avatarUrl: string | null | undefined,
    exceptUserId: string,
  ) {
    const assetId = avatarUrl?.match(/\/api\/media\/([^/]+)\/file/)?.[1];
    if (!assetId) return;
    const stillUsed = await this.prisma.user.count({
      where: { avatarUrl, NOT: { id: exceptUserId } },
    });
    if (stillUsed === 0) await this.media.deleteAssetInternal(assetId);
  }

  /**
   * Foto profil self-service: simpan ke media kategori PROFILE (tidak muncul
   * di pustaka media), avatar lama dibersihkan supaya tidak yatim.
   */
  async updateAvatar(
    userId: string,
    file:
      | { buffer: Buffer; mimetype: string; originalname: string; size: number }
      | undefined,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('File foto kosong atau tidak terbaca.');
    }
    const ext = MediaService.ALLOWED_MIME_EXT[file.mimetype];
    if (!ext || ext === '.pdf') {
      throw new BadRequestException(
        'Format foto harus JPG, PNG, WebP, GIF, atau SVG.',
      );
    }
    if (file.size > 8 * 1024 * 1024) {
      throw new BadRequestException('Ukuran foto maksimal 8MB.');
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException(
        'Sesi tidak valid, silakan login kembali.',
      );
    }
    const asset = await this.media.saveBuffer(file.buffer, {
      mime: file.mimetype,
      originalName: file.originalname,
      uploadedById: userId,
      maxSize: 2 * 1024 * 1024,
      category: 'PROFILE',
      dedupe: true,
    });
    const oldUrl = user.avatarUrl;
    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: asset.url },
    });
    // Bersihkan aset avatar lama bila tidak dipakai user lain (dedupe dapat
    // membuat satu media PROFILE dipakai beberapa akun).
    const oldId = oldUrl?.match(/\/api\/media\/([^/]+)\/file/)?.[1];
    if (oldId && oldId !== asset.id) {
      await this.deleteAvatarAssetIfUnused(oldUrl, userId);
    }
    return this.getProfile(userId);
  }

  /** Hapus foto profil — kembali ke avatar default (inisial). */
  async removeAvatar(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException(
        'Sesi tidak valid, silakan login kembali.',
      );
    }
    const oldUrl = user.avatarUrl;
    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: null },
    });
    await this.deleteAvatarAssetIfUnused(oldUrl, userId);
    return this.getProfile(userId);
  }

  /** Normalisasi identifier reset: email lowercase atau nomor HP format 62xxx. */
  private resetIdentifier(raw: string): {
    channel: 'EMAIL' | 'WHATSAPP';
    key: string;
  } {
    const value = raw.trim();
    if (value.includes('@')) {
      return { channel: 'EMAIL', key: value.toLowerCase() };
    }
    const digits = value.replace(/\D/g, '');
    const key = digits.startsWith('0')
      ? `62${digits.slice(1)}`
      : digits.startsWith('8')
        ? `62${digits}`
        : digits;
    return { channel: 'WHATSAPP', key };
  }

  private maskResetDestination(destination: string, channel: 'EMAIL' | 'WHATSAPP') {
    if (channel === 'EMAIL') {
      const [local = '', domain = ''] = destination.split('@');
      return `${local.slice(0, 2)}•••@${domain}`;
    }
    const digits = destination.replace(/\D/g, '');
    if (digits.length <= 5) return '•••';
    return `${digits.slice(0, 4)}•••${digits.slice(-3)}`;
  }

  private async findPasswordResetUser(
    rawIdentifier: string,
    channel: 'EMAIL' | 'WHATSAPP',
    identifierKey: string,
  ) {
    const select = {
      id: true,
      email: true,
      name: true,
      phone: true,
      isActive: true,
    } as const;
    if (channel === 'EMAIL') {
      return this.prisma.user.findFirst({
        where: {
          isActive: true,
          email: { equals: identifierKey, mode: 'insensitive' },
        },
        select,
      });
    }
    // Bila data lama punya >1 akun aktif dengan nomor sama, pakai akun terbaru.
    const candidates = await this.prisma.user.findMany({
      where: {
        isActive: true,
        phone: { in: this.phoneVariants(rawIdentifier) },
      },
      orderBy: { createdAt: 'desc' },
      select,
    });
    return candidates[0] ?? null;
  }

  /**
   * Kirim OTP reset password ke email ATAU WhatsApp sesuai identifier.
   * Selalu mengembalikan respons generik supaya endpoint ini tidak bisa dipakai
   * menebak email/no HP yang terdaftar.
   */
  async requestPasswordReset(identifier: string, origin: string | undefined) {
    void origin; // Flow lama memakai origin untuk link; OTP tidak butuh URL.
    const parsed = this.resetIdentifier(identifier);
    if (!parsed.key) {
      throw new BadRequestException('Masukkan email atau nomor HP akun.');
    }
    const user = await this.findPasswordResetUser(
      identifier,
      parsed.channel,
      parsed.key,
    );
    const fallback = {
      sent: true as const,
      channel: parsed.channel,
      destination: this.maskResetDestination(identifier, parsed.channel),
      expiresInMinutes: RESET_OTP_TTL_MINUTES,
    };
    if (!user) return fallback;

    // Batas kirim ulang per identifier — OTP sebelumnya juga langsung dibatalkan
    // supaya hanya kode terbaru yang valid.
    const latest = await this.prisma.passwordResetOtp.findFirst({
      where: { identifierKey: parsed.key },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (
      latest &&
      Date.now() - latest.createdAt.getTime() < RESET_OTP_RESEND_SECONDS * 1000
    ) {
      return fallback;
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = await bcrypt.hash(code, 8);
    const destination =
      parsed.channel === 'EMAIL' ? user.email : user.phone || identifier;
    const otp = await this.prisma.$transaction(async (tx) => {
      await tx.passwordResetOtp.updateMany({
        where: { identifierKey: parsed.key, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      return tx.passwordResetOtp.create({
        data: {
          userId: user.id,
          channel: parsed.channel,
          destination,
          identifierKey: parsed.key,
          codeHash,
          expiresAt: new Date(Date.now() + RESET_OTP_TTL_MINUTES * 60 * 1000),
        },
      });
    });

    const branding = await this.settings.get('branding');
    try {
      if (parsed.channel === 'EMAIL') {
        await this.mailer.send({
          to: destination,
          subject: `Kode reset kata sandi ${branding.appName}`,
          text: `Halo ${user.name},\n\nKode reset kata sandi Anda: ${code}\n\nBerlaku ${RESET_OTP_TTL_MINUTES} menit. Jangan bagikan kode ini ke siapa pun.\nAbaikan email ini jika Anda tidak meminta reset.`,
          html: `<p>Halo ${user.name},</p><p>Kode reset kata sandi Anda:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px">${code}</p><p>Berlaku ${RESET_OTP_TTL_MINUTES} menit. Jangan bagikan kode ini ke siapa pun.</p><p>— ${branding.appName}</p>`,
        });
      } else {
        // userId sengaja tidak dikirim — preferensi WA promo tidak boleh memblokir
        // OTP pemulihan akun yang diminta langsung oleh pemilik nomor.
        await this.waOutbox.enqueue({
          phone: destination,
          name: user.name,
          eventType: 'PASSWORD_RESET_OTP',
          referenceType: 'PasswordResetOtp',
          referenceId: otp.id,
          message:
            `*${branding.appName}* — Kode reset kata sandi Anda: *${code}*\n\n` +
            `Berlaku ${RESET_OTP_TTL_MINUTES} menit. Jangan bagikan kode ini ke siapa pun.`,
        });
      }
    } catch (err) {
      // Kegagalan kirim tidak boleh bocorkan eksistensi akun — batalkan OTP
      // yang belum terkirim lalu tetap balas respons generik.
      this.logger.warn(
        `Gagal mengirim OTP reset via ${parsed.channel}: ${err instanceof Error ? err.message : err}`,
      );
      await this.prisma.passwordResetOtp
        .delete({ where: { id: otp.id } })
        .catch(() => undefined);
      return fallback;
    }
    return {
      sent: true as const,
      channel: parsed.channel,
      destination: this.maskResetDestination(destination, parsed.channel),
      expiresInMinutes: RESET_OTP_TTL_MINUTES,
    };
  }

  /** Legacy: reset dari token link email yang sudah terlanjur terkirim. */
  private async resetPasswordWithToken(token: string, newPassword: string) {
    const rec = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: this.hashToken(token) },
    });
    if (!rec || rec.usedAt || rec.expiresAt < new Date()) {
      throw new BadRequestException(
        'Link reset tidak valid atau sudah kedaluwarsa.',
      );
    }
    await this.prisma.passwordResetToken.update({
      where: { id: rec.id },
      data: { usedAt: new Date() },
    });
    await this.usersService.resetPassword(rec.userId, newPassword);
    return { success: true as const };
  }

  /** Setel ulang kata sandi dari token link lama atau OTP email/WhatsApp. */
  async resetPassword(
    payload: { token?: string; identifier?: string; otp?: string },
    newPassword: string,
  ) {
    if (payload.token) {
      return this.resetPasswordWithToken(payload.token, newPassword);
    }
    const parsed = this.resetIdentifier(payload.identifier ?? '');
    if (!parsed.key || !payload.otp) {
      throw new BadRequestException(
        'Masukkan email/nomor HP dan kode OTP 6 digit.',
      );
    }
    const rec = await this.prisma.passwordResetOtp.findFirst({
      where: { identifierKey: parsed.key, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!rec || rec.expiresAt < new Date()) {
      throw new BadRequestException('Kode OTP tidak valid atau kedaluwarsa.');
    }
    if (rec.attempts >= RESET_OTP_MAX_ATTEMPTS) {
      throw new BadRequestException(
        'Terlalu banyak percobaan salah — kirim ulang kode OTP baru.',
      );
    }
    const match = await bcrypt.compare(payload.otp, rec.codeHash);
    if (!match) {
      await this.prisma.passwordResetOtp.update({
        where: { id: rec.id },
        data: { attempts: { increment: 1 } },
      });
      const left = RESET_OTP_MAX_ATTEMPTS - (rec.attempts + 1);
      throw new BadRequestException(
        left > 0
          ? `Kode OTP salah — sisa percobaan ${left}x.`
          : 'Kode OTP salah — kirim ulang kode baru.',
      );
    }
    await this.prisma.passwordResetOtp.update({
      where: { id: rec.id },
      data: { consumedAt: new Date() },
    });
    // resetPassword() juga merevoke semua refresh token aktif.
    await this.usersService.resetPassword(rec.userId, newPassword);
    return { success: true as const };
  }

  async logout(rawRefreshToken: string | undefined) {
    if (!rawRefreshToken) return;
    const tokenHash = this.hashToken(rawRefreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
