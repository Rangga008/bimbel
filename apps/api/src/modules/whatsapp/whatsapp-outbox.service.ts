// Fase 5b — WhatsApp outbox. SEMUA pesan WA keluar WAJIB lewat sini:
// pemicu hanya memanggil enqueue() (status PENDING); worker memproses PENDING
// lewat interface WhatsAppProvider -> SENT/FAILED. JANGAN kirim langsung.
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { WHATSAPP_PROVIDER } from './whatsapp.provider';
import type { WhatsAppProvider } from './whatsapp.provider';

export interface EnqueueWhatsAppArgs {
  /** Nomor tujuan. Kosong/null -> dilewati (tidak semua user punya phone). */
  phone?: string | null;
  name?: string | null;
  /** userId penerima (opsional) — untuk cek preferensi whatsAppEnabled. */
  userId?: string | null;
  /** Jenis event pemicu, mis. PAYMENT_VERIFIED, PAYROLL_PAID. */
  eventType: string;
  referenceType?: string;
  referenceId?: string;
  message: string;
  /** Lampiran opsional — referensi media_assets (mis. PDF kwitansi). */
  attachmentAssetId?: string | null;
  attachmentName?: string | null;
}

@Injectable()
export class WhatsAppOutboxService {
  private readonly logger = new Logger(WhatsAppOutboxService.name);
  private readonly maxAttempts: number;
  private readonly sendDelayMinMs: number;
  private readonly sendDelayMaxMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(WHATSAPP_PROVIDER) private readonly provider: WhatsAppProvider,
  ) {
    this.maxAttempts = Math.max(
      1,
      Number(this.config.get('WHATSAPP_OUTBOX_MAX_ATTEMPTS', '3')),
    );
    // Anti-ban: jeda acak antar pesan supaya kirim massal tidak terlihat
    // seperti spam burst. Default 4–9 detik/pesan; bisa diatur via env
    // WHATSAPP_SEND_DELAY_MIN_MS / WHATSAPP_SEND_DELAY_MAX_MS.
    this.sendDelayMinMs = Math.max(
      0,
      Number(this.config.get('WHATSAPP_SEND_DELAY_MIN_MS', '4000')),
    );
    this.sendDelayMaxMs = Math.max(
      this.sendDelayMinMs,
      Number(this.config.get('WHATSAPP_SEND_DELAY_MAX_MS', '9000')),
    );
  }

  providerName() {
    return this.provider.name;
  }

  /**
   * Masukkan pesan ke outbox (status PENDING). Menghormati preferensi
   * `whatsAppEnabled` bila userId diisi. Dedupe dijaga unique index
   * (eventType+referenceType+referenceId+recipientPhone) — event yang sama
   * tidak menghasilkan pesan ganda ke nomor yang sama.
   */
  async enqueue(args: EnqueueWhatsAppArgs) {
    const phone = args.phone?.trim();
    if (!phone) return null;
    if (args.userId) {
      const pref = await this.prisma.notificationPreference.findUnique({
        where: { userId: args.userId },
        select: { whatsAppEnabled: true },
      });
      if (pref && !pref.whatsAppEnabled) return null;
    }
    try {
      const row = await this.prisma.whatsAppOutbox.create({
        data: {
          userId: args.userId ?? null,
          recipientPhone: phone,
          recipientName: args.name ?? null,
          eventType: args.eventType,
          referenceType: args.referenceType ?? null,
          referenceId: args.referenceId ?? null,
          message: args.message,
          attachmentAssetId: args.attachmentAssetId ?? null,
          attachmentName: args.attachmentName ?? null,
        },
      });
      this.kick();
      return row;
    } catch (err) {
      // Dedupe: pesan untuk event+referensi+nomor yang sama sudah ada.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        this.kick();
        return this.prisma.whatsAppOutbox.findFirst({
          where: {
            eventType: args.eventType,
            referenceType: args.referenceType ?? null,
            referenceId: args.referenceId ?? null,
            recipientPhone: phone,
          },
        });
      }
      throw err;
    }
  }

  /**
   * Picu pemrosesan segera (fire-and-forget) supaya pesan tidak menunggu
   * interval worker. Aman dipanggil berulang: klaim baris bersifat atomik
   * (updateMany PENDING->SENDING) sehingga dua pemanggil tidak mengirim
   * pesan yang sama dua kali.
   */
  kick() {
    void this.processPending().catch((err) =>
      this.logger.warn(
        `Kick outbox gagal: ${err instanceof Error ? err.message : err}`,
      ),
    );
  }

  /**
   * Proses antrean PENDING lewat provider aktif. Dipanggil worker berkala;
   * juga bisa dipicu manual via endpoint admin (untuk dev/demo).
   */
  async processPending(limit = 10) {
    // Crash-recovery: baris yang nyangkut di SENDING >3 menit (proses mati di
    // tengah kirim) dikembalikan ke PENDING supaya dicoba ulang.
    await this.prisma.whatsAppOutbox.updateMany({
      where: {
        status: 'SENDING',
        updatedAt: { lt: new Date(Date.now() - 3 * 60_000) },
      },
      data: { status: 'PENDING' },
    });
    const pending = await this.prisma.whatsAppOutbox.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    const result = {
      provider: this.provider.name,
      found: pending.length,
      sent: 0,
      failed: 0,
      retryLater: 0,
    };
    for (const row of pending) {
      // Klaim atomik: hanya satu pemroses yang menang baris ini — mencegah
      // kirim ganda saat kick() beririsan dengan tick worker.
      const claimed = await this.prisma.whatsAppOutbox.updateMany({
        where: { id: row.id, status: 'PENDING' },
        data: { status: 'SENDING' },
      });
      if (claimed.count === 0) {
        result.found -= 1;
        continue;
      }
      try {
        const attachment = await this.loadAttachment(row.attachmentAssetId);
        const sendResult = await this.provider.send({
          to: row.recipientPhone,
          name: row.recipientName,
          body: row.message,
          attachment: attachment
            ? { ...attachment, filename: row.attachmentName ?? attachment.filename }
            : undefined,
          metadata: {
            eventType: row.eventType,
            referenceType: row.referenceType,
            referenceId: row.referenceId,
          },
        });
        await this.prisma.whatsAppOutbox.update({
          where: { id: row.id },
          data: {
            status: 'SENT',
            provider: this.provider.name,
            providerRef: sendResult.providerRef ?? null,
            attempts: { increment: 1 },
            error: null,
            sentAt: new Date(),
          },
        });
        result.sent += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const attempts = row.attempts + 1;
        const exhausted = attempts >= this.maxAttempts;
        await this.prisma.whatsAppOutbox.update({
          where: { id: row.id },
          data: {
            status: exhausted ? 'FAILED' : 'PENDING',
            attempts,
            error: message.slice(0, 1000),
          },
        });
        if (exhausted) result.failed += 1;
        else result.retryLater += 1;
        this.logger.warn(
          `Outbox ${row.id} gagal (attempt ${attempts}): ${message}`,
        );
      }
      // Jeda acak antar pengiriman — provider 'log' (dev) tidak perlu menunggu.
      if (this.provider.name !== 'log' && this.sendDelayMaxMs > 0) {
        const jitter =
          this.sendDelayMinMs +
          Math.random() * (this.sendDelayMaxMs - this.sendDelayMinMs);
        await new Promise((r) => setTimeout(r, Math.round(jitter)));
      }
    }
    return result;
  }

  /** Baca lampiran dari media_assets — null bila aset hilang (kirim teks saja). */
  private async loadAttachment(assetId: string | null) {
    if (!assetId) return null;
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id: assetId },
    });
    if (!asset) return null;
    try {
      const content = await readFile(
        join(process.cwd(), 'uploads', 'media', asset.filename),
      );
      return { content, filename: asset.originalName, mime: asset.mime };
    } catch {
      this.logger.warn(`File lampiran ${assetId} tidak ada di disk.`);
      return null;
    }
  }

  /** Re-queue baris FAILED untuk dicoba lagi (attempts direset). */
  async retry(id: string) {
    const row = await this.prisma.whatsAppOutbox.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Baris outbox tidak ditemukan.');
    if (row.status !== 'FAILED') {
      throw new BadRequestException(
        'Hanya pesan berstatus FAILED yang bisa di-retry.',
      );
    }
    return this.prisma.whatsAppOutbox.update({
      where: { id },
      data: { status: 'PENDING', attempts: 0, error: null },
    });
  }

  list(query: { status?: string; eventType?: string; take?: number }) {
    const where: Record<string, unknown> = {};
    if (query.status) {
      const s = query.status.toUpperCase();
      if (!['PENDING', 'SENT', 'FAILED'].includes(s)) {
        throw new BadRequestException(
          'Status tidak valid (PENDING/SENT/FAILED).',
        );
      }
      where.status = s;
    }
    if (query.eventType) where.eventType = query.eventType.toUpperCase();
    return this.prisma.whatsAppOutbox.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: query.take ?? 100,
    });
  }

  async stats() {
    const grouped = await this.prisma.whatsAppOutbox.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    const counts: Record<string, number> = { PENDING: 0, SENT: 0, FAILED: 0 };
    for (const g of grouped) counts[g.status] = g._count._all;
    return { provider: this.provider.name, ...counts };
  }
}
