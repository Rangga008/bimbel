// Antrean RabbitMQ — opsional via env RABBITMQ_URL. Bila kosong, service
// nonaktif: publish() melempar error sehingga pemanggil jatuh ke jalur
// in-process (perilaku lama), dan consume() menjadi no-op. Ini menjaga
// deploy minimal (tanpa RabbitMQ) tetap berfungsi penuh.
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private conn?: amqp.AmqpConnectionManager;
  private chan?: amqp.ChannelWrapper;
  private readonly asserted = new Set<string>();
  /** true bila koneksi RabbitMQ dikonfigurasi (RABBITMQ_URL terisi). */
  enabled = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const url = this.config.get<string>('RABBITMQ_URL')?.trim();
    if (!url) {
      this.logger.log(
        'RABBITMQ_URL kosong — antrean nonaktif, job diproses in-process.',
      );
      return;
    }
    this.conn = amqp.connect([url], { reconnectTimeInSeconds: 5 });
    this.conn.on('connect', () => this.logger.log('RabbitMQ terhubung.'));
    this.conn.on('disconnect', (arg) =>
      this.logger.warn(
        `RabbitMQ terputus: ${arg?.err?.message ?? 'unknown'} — mencoba ulang otomatis.`,
      ),
    );
    // json:true → sendToQueue menerima object (diserialkan otomatis).
    this.chan = this.conn.createChannel({ json: true });
    this.enabled = true;
  }

  async onModuleDestroy() {
    try {
      await this.chan?.close();
      await this.conn?.close();
    } catch {
      /* abaikan saat shutdown */
    }
  }

  /** Pastikan queue durable ada — dipanggil sekali per nama. */
  private assertQueue(name: string) {
    if (!this.chan || this.asserted.has(name)) return;
    this.asserted.add(name);
    void this.chan.addSetup((ch: ConfirmChannel) =>
      ch.assertQueue(name, { durable: true }),
    );
  }

  /** Kirim pesan persisten. Melempar bila antrean nonaktif — caller wajib
   *  punya fallback in-process. */
  async publish<T extends object>(queue: string, payload: T) {
    if (!this.chan) throw new Error('RabbitMQ tidak aktif');
    this.assertQueue(queue);
    await this.chan.sendToQueue(queue, payload, { persistent: true });
  }

  /** Daftarkan consumer. Handler error → requeue SEKALI (redelivered=false);
   *  kegagalan kedua pesan di-drop setelah dilog supaya poison message tidak
   *  mengulang tanpa henti. Handler idempotent aman dipicu ulang. */
  consume(
    queue: string,
    handler: (payload: Record<string, unknown>) => Promise<void>,
    prefetch = 5,
  ) {
    if (!this.chan) return;
    this.assertQueue(queue);
    void this.chan.addSetup(async (ch: ConfirmChannel) => {
      await ch.prefetch(prefetch);
      await ch.consume(queue, async (msg: ConsumeMessage | null) => {
        if (!msg) return;
        try {
          const payload = JSON.parse(msg.content.toString()) as Record<
            string,
            unknown
          >;
          await handler(payload);
          ch.ack(msg);
        } catch (err) {
          const redelivered = msg.fields?.redelivered === true;
          this.logger.error(
            `Pesan ${queue} gagal diproses${redelivered ? ' (dropped setelah retry)' : ' (requeue)'}: ${err instanceof Error ? err.message : err}`,
          );
          ch.nack(msg, false, !redelivered);
        }
      });
    });
    this.logger.log(`Consumer antrean "${queue}" aktif.`);
  }
}
