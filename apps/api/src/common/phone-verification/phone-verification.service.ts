import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppOutboxService } from '../../modules/whatsapp/whatsapp-outbox.service';

const CODE_TTL_MINUTES = 10;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_ATTEMPTS = 5;
const SALT_ROUNDS = 8;

function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= 4) return phone;
  return `${digits.slice(0, 4)}••••${digits.slice(-3)}`;
}

/**
 * Verifikasi nomor HP lewat kode OTP yang dikirim ke WhatsApp user.
 * Wajib untuk akun daftar-mandiri (siswa luar & ortu) — akun yang dibuat
 * admin/ortu otomatis ditandai terverifikasi saat dibuat.
 */
@Injectable()
export class PhoneVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: WhatsAppOutboxService,
  ) {}

  /**
   * Lempar ForbiddenException bila user belum memverifikasi nomor HP-nya.
   * Dipanggil di aksi bernilai (mulai ujian/latsol, daftar anak, bayar).
   */
  async assertVerified(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { phone: true, phoneVerifiedAt: true },
    });
    // Akun tanpa nomor HP (mis. daftar pakai email saja) tidak bisa di-OTP
    // — tidak digate; verifikasi baru wajib begitu mereka mengisi nomor HP.
    if (user && user.phone && !user.phoneVerifiedAt) {
      throw new ForbiddenException(
        'Verifikasi nomor HP dulu — kode dikirim ke WhatsApp Anda (banner di halaman utama).',
      );
    }
  }

  /** Status verifikasi untuk banner UI. */
  async status(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { phone: true, phoneVerifiedAt: true },
    });
    return {
      // Tanpa nomor HP tidak ada yang bisa diverifikasi — banner disembunyikan.
      verified: !user?.phone || !!user?.phoneVerifiedAt,
      phone: user?.phone ?? null,
    };
  }

  /** Buat kode 6 digit + antrekan pesan WhatsApp. Rate-limit 60 detik. */
  async send(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        phone: true,
        phoneVerifiedAt: true,
        isActive: true,
      },
    });
    if (!user || !user.isActive) {
      throw new ForbiddenException('Akun tidak aktif.');
    }
    if (user.phoneVerifiedAt) {
      throw new BadRequestException('Nomor HP sudah terverifikasi.');
    }
    if (!user.phone) {
      throw new BadRequestException(
        'Isi nomor HP dulu di halaman Profil sebelum verifikasi.',
      );
    }
    const last = await this.prisma.phoneVerification.findFirst({
      where: { userId, phone: user.phone },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (last) {
      const elapsed = (Date.now() - last.createdAt.getTime()) / 1000;
      if (elapsed < RESEND_COOLDOWN_SECONDS) {
        throw new BadRequestException(
          `Tunggu ${Math.ceil(RESEND_COOLDOWN_SECONDS - elapsed)} detik sebelum kirim ulang kode.`,
        );
      }
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const verification = await this.prisma.phoneVerification.create({
      data: {
        userId,
        phone: user.phone,
        codeHash: await bcrypt.hash(code, SALT_ROUNDS),
        expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000),
      },
    });
    await this.outbox.enqueue({
      userId,
      phone: user.phone,
      name: user.name,
      eventType: 'PHONE_VERIFICATION',
      referenceType: 'PhoneVerification',
      referenceId: verification.id,
      message:
        `*Bimbel GFS* — Kode verifikasi nomor HP Anda: *${code}*\n\n` +
        `Berlaku ${CODE_TTL_MINUTES} menit. Jangan bagikan kode ini ke siapa pun.`,
    });
    return { sentTo: maskPhone(user.phone), expiresInMinutes: CODE_TTL_MINUTES };
  }

  /** Cocokkan kode; berhasil → user.phoneVerifiedAt terisi. */
  async confirm(userId: string, code: string) {
    const normalized = code.replace(/\D/g, '');
    if (normalized.length !== 6) {
      throw new BadRequestException('Kode verifikasi 6 digit.');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { phone: true, phoneVerifiedAt: true },
    });
    if (!user) throw new ForbiddenException('Sesi tidak valid.');
    if (user.phoneVerifiedAt) return { verified: true };
    const verification = await this.prisma.phoneVerification.findFirst({
      where: { userId, phone: user.phone ?? '', consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!verification) {
      throw new BadRequestException('Belum ada kode — kirim kode dulu.');
    }
    if (verification.expiresAt < new Date()) {
      throw new BadRequestException('Kode kedaluwarsa — kirim ulang kode baru.');
    }
    if (verification.attempts >= MAX_ATTEMPTS) {
      throw new BadRequestException(
        'Terlalu banyak percobaan salah — kirim ulang kode baru.',
      );
    }
    const match = await bcrypt.compare(normalized, verification.codeHash);
    if (!match) {
      await this.prisma.phoneVerification.update({
        where: { id: verification.id },
        data: { attempts: { increment: 1 } },
      });
      const left = MAX_ATTEMPTS - (verification.attempts + 1);
      throw new BadRequestException(
        left > 0
          ? `Kode salah — sisa percobaan ${left}x.`
          : 'Kode salah — kirim ulang kode baru.',
      );
    }
    await this.prisma.$transaction([
      this.prisma.phoneVerification.update({
        where: { id: verification.id },
        data: { consumedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { phoneVerifiedAt: new Date() },
      }),
    ]);
    return { verified: true };
  }
}
