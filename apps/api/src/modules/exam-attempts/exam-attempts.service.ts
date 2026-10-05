import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { ExamsService } from '../exams/exams.service';
import { PointTransactionsService } from '../point-transactions/point-transactions.service';
import { SaveExamAnswerDto, SubmitExamDto } from './dto/exam-attempt.dto';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';

/**
 * Fase 3c — Exam attempts management.
 * Autosave jawaban, manual submit, dan auto-submit via scheduler.
 * Timing global server-side: waktu dihitung dari scheduled_start_at/end_at.
 */
@Injectable()
export class ExamAttemptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exams: ExamsService,
    private readonly pointTransactions: PointTransactionsService,
    private readonly audit: AuditService,
  ) {}

  async requireStudent(userId: string) {
    const s = await this.prisma.student.findUnique({ where: { userId } });
    if (!s)
      throw new ForbiddenException('Akun ini tidak terhubung ke data siswa.');
    return s;
  }

  /**
   * Mulai attempt ujian.
   * Validasi: ujian PUBLISHED, waktu dalam range, belum ada attempt IN_PROGRESS.
   */
  async start(userId: string, examId: string, actor?: AuthenticatedUser) {
    const student = await this.requireStudent(userId);

    // Get exam with validation (throw bila tidak valid untuk siswa)
    await this.exams.getForStudent(examId, actor);

    // Check if student already has IN_PROGRESS attempt
    const existing = await this.prisma.examAttempt.findFirst({
      where: { examId, studentId: student.id, status: 'IN_PROGRESS' },
    });
    if (existing) {
      throw new BadRequestException(
        'Anda sudah memiliki attempt yang sedang berjalan untuk ujian ini.',
      );
    }

    // Calculate maxScore from exam items
    const items = await this.prisma.examItem.findMany({
      where: { examId },
      include: { question: { select: { points: true } } },
    });
    const maxScore = items.reduce(
      (sum, item) => sum + (item.points || item.question.points || 1),
      0,
    );

    return this.prisma.examAttempt.create({
      data: {
        examId,
        studentId: student.id,
        maxScore,
        status: 'IN_PROGRESS',
      },
      include: {
        exam: {
          select: {
            id: true,
            title: true,
            scheduledStartAt: true,
            scheduledEndAt: true,
          },
        },
      },
    });
  }

  /**
   * Get attempt detail for student (with current answers).
   * Fase 3d: include proctoring status fields.
   * Fase 3e: result release lock - hanya kirim detail jawaban setelah scheduled_end_at terlewati.
   */
  async getAttemptDetail(userId: string, attemptId: string) {
    const student = await this.requireStudent(userId);
    const attempt = await this.prisma.examAttempt.findUnique({
      where: { id: attemptId },
      select: {
        id: true,
        examId: true,
        studentId: true,
        status: true,
        score: true,
        maxScore: true,
        startedAt: true,
        submittedAt: true,
        lateByMs: true,
        violationCount: true,
        lockedAt: true,
        lockedBy: true,
        lockedReason: true,
        unlockedAt: true,
        unlockedBy: true,
        exam: {
          select: {
            id: true,
            title: true,
            scheduledStartAt: true,
            scheduledEndAt: true,
          },
        },
      },
    });
    if (!attempt || attempt.studentId !== student.id) {
      throw new NotFoundException('Attempt tidak ditemukan.');
    }

    // Fase 3e: Cek apakah result sudah boleh dirilis
    const now = new Date();
    const isResultReleased = now >= attempt.exam.scheduledEndAt;
    const reveal = attempt.status === 'SUBMITTED' && isResultReleased;

    // Sudah terkumpul tapi hasil belum dirilis: soal & jawaban disembunyikan
    // sampai waktu ujian berakhir untuk semua peserta.
    if (attempt.status === 'SUBMITTED' && !isResultReleased) {
      return {
        ...attempt,
        resultReleased: isResultReleased,
        items: [],
      };
    }

    // IN_PROGRESS/LOCKED: kirim soal ter-sanitasi (tanpa kunci/pembahasan/
    // isCorrect) + jawaban siswa sendiri supaya refresh melanjutkan isian.
    // SUBMITTED + released: detail penuh termasuk kunci & pembahasan.
    const [items, answers] = await Promise.all([
      this.prisma.examItem.findMany({
        where: { examId: attempt.examId },
        orderBy: { sortOrder: 'asc' },
        include: {
          question: {
            select: {
              id: true,
              type: true,
              content: true,
              imageUrl: true,
              points: true,
              // Fase 3d anti-leak: kunci/pembahasan hanya setelah hasil dirilis
              answerKey: reveal,
              explanation: reveal,
              options: {
                orderBy: { sortOrder: 'asc' },
                select: {
                  id: true,
                  content: true,
                  sortOrder: true,
                  isCorrect: reveal,
                },
              },
            },
          },
        },
      }),
      this.prisma.examAnswer.findMany({
        where: { attemptId },
      }),
    ]);

    const answersMap = new Map(answers.map((a) => [a.questionId, a]));

    return {
      ...attempt,
      resultReleased: isResultReleased,
      items: items.map((item) => {
        const answer = answersMap.get(item.questionId);
        return {
          questionId: item.questionId,
          sortOrder: item.sortOrder,
          points: item.points,
          question: item.question,
          answer: answer
            ? {
                selectedOptionIds: answer.selectedOptionIds,
                textAnswer: answer.textAnswer,
                // Fase 3d anti-leak: isCorrect/score hanya setelah dirilis
                isCorrect: reveal ? answer.isCorrect : undefined,
                score: reveal ? answer.score : undefined,
              }
            : null,
        };
      }),
    };
  }

  /**
   * Autosave jawaban (debounce dari client).
   * Validasi: attempt IN_PROGRESS, question adalah bagian dari exam.
   * Fase 3d: cegah simpan jawaban jika attempt LOCKED.
   * Server-authoritative: tolak juga bila scheduled_end_at sudah lewat.
   */
  async saveAnswer(
    userId: string,
    attemptId: string,
    questionId: string,
    dto: SaveExamAnswerDto,
  ) {
    const student = await this.requireStudent(userId);
    const attempt = await this.prisma.examAttempt.findUnique({
      where: { id: attemptId },
      include: { exam: { select: { status: true, scheduledEndAt: true } } },
    });
    if (!attempt || attempt.studentId !== student.id) {
      throw new NotFoundException('Attempt tidak ditemukan.');
    }
    if (attempt.status === 'LOCKED') {
      throw new BadRequestException(
        'Attempt ini dikunci karena pelanggaran proctoring. Hubungi pengawas untuk membuka.',
      );
    }
    if (attempt.status !== 'IN_PROGRESS') {
      throw new BadRequestException('Attempt ini sudah dikumpulkan.');
    }
    if (attempt.exam.status === 'ENDED') {
      throw new BadRequestException(
        'Ujian sudah diakhiri pengawas. Jawaban tidak dapat disimpan lagi.',
      );
    }
    if (new Date() > attempt.exam.scheduledEndAt) {
      throw new BadRequestException(
        'Waktu ujian sudah habis. Jawaban tidak dapat disimpan lagi.',
      );
    }

    // Validate question is part of exam
    const item = await this.prisma.examItem.findUnique({
      where: {
        examId_questionId: {
          examId: attempt.examId,
          questionId,
        },
      },
    });
    if (!item) {
      throw new BadRequestException(
        'Soal tersebut bukan bagian dari ujian ini.',
      );
    }

    // Upsert answer (grading will be done on submit)
    return this.prisma.examAnswer.upsert({
      where: {
        attemptId_questionId: {
          attemptId,
          questionId,
        },
      },
      create: {
        attemptId,
        questionId,
        selectedOptionIds: dto.selectedOptionIds ?? [],
        textAnswer: dto.textAnswer,
      },
      update: {
        selectedOptionIds: dto.selectedOptionIds ?? [],
        textAnswer: dto.textAnswer,
      },
    });
  }

  /**
   * Manual submit oleh siswa.
   * Validasi: attempt IN_PROGRESS milik siswa, tolak bila LOCKED.
   * Submit terlambat tetap diterima (dicatat lateByMs) — hasil tetap
   * terkunci sampai scheduled_end_at (result release, Fase 3e).
   * Race-safe vs auto-submit via updateMany bersyarat.
   */
  async submit(userId: string, attemptId: string, _dto: SubmitExamDto) {
    const student = await this.requireStudent(userId);
    const attempt = await this.prisma.examAttempt.findUnique({
      where: { id: attemptId },
      include: {
        exam: {
          select: {
            status: true,
            scheduledEndAt: true,
          },
        },
      },
    });
    if (!attempt || attempt.studentId !== student.id) {
      throw new NotFoundException('Attempt tidak ditemukan.');
    }
    if (attempt.status === 'LOCKED') {
      throw new BadRequestException(
        'Attempt ini dikunci karena pelanggaran proctoring. Hubungi pengawas untuk membuka.',
      );
    }
    if (attempt.status !== 'IN_PROGRESS') {
      throw new BadRequestException('Attempt ini sudah dikumpulkan.');
    }
    if (attempt.exam.status === 'ENDED') {
      throw new BadRequestException(
        'Ujian sudah diakhiri pengawas. Hubungi pengawas bila perlu klarifikasi.',
      );
    }

    const now = new Date();
    const lateByMs = now.getTime() - attempt.exam.scheduledEndAt.getTime();
    const lateBy = lateByMs > 0 ? Math.floor(lateByMs) : null;

    // Grade the attempt
    const graded = await this.gradeAttempt(attemptId);

    // Finalisasi bersyarat (kalah race bila auto-submit menang lebih dulu)
    const finalized = await this.prisma.examAttempt.updateMany({
      where: { id: attemptId, status: 'IN_PROGRESS' },
      data: {
        status: 'SUBMITTED',
        submittedAt: now,
        score: graded.score,
        lateByMs: lateBy,
      },
    });
    if (finalized.count === 0) {
      throw new BadRequestException('Attempt ini sudah dikumpulkan.');
    }

    // Fase 4b: catat poin berdasar score_rules aktif (idempotent, gagal poin
    // tidak boleh menggagalkan submit yang sudah final).
    await this.safeAwardExamPoints(attemptId);

    return this.prisma.examAttempt.findUnique({ where: { id: attemptId } });
  }

  /**
   * Fase 4b: award poin untuk attempt yang sudah SUBMITTED.
   * Dibungkus try/catch supaya kegagalan pencatatan poin tidak mengubah
   * hasil submit — transaksi poin bisa dibuat ulang via endpoint admin.
   */
  private async safeAwardExamPoints(attemptId: string) {
    try {
      await this.pointTransactions.createExamTransaction(attemptId);
    } catch (error) {
      console.error(
        `[ExamAttempts] Gagal mencatat poin untuk attempt ${attemptId}:`,
        error,
      );
    }
  }

  /**
   * Grade attempt (hitung skor berdasarkan jawaban).
   * Dipanggil saat submit (manual atau auto-submit). Idempotent: aman
   * dipanggil ulang (mis. scheduler jalan 2x) karena update per-answer
   * memakai upsert-style guard (skip bila baris jawaban tidak ada).
   */
  private async gradeAttempt(attemptId: string) {
    const attempt = await this.prisma.examAttempt.findUnique({
      where: { id: attemptId },
      include: {
        exam: {
          include: {
            items: {
              include: {
                question: {
                  include: {
                    options: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!attempt) throw new NotFoundException('Attempt tidak ditemukan.');

    const answers = await this.prisma.examAnswer.findMany({
      where: { attemptId },
    });

    const answersMap = new Map(answers.map((a) => [a.questionId, a]));
    let totalScore = 0;

    // Grade each question
    for (const item of attempt.exam.items) {
      const answer = answersMap.get(item.questionId);
      if (!answer) continue;

      const question = item.question;
      let isCorrect = false;
      let questionScore = 0;

      // Auto-grade for choice questions
      if (question.type === 'SINGLE_CHOICE' || question.type === 'TRUE_FALSE') {
        const correctOption = question.options.find((o) => o.isCorrect);
        if (
          correctOption &&
          answer.selectedOptionIds.length === 1 &&
          answer.selectedOptionIds[0] === correctOption.id
        ) {
          isCorrect = true;
          questionScore = item.points;
        }
      } else if (question.type === 'MULTIPLE_CHOICE') {
        const correctOptions = question.options
          .filter((o) => o.isCorrect)
          .map((o) => o.id);
        if (
          answer.selectedOptionIds.length === correctOptions.length &&
          answer.selectedOptionIds.every((id) => correctOptions.includes(id))
        ) {
          isCorrect = true;
          questionScore = item.points;
        }
      } else if (question.type === 'SHORT_ANSWER' && question.answerKey) {
        // Case-insensitive match for short answer
        if (
          answer.textAnswer?.trim().toLowerCase() ===
          question.answerKey.trim().toLowerCase()
        ) {
          isCorrect = true;
          questionScore = item.points;
        }
      }
      // Essay questions cannot be auto-graded (score = 0, pending manual grading)

      // Update answer with grading result (guard: baris bisa hilang via cascade)
      const existing = answersMap.get(item.questionId);
      if (!existing) continue;
      await this.prisma.examAnswer.update({
        where: { id: existing.id },
        data: {
          isCorrect,
          score: questionScore,
        },
      });

      totalScore += questionScore;
    }

    return { score: totalScore };
  }

  /**
   * Akhiri ujian manual (PUBLISHED → ENDED).
   * Urutan penting: tandai ENDED dulu supaya siswa tidak bisa lagi
   * mulai/simpan jawaban, baru auto-submit semua attempt IN_PROGRESS
   * via autoSubmit (idempotent, race-safe, + poin + audit).
   * Attempt LOCKED dibiarkan — unlock manual tetap bisa, lalu worker
   * auto-submit menangkapnya (status ENDED tetap memblokir jawaban baru).
   */
  async endExam(examId: string) {
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      select: { id: true, status: true },
    });
    if (!exam) throw new NotFoundException('Ujian tidak ditemukan.');
    if (exam.status !== 'PUBLISHED') {
      throw new BadRequestException(
        'Hanya ujian berstatus PUBLISHED yang bisa diakhiri.',
      );
    }

    await this.prisma.exam.update({
      where: { id: examId },
      data: { status: 'ENDED' },
    });

    const inProgress = await this.prisma.examAttempt.findMany({
      where: { examId, status: 'IN_PROGRESS' },
      select: { id: true },
    });
    for (const a of inProgress) {
      await this.autoSubmit(a.id);
    }

    const summary = await this.prisma.examAttempt.groupBy({
      by: ['status'],
      where: { examId },
      _count: { _all: true },
    });
    return {
      examId,
      status: 'ENDED' as const,
      autoSubmitted: inProgress.length,
      attemptSummary: summary.map((s) => ({
        status: s.status,
        count: s._count._all,
      })),
    };
  }

  /**
   * Auto-submit attempt (dipanggil oleh scheduler).
   * Tidak ada validasi userId - ini dipanggil oleh sistem.
   * Fase 3d: skip LOCKED attempts (harus di-unlock manual dulu).
   * Idempotent & race-safe: grading deterministik (aman dipanggil 2x),
   * transisi final IN_PROGRESS -> SUBMITTED dijaga via updateMany bersyarat
   * sehingga hanya 1 worker yang menang bila scheduler overlap.
   */
  async autoSubmit(attemptId: string) {
    const attempt = await this.prisma.examAttempt.findUnique({
      where: { id: attemptId },
      include: {
        exam: {
          select: {
            scheduledEndAt: true,
          },
        },
      },
    });
    if (!attempt || attempt.status !== 'IN_PROGRESS') {
      return; // Sudah SUBMITTED/LOCKED oleh worker lain, atau tidak ditemukan.
    }

    const now = new Date();
    const lateByMs = now.getTime() - attempt.exam.scheduledEndAt.getTime();
    const lateBy = lateByMs > 0 ? Math.floor(lateByMs) : null;

    // Grade the attempt (idempotent: recompute deterministik per answer)
    const graded = await this.gradeAttempt(attemptId);

    // Finalisasi bersyarat: hanya menang bila masih IN_PROGRESS.
    const finalized = await this.prisma.examAttempt.updateMany({
      where: { id: attemptId, status: 'IN_PROGRESS' },
      data: {
        status: 'SUBMITTED',
        submittedAt: now,
        score: graded.score,
        lateByMs: lateBy,
      },
    });
    if (finalized.count === 0) {
      return; // Kalah race (siswa submit manual / worker lain lebih dulu).
    }

    // Fase 6: auto-submit oleh sistem tetap dicatat di audit log (actor null = SYSTEM).
    await this.audit.log({
      actorId: null,
      action: 'EXAM_ATTEMPT_AUTO_SUBMITTED',
      entity: 'ExamAttempt',
      entityId: attemptId,
      newData: { score: graded.score, lateByMs: lateBy },
    });

    // Fase 4b: catat poin untuk auto-submit juga (idempotent).
    await this.safeAwardExamPoints(attemptId);

    return this.prisma.examAttempt.findUnique({ where: { id: attemptId } });
  }

  /**
   * Get student's attempts for an exam.
   * Fase 3d: include proctoring status fields.
   * Fase 3e: result release lock - hanya kirim skor setelah scheduled_end_at terlewati.
   */
  async getStudentAttempts(userId: string, examId: string) {
    const student = await this.requireStudent(userId);
    const attempts = await this.prisma.examAttempt.findMany({
      where: { examId, studentId: student.id },
      select: {
        id: true,
        examId: true,
        studentId: true,
        status: true,
        score: true,
        maxScore: true,
        startedAt: true,
        submittedAt: true,
        lateByMs: true,
        violationCount: true,
        lockedAt: true,
        lockedBy: true,
        lockedReason: true,
        unlockedAt: true,
        unlockedBy: true,
        exam: {
          select: {
            id: true,
            title: true,
            scheduledEndAt: true,
          },
        },
      },
      orderBy: { startedAt: 'desc' },
    });

    // Fase 3e: Cek result release untuk setiap attempt
    const now = new Date();
    return attempts.map((attempt) => ({
      ...attempt,
      resultReleased: now >= attempt.exam.scheduledEndAt,
      // Jika belum dirilis, sembunyikan skor
      score: now >= attempt.exam.scheduledEndAt ? attempt.score : null,
    }));
  }

  /**
   * Get semua attempt yang statusnya LOCKED (lintas exam/kelompok/program).
   * Dipakai halaman proctor untuk melihat & memutuskan unlock — permission
   * `exam_proctor.unlock` bersifat global, bukan dibatasi relasi tutor-siswa.
   */
  async getLockedAttempts() {
    return this.prisma.examAttempt.findMany({
      where: { status: 'LOCKED' },
      select: {
        id: true,
        examId: true,
        studentId: true,
        status: true,
        violationCount: true,
        lockedAt: true,
        lockedBy: true,
        lockedReason: true,
        startedAt: true,
        student: {
          select: {
            id: true,
            user: { select: { name: true, email: true } },
          },
        },
        exam: {
          select: {
            id: true,
            title: true,
            scheduledStartAt: true,
            scheduledEndAt: true,
          },
        },
      },
      orderBy: { lockedAt: 'desc' },
    });
  }

  /**
   * Get all attempts for an exam (for admin/tutor).
   * Fase 3d: include proctoring status fields.
   */
  async getExamAttempts(examId: string) {
    return this.prisma.examAttempt.findMany({
      where: { examId },
      select: {
        id: true,
        examId: true,
        studentId: true,
        status: true,
        score: true,
        maxScore: true,
        startedAt: true,
        submittedAt: true,
        lateByMs: true,
        violationCount: true,
        lockedAt: true,
        lockedBy: true,
        lockedReason: true,
        unlockedAt: true,
        unlockedBy: true,
        student: {
          select: {
            id: true,
            user: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        },
        exam: {
          select: {
            id: true,
            title: true,
          },
        },
      },
      orderBy: { startedAt: 'desc' },
    });
  }
}
