// Fase 5b — Worker outbox WhatsApp. Interval bisa diatur via env
// (WHATSAPP_OUTBOX_INTERVAL_MS, default 10s; WHATSAPP_OUTBOX_BATCH, default 10).
// Memproses PENDING -> SENT/FAILED lewat WhatsAppProvider aktif.
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WhatsAppOutboxService } from './whatsapp-outbox.service';

@Injectable()
export class WhatsAppOutboxWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsAppOutboxWorker.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly outbox: WhatsAppOutboxService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    const intervalMs = Math.max(
      1000,
      Number(this.config.get('WHATSAPP_OUTBOX_INTERVAL_MS', '10000')),
    );
    this.logger.log(
      `Outbox worker aktif — interval ${intervalMs}ms, provider "${this.outbox.providerName()}"`,
    );
    void this.tick();
    this.timer = setInterval(() => void this.tick(), intervalMs);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick() {
    if (this.running) return; // jangan overlap saat tick sebelumnya belum selesai
    this.running = true;
    try {
      const batch = Math.max(
        1,
        Number(this.config.get('WHATSAPP_OUTBOX_BATCH', '10')),
      );
      const result = await this.outbox.processPending(batch);
      if (result.found > 0) {
        this.logger.log(
          `Outbox diproses: ${result.sent} SENT, ${result.retryLater} retry, ${result.failed} FAILED`,
        );
      }
    } catch (err) {
      this.logger.error(
        'Gagal memproses outbox',
        err instanceof Error ? err.stack : String(err),
      );
    } finally {
      this.running = false;
    }
  }
}
