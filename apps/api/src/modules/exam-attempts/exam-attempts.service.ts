import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { PhoneVerificationService } from '../../common/phone-verification/phone-verification.service';
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
    private readonly phoneVerification: PhoneVerificationService,
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
    // Mulai ujian butuh nomor HP terverifikasi — akun daftar-mandiri
    // (mis. siswa luar via kode/token) harus membuktikan nomornya dulu.
    await this.phoneVerification.assertVerified(userId);

    // Get exam with validation (throw bila tidak valid untuk siswa)
    await this.exams.getForStudent(examId, actor);

    // Satu siswa = satu attempt per ujian. Attempt kedua hanya bisa dibuat
    // setelah attempt lama di-reset (dihapus) oleh pengawas/admin.
    const existing = await this.prisma.examAttempt.findFirst({
      where: { examId, studentId: student.id },
      orderBy: { startedAt: 'desc' },
    });
    if (existing?.status === 'IN_PROGRESS') {
      throw new BadRequestException(
        'Anda sudah memiliki attempt yang sedang berjalan untuk ujian ini — lanjutkan dari daftar ujian.',
      );
    }
    if (existing) {
      throw new BadRequestException(
        'Anda sudah mengerjakan ujian ini. Hubungi pengawas/admin untuk mereset sesi bila perlu mengulang.',
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

    // @@unique(examId, studentId) menjaga invariant atomik — dua request
    // paralel yang sama-sama lolos cek di atas tetap hanya menghasilkan
    // satu attempt; yang kalah race dapat P2002 → pesan ramah.
    try {
      return await this.prisma.examAttempt.create({
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
    } catch (e) {
      if (
        typeof e === 'object' &&
        e !== null &&
        (e as { code?: string }).code === 'P2002'
      ) {
        throw new BadRequestException(
          'Anda sudah mengerjakan ujian ini. Hubungi pengawas/admin untuk mereset sesi bila perlu mengulang.',
        );
      }
      throw e;
    }
  }

  /**
   * Get attempt detail for student (with current answers).
   * Fase 3d: include proctoring status fields.
   * Fase 3e: result release lock - hanya kirim detail jawaban setelah scheduled_end_at terlewati.
   */
  async getAttemptDetail(userId: string, attemptId: string) {
    const student = await this.requireStudent(userId);
    // Pre-check ringan: attempt yang tertinggal IN_PROGRESS/LOCKED padahal
    // ujiannya sudah berakhir diselesaikan di sini (fallback bila scheduler
    // belum sempat jalan) — tanpa ini hasil tidak pernah dirilis.
    const pre = await this.prisma.examAttempt.findUnique({
      where: { id: attemptId },
      select: {
        studentId: true,
        status: true,
        exam: { select: { status: true, scheduledEndAt: true } },
      },
    });
    if (!pre || pre.studentId !== student.id) {
      throw new NotFoundException('Attempt tidak ditemukan.');
    }
    const finished =
      pre.exam.status === 'ENDED' ||
      Date.now() >= pre.exam.scheduledEndAt.getTime();
    if (['IN_PROGRESS', 'LOCKED'].includes(pre.status) && finished) {
      await this.autoSubmit(attemptId);
    }

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
            status: true,
            scheduledStartAt: true,
            scheduledEndAt: true,
            proctoringEnabled: true,
            showResultImmediately: true,
            subtes: {
              orderBy: { sortOrder: 'asc' as const },
              select: { id: true, name: true, durationMinutes: true, sortOrder: true },
            },
          },
        },
        subtesStates: {
          select: { subtesId: true, startedAt: true, submittedAt: true },
        },
      },
    });
    if (!attempt || attempt.studentId !== student.id) {
      throw new NotFoundException('Attempt tidak ditemukan.');
    }

    // Hasil: mode "langsung lihat" → rilis segera setelah submit; mode
    // default → tunggu jadwal berakhir ATAU pengawas mengakhiri (ENDED).
    const now = new Date();
    const isResultReleased = attempt.exam.showResultImmediately
      ? attempt.status === 'SUBMITTED'
      : attempt.exam.status === 'ENDED' || now >= attempt.exam.scheduledEndAt;
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
              stimulus: true,
                stimulusImageUrl: true,
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
                  imageUrl: true,
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

    // Rekap per subtes (try out multi-mapel) — dihitung saat hasil dirilis.
    // Selagi mengerjakan, subtesResults berisi progres jawaban saja.
    const subtesName = new Map(attempt.exam.subtes.map((s) => [s.id, s.name]));
    const subtesAgg = new Map<string, { subtesId: string; name: string; total: number; correct: number; score: number; maxScore: number }>();
    for (const it of items) {
      if (!it.subtesId) continue;
      const agg = subtesAgg.get(it.subtesId) ?? {
        subtesId: it.subtesId,
        name: subtesName.get(it.subtesId) ?? 'Subtes',
        total: 0,
        correct: 0,
        score: 0,
        maxScore: 0,
      };
      agg.total += 1;
      agg.maxScore += it.points;
      const ans = answersMap.get(it.questionId);
      if (ans) {
        if (ans.isCorrect === true) agg.correct += 1;
        agg.score += ans.score ?? 0;
      }
      subtesAgg.set(it.subtesId, agg);
    }

    return {
      ...attempt,
      resultReleased: isResultReleased,
      subtesStates: attempt.subtesStates,
      subtesResults: reveal ? [...subtesAgg.values()] : [],
      items: items.map((item) => {
        const answer = answersMap.get(item.questionId);
        return {
          questionId: item.questionId,
          sortOrder: item.sortOrder,
          points: item.points,
          subtesId: item.subtesId,
          subtesName: item.subtesId ? (subtesName.get(item.subtesId) ?? null) : null,
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
    // Ujian dijeda (LOCKED) — semua interaksi pengerjaan ikut dibekukan.
    if (attempt.exam.status === 'LOCKED') {
      throw new BadRequestException(
        'Ujian sedang dijeda pengawas — lanjutkan setelah dibuka kembali.',
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

    // Ujian ber-subtes: jawaban hanya diterima selama subtes aktif
    // (sudah dimulai, belum dikumpulkan, durasi belum habis).
    if (item.subtesId) {
      await this.assertSubtesWritable(attemptId, item.subtesId);
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
   * Pastikan subtes boleh ditulis — state ada, belum dikumpulkan,
   * durasi belum habis. Durasi lewat → subtes otomatis ditandai
   * selesai dan jawaban baru ditolak.
   */
  private async assertSubtesWritable(attemptId: string, subtesId: string) {
    const st = await this.prisma.examAttemptSubtes.findUnique({
      where: { attemptId_subtesId: { attemptId, subtesId } },
      include: { subtes: { select: { name: true, durationMinutes: true } } },
    });
    if (!st) {
      throw new BadRequestException('Subtes belum dimulai — tekan "Mulai Subtes" dulu.');
    }
    if (st.submittedAt) {
      throw new BadRequestException('Subtes ini sudah dikumpulkan.');
    }
    if (
      st.subtes.durationMinutes > 0 &&
      Date.now() > st.startedAt.getTime() + st.subtes.durationMinutes * 60_000
    ) {
      await this.prisma.examAttemptSubtes.update({
        where: { id: st.id },
        data: { submittedAt: new Date() },
      });
      throw new BadRequestException(
        `Waktu subtes "${st.subtes.name}" sudah habis — jawaban tidak lagi disimpan.`,
      );
    }
  }

  /**
   * Mulai subtes dalam attempt — menandai timer subtes berjalan.
   * Urutan: semua subtes sebelumnya (sortOrder lebih kecil) harus sudah
   * dikumpulkan; subtes yang sama tidak bisa dimulai ulang.
   */
  async startSubtes(userId: string, attemptId: string, subtesId: string) {
    const student = await this.requireStudent(userId);
    const attempt = await this.prisma.examAttempt.findUnique({
      where: { id: attemptId },
      include: {
        exam: {
          select: {
            status: true,
            scheduledEndAt: true,
            subtes: { orderBy: { sortOrder: 'asc' as const }, select: { id: true, name: true } },
          },
        },
      },
    });
    if (!attempt || attempt.studentId !== student.id) {
      throw new NotFoundException('Attempt tidak ditemukan.');
    }
    if (attempt.status !== 'IN_PROGRESS') {
      throw new BadRequestException('Attempt ini sudah dikumpulkan.');
    }
    if (attempt.exam.status === 'LOCKED') {
      throw new BadRequestException(
        'Ujian sedang dijeda pengawas — lanjutkan setelah dibuka kembali.',
      );
    }
    if (attempt.exam.status === 'ENDED' || new Date() > attempt.exam.scheduledEndAt) {
      throw new BadRequestException('Waktu ujian sudah habis.');
    }
    const order = attempt.exam.subtes.map((s) => s.id);
    const idx = order.indexOf(subtesId);
    if (idx === -1) throw new BadRequestException('Subtes bukan bagian ujian ini.');
    // Urutan wajib — subtes sebelumnya harus submitted.
    const prevIds = order.slice(0, idx);
    if (prevIds.length) {
      const done = await this.prisma.examAttemptSubtes.findMany({
        where: { attemptId, subtesId: { in: prevIds }, submittedAt: { not: null } },
        select: { subtesId: true },
      });
      if (done.length !== prevIds.length) {
        throw new BadRequestException('Selesaikan subtes sebelumnya dulu.');
      }
    }
    const existing = await this.prisma.examAttemptSubtes.findUnique({
      where: { attemptId_subtesId: { attemptId, subtesId } },
    });
    if (existing?.submittedAt) {
      throw new BadRequestException('Subtes ini sudah dikumpulkan.');
    }
    if (existing) return existing; // idempotent — refresh tak mereset timer
    return this.prisma.examAttemptSubtes.create({
      data: { attemptId, subtesId },
    });
  }

  /**
   * Kumpulkan subtes — mengunci jawaban subtes dan membuka subtes berikutnya.
   * Belum tentu mengakhiri attempt; submit ujian tetap terpisah.
   */
  async submitSubtes(userId: string, attemptId: string, subtesId: string) {
    const student = await this.requireStudent(userId);
    const attempt = await this.prisma.examAttempt.findUnique({
      where: { id: attemptId },
      select: {
        studentId: true,
        status: true,
        exam: { select: { status: true } },
      },
    });
    if (!attempt || attempt.studentId !== student.id) {
      throw new NotFoundException('Attempt tidak ditemukan.');
    }
    if (attempt.status !== 'IN_PROGRESS') {
      throw new BadRequestException('Attempt ini sudah dikumpulkan.');
    }
    if (attempt.exam.status === 'LOCKED') {
      throw new BadRequestException(
        'Ujian sedang dijeda pengawas — lanjutkan setelah dibuka kembali.',
      );
    }
    const st = await this.prisma.examAttemptSubtes.findUnique({
      where: { attemptId_subtesId: { attemptId, subtesId } },
    });
    if (!st) throw new BadRequestException('Subtes belum dimulai.');
    if (st.submittedAt) return st; // idempotent
    return this.prisma.examAttemptSubtes.update({
      where: { id: st.id },
      data: { submittedAt: new Date() },
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
            subtes: { select: { id: true } },
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
    if (attempt.exam.status === 'LOCKED') {
      throw new BadRequestException(
        'Ujian sedang dijeda pengawas — kumpulkan setelah dibuka kembali.',
      );
    }

    // Ujian bersubtes: subtes yang masih terbuka ikut ditutup saat
    // siswa menekan "Kumpulkan Ujian".
    if (attempt.exam.subtes.length) {
      await this.prisma.examAttemptSubtes.updateMany({
        where: { attemptId, submittedAt: null },
        data: { submittedAt: new Date() },
      });
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

    // Kembalikan detail penuh (exam + items + jawaban) — client menimpa
    // cache attempt dengan respons ini; payload tanpa relasi membuat
    // halaman attempt crash saat render (exam.proctoringEnabled dll.).
    return this.getAttemptDetail(userId, attemptId);
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
    // Kumpulkan update per-jawaban lalu kirim dalam SATU transaksi —
    // sebelumnya N round-trip sequential per attempt; saat auto-submit
    // massal (ujian besar berakhir) itu membebani DB.
    const updates: Parameters<typeof this.prisma.examAnswer.update>[0][] = [];

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

      updates.push({
        where: { id: answer.id },
        data: { isCorrect, score: questionScore },
      });
      totalScore += questionScore;
    }

    if (updates.length) {
      await this.prisma.$transaction(
        updates.map((u) => this.prisma.examAnswer.update(u)),
      );
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
    // LOCKED = ujian dijeda — juga bisa langsung diakhiri.
    if (exam.status !== 'PUBLISHED' && exam.status !== 'LOCKED') {
      throw new BadRequestException(
        'Hanya ujian berstatus PUBLISHED/dijeda yang bisa diakhiri.',
      );
    }

    await this.prisma.exam.update({
      where: { id: examId },
      data: { status: 'ENDED' },
    });

    // IN_PROGRESS + LOCKED ikut di-submit — jawaban apa adanya ikut dinilai.
    const inProgress = await this.prisma.examAttempt.findMany({
      where: { examId, status: { in: ['IN_PROGRESS', 'LOCKED'] } },
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
    // LOCKED juga di-submit — dipanggil scheduler saat waktu habis / endExam.
    if (!attempt || !['IN_PROGRESS', 'LOCKED'].includes(attempt.status)) {
      return; // Sudah SUBMITTED oleh worker lain, atau tidak ditemukan.
    }

    const now = new Date();
    const lateByMs = now.getTime() - attempt.exam.scheduledEndAt.getTime();
    const lateBy = lateByMs > 0 ? Math.floor(lateByMs) : null;

    // Grade the attempt (idempotent: recompute deterministik per answer)
    const graded = await this.gradeAttempt(attemptId);

    // Finalisasi bersyarat: hanya menang bila belum SUBMITTED.
    const finalized = await this.prisma.examAttempt.updateMany({
      where: { id: attemptId, status: { in: ['IN_PROGRESS', 'LOCKED'] } },
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
            status: true,
            scheduledEndAt: true,
            showResultImmediately: true,
          },
        },
      },
      orderBy: { startedAt: 'desc' },
    });

    // Attempt tertinggal (lupa kumpulkan / ujian lewat sebelum scheduler
    // jalan) diselesaikan di sini supaya hasilnya tetap bisa dirilis.
    const now = new Date();
    for (const a of attempts) {
      const finished =
        a.exam.status === 'ENDED' ||
        now.getTime() >= a.exam.scheduledEndAt.getTime();
      if (finished && ['IN_PROGRESS', 'LOCKED'].includes(a.status)) {
        const res = await this.autoSubmit(a.id);
        if (res) {
          a.status = 'SUBMITTED';
          a.submittedAt = res.submittedAt;
          a.score = res.score;
        }
      }
    }

    // Rilis hasil: mode langsung → skor terlihat begitu SUBMITTED;
    // mode default → tunggu jadwal berakhir / ujian diakhiri pengawas.
    return attempts.map((attempt) => {
      const released = attempt.exam.showResultImmediately
        ? attempt.status === 'SUBMITTED'
        : attempt.exam.status === 'ENDED' || now >= attempt.exam.scheduledEndAt;
      return {
        ...attempt,
        resultReleased: released,
        // Jika belum dirilis, sembunyikan skor
        score: released ? attempt.score : null,
      };
    });
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

  /**
   * Reset sesi pengerjaan — hapus attempt beserta jawaban & progres subtes
   * (cascade) supaya siswa bisa mengerjakan ujian dari awal lagi.
   * Dipanggil admin/tutor dari halaman proctoring. Mengembalikan info
   * attempt yang dihapus untuk audit log.
   */
  async resetAttempt(attemptId: string) {
    const attempt = await this.prisma.examAttempt.findUnique({
      where: { id: attemptId },
      include: { student: { select: { user: { select: { name: true } } } } },
    });
    if (!attempt) throw new NotFoundException('Attempt tidak ditemukan.');
    await this.prisma.examAttempt.delete({ where: { id: attemptId } });
    return {
      success: true,
      examId: attempt.examId,
      studentName: attempt.student.user?.name ?? null,
      status: attempt.status,
    };
  }

  /**
   * Review attempt untuk penilaian manual (staff/proctoring): semua soal +
   * jawaban siswa + poin tiap item — tanpa batasan anti-leak karena dipakai
   * admin/tutor yang mengoreksi esai/isian singkat.
   */
  async getAttemptReview(attemptId: string) {
    const attempt = await this.prisma.examAttempt.findUnique({
      where: { id: attemptId },
      include: {
        exam: {
          select: {
            id: true,
            title: true,
            items: {
              orderBy: { sortOrder: 'asc' },
              include: {
                question: {
                  include: { options: { orderBy: { sortOrder: 'asc' } } },
                },
              },
            },
          },
        },
        student: {
          select: { id: true, user: { select: { name: true, email: true } } },
        },
        answers: true,
      },
    });
    if (!attempt) throw new NotFoundException('Attempt tidak ditemukan.');
    const byQ = new Map(attempt.answers.map((a) => [a.questionId, a]));
    return {
      id: attempt.id,
      status: attempt.status,
      score: attempt.score,
      maxScore: attempt.maxScore,
      examTitle: attempt.exam.title,
      student: attempt.student.user,
      items: attempt.exam.items.map((it) => {
        const ans = byQ.get(it.questionId);
        return {
          questionId: it.questionId,
          sortOrder: it.sortOrder,
          points: it.points,
          question: {
            type: it.question.type,
            content: it.question.content,
            answerKey: it.question.answerKey,
            options: it.question.options.map((o) => ({
              id: o.id,
              content: o.content,
              isCorrect: o.isCorrect,
            })),
          },
          answer: ans
            ? {
                selectedOptionIds: ans.selectedOptionIds,
                textAnswer: ans.textAnswer,
                isCorrect: ans.isCorrect,
                score: ans.score,
              }
            : null,
        };
      }),
    };
  }

  /**
   * Koreksi manual skor satu jawaban (esai/isian singkat, tapi boleh juga
   * untuk tipe lain) — dibatasi 0 s.d. poin soal di ujian ini, lalu total
   * skor attempt dihitung ulang dari semua jawaban.
   */
  async gradeAnswer(attemptId: string, questionId: string, score: number) {
    const attempt = await this.prisma.examAttempt.findUnique({
      where: { id: attemptId },
      include: { exam: { select: { items: true } } },
    });
    if (!attempt) throw new NotFoundException('Attempt tidak ditemukan.');
    const item = attempt.exam.items.find((i) => i.questionId === questionId);
    if (!item) throw new NotFoundException('Soal tidak ada di ujian ini.');
    if (!Number.isFinite(score)) {
      throw new BadRequestException('Skor harus berupa angka.');
    }
    const clamped = Math.max(0, Math.min(item.points, Math.round(score)));
    await this.prisma.examAnswer.upsert({
      where: { attemptId_questionId: { attemptId, questionId } },
      create: {
        attemptId,
        questionId,
        score: clamped,
        isCorrect: clamped >= item.points ? true : clamped === 0 ? false : null,
      },
      update: {
        score: clamped,
        isCorrect: clamped >= item.points ? true : clamped === 0 ? false : null,
      },
    });
    const agg = await this.prisma.examAnswer.aggregate({
      _sum: { score: true },
      where: { attemptId },
    });
    const total = agg._sum.score ?? 0;
    await this.prisma.examAttempt.update({
      where: { id: attemptId },
      data: { score: total },
    });
    return { answerScore: clamped, score: total, maxScore: attempt.maxScore };
  }
}
