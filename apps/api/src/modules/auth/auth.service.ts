import {
  BadRequestException,
  ForbiddenException,
  Injectable,
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

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly mailer: MailerService,
    private readonly media: MediaService,
    private readonly settings: SettingsService,
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
  ): AuthenticatedUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl ?? null,
      roles,
      permissions,
    };
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
      // Cegah duplikasi akun aktif: no HP yang sudah dipakai akun aktif
      // tidak boleh didaftarkan lagi (nanti login-nya ambigu). Akun
      // nonaktif dengan nomor sama tidak menghalangi — daftar ulang aman.
      const phoneTaken = await tx.user.findFirst({
        where: {
          phone: { in: this.phoneVariants(dto.phone) },
          isActive: true,
        },
        select: { id: true },
      });
      if (phoneTaken) {
        throw new BadRequestException(
          'Nomor HP sudah terdaftar pada akun aktif. Silakan login atau hubungi admin.',
        );
      }
      const email =
        dto.email?.trim() ||
        (await this.synthEmailFromPhone(tx, dto.phone));
      const created = await this.usersService.createUserForPersonInTx(tx, {
        email,
        name: dto.name,
        phone: dto.phone,
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
    phone: string;
    password: string;
    email?: string;
    joinCode?: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const phoneTaken = await tx.user.findFirst({
        where: {
          phone: { in: this.phoneVariants(dto.phone) },
          isActive: true,
        },
        select: { id: true },
      });
      if (phoneTaken) {
        throw new BadRequestException(
          'Nomor HP sudah terdaftar pada akun aktif. Silakan login atau hubungi admin.',
        );
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
        (await this.synthEmailFromPhone(tx, dto.phone));
      const created = await this.usersService.createUserForPersonInTx(tx, {
        email,
        name: dto.name,
        phone: dto.phone,
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
    const authUser = this.toAuthenticatedUser(user, roles, permissions);

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
    const authUser = this.toAuthenticatedUser(user, roles, permissions);

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
    if (file.size > 2 * 1024 * 1024) {
      throw new BadRequestException('Ukuran foto maksimal 2MB.');
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
    });
    const oldUrl = user.avatarUrl;
    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: asset.url },
    });
    // Bersihkan aset avatar lama (bila disimpan sebagai media PROFILE).
    const oldId = oldUrl?.match(/\/api\/media\/([^/]+)\/file/)?.[1];
    if (oldId && oldId !== asset.id) {
      await this.media.deleteAssetInternal(oldId);
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
    const oldId = oldUrl?.match(/\/api\/media\/([^/]+)\/file/)?.[1];
    if (oldId) await this.media.deleteAssetInternal(oldId);
    return this.getProfile(userId);
  }

  /**
   * Kirim link reset password via email. Selalu mengembalikan sukses agar
   * endpoint ini tidak bisa dipakai menebak email terdaftar.
   */
  async requestPasswordReset(email: string, origin: string | undefined) {
    const user = await this.usersService.findByEmailWithRoles(email);
    if (!user || !user.isActive) {
      return { sent: true as const };
    }
    const token = randomBytes(32).toString('hex');
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(token),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });
    const branding = await this.settings.get('branding');
    const base = (
      origin ||
      this.config.get<string>('WEB_APP_URL') ||
      'http://localhost:3001'
    ).replace(/\/+$/, '');
    const link = `${base}/reset-password?token=${token}`;
    await this.mailer.send({
      to: user.email,
      subject: `Reset kata sandi ${branding.appName}`,
      text: `Halo ${user.name},\n\nKami menerima permintaan reset kata sandi untuk akun ${user.email}.\nBuka link berikut untuk membuat kata sandi baru (berlaku 30 menit, sekali pakai):\n\n${link}\n\nAbaikan email ini jika Anda tidak meminta reset.`,
      html: `<p>Halo ${user.name},</p><p>Kami menerima permintaan reset kata sandi untuk akun <b>${user.email}</b>.</p><p><a href="${link}">Klik di sini untuk membuat kata sandi baru</a> (berlaku 30 menit, sekali pakai).</p><p>Abaikan email ini jika Anda tidak meminta reset.</p><p>— ${branding.appName}</p>`,
    });
    return { sent: true as const };
  }

  /** Setel ulang kata sandi dari token email; revoke semua sesi aktif. */
  async resetPassword(token: string, newPassword: string) {
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
    await this.prisma.refreshToken.updateMany({
      where: { userId: rec.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
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
