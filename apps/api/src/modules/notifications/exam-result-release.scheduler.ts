// Fase 5b — Scanner rilis hasil ujian.
// Rilis hasil ujian bersifat time-based (scheduledEndAt lewat = hasil terlihat,
// Fase 3e), jadi worker ini mendeteksi exam yang baru saja "rilis" lalu
// memicu notifikasi. Flag exams.resultsNotifiedAt = dedupe (klaim atomik via
// updateMany supaya tidak dobel walau ada >1 instance worker).
// Interval: env EXAM_RESULT_SCAN_INTERVAL_MS (default 30s).
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationEventsService } from './notification-events.service';

@Injectable()
export class ExamResultReleaseScheduler
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ExamResultReleaseScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: NotificationEventsService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    const intervalMs = Math.max(
      5000,
      Number(this.config.get('EXAM_RESULT_SCAN_INTERVAL_MS', '30000')),
    );
    this.logger.log(`Exam result scanner aktif — interval ${intervalMs}ms`);
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
    if (this.running) return;
    this.running = true;
    try {
      const now = new Date();
      // Ujian yang waktunya sudah lewat = hasil sudah rilis, tapi notif
      // belum dikirim. DRAFT tidak mungkin lewat normal (belum dipublish).
      const due = await this.prisma.exam.findMany({
        where: {
          status: { in: ['PUBLISHED', 'LOCKED'] },
          scheduledEndAt: { lte: now },
          resultsNotifiedAt: null,
        },
        select: { id: true },
        take: 20,
        orderBy: { scheduledEndAt: 'asc' },
      });
      for (const exam of due) {
        // Klaim atomik — worker/instance lain yang telat akan dapat count=0.
        const claimed = await this.prisma.exam.updateMany({
          where: { id: exam.id, resultsNotifiedAt: null },
          data: { resultsNotifiedAt: new Date() },
        });
        if (claimed.count === 0) continue;
        await this.events.examResultsReleased(exam.id);
      }
    } catch (err) {
      this.logger.error(
        'Scan rilis hasil ujian gagal',
        err instanceof Error ? err.stack : String(err),
      );
    } finally {
      this.running = false;
    }
  }
}
