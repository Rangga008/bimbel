import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ExamAttemptsService } from './exam-attempts.service';

/**
 * Fase 3c — Auto-submit scheduler untuk exam attempts.
 * PALING KRITIS: scheduled_end_at GLOBAL server-side, auto-submit saat waktu habis.
 *
 * Logic:
 * - Setiap 5 detik, cek semua attempts IN_PROGRESS yang scheduled_end_at-nya sudah lewat
 * - Auto-submit semua attempts tersebut dengan grading
 * - Tidak ada race condition karena menggunakan database transaction
 */
@Injectable()
export class ExamAutoSubmitService implements OnModuleInit, OnModuleDestroy {
  private checkInterval: NodeJS.Timeout | null = null;
  private readonly CHECK_INTERVAL_MS = 5000; // Cek setiap 5 detik

  constructor(
    private readonly prisma: PrismaService,
    private readonly attempts: ExamAttemptsService,
  ) {}

  onModuleInit() {
    // Start scheduler saat module di-init
    this.startScheduler();
  }

  onModuleDestroy() {
    // Stop scheduler saat module di-destroy
    this.stopScheduler();
  }

  private startScheduler() {
    if (this.checkInterval) {
      return; // Already running
    }

    console.log('[ExamAutoSubmit] Starting auto-submit scheduler...');

    // Jalankan check pertama segera
    this.checkAndAutoSubmit();

    // Jalankan check periodic
    this.checkInterval = setInterval(() => {
      this.checkAndAutoSubmit();
    }, this.CHECK_INTERVAL_MS);
  }

  private stopScheduler() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      console.log('[ExamAutoSubmit] Stopped auto-submit scheduler');
    }
  }

  /**
   * Cek dan auto-submit attempts yang sudah melewati scheduled_end_at.
   * Ini adalah logic PALING KRITIS untuk timing global server-side.
   * Fase 3d: skip LOCKED attempts (harus di-unlock manual dulu).
   */
  private async checkAndAutoSubmit() {
    try {
      const now = new Date();

      // Cari semua attempts IN_PROGRESS + LOCKED yang exam-nya sudah selesai
      // (scheduled_end_at < now). Attempt LOCKED ikut di-submit dengan jawaban
      // apa adanya — siswa yang terkunci dan tidak di-unlock sebelum waktu
      // habis tetap dinilai sejauh soal terakhir yang dia jawab.
      const attemptsToSubmit = await this.prisma.examAttempt.findMany({
        where: {
          status: { in: ['IN_PROGRESS', 'LOCKED'] },
          exam: {
            scheduledEndAt: {
              lt: now,
            },
          },
        },
        include: {
          exam: {
            select: {
              id: true,
              title: true,
              scheduledEndAt: true,
            },
          },
        },
      });

      if (attemptsToSubmit.length === 0) {
        return; // Tidak ada yang perlu di-submit
      }

      console.log(
        `[ExamAutoSubmit] Found ${attemptsToSubmit.length} attempts to auto-submit`,
      );

      // Auto-submit setiap attempt secara paralel
      const submitPromises = attemptsToSubmit.map((attempt) =>
        this.autoSubmitAttempt(attempt.id).catch((error) => {
          console.error(
            `[ExamAutoSubmit] Failed to auto-submit attempt ${attempt.id}:`,
            error,
          );
        }),
      );

      await Promise.all(submitPromises);
    } catch (error) {
      console.error('[ExamAutoSubmit] Error in checkAndAutoSubmit:', error);
    }
  }

  /**
   * Auto-submit single attempt.
   * Menggunakan ExamAttemptsService.autoSubmit yang sudah ada.
   */
  private async autoSubmitAttempt(attemptId: string) {
    const result = await this.attempts.autoSubmit(attemptId);
    console.log(`[ExamAutoSubmit] Auto-submitted attempt ${attemptId}`);
    return result;
  }

  /**
   * Manual trigger untuk testing.
   * Bisa dipanggil dari endpoint admin untuk testing auto-submit.
   */
  async triggerManualCheck() {
    console.log('[ExamAutoSubmit] Manual trigger invoked');
    await this.checkAndAutoSubmit();
    return { success: true, message: 'Auto-submit check triggered' };
  }
}
