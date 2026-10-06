/**
 * Fase 4a — Analytics Service
 * Per-question analytics & student performance dashboard
 * Uses data from Fase 3 (exam_attempts, exam_answers) as source
 * Does NOT duplicate exam schema - pure aggregation
 */
import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { PrismaService } from '../../common/prisma/prisma.service';

/** Escape teks untuk render HTML cetak. */
function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const MONTH_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

function fmtDateId(d: Date | string | null | undefined): string {
  if (!d) return '-';
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '-';
  return `${dt.getDate()} ${MONTH_ID[dt.getMonth()]} ${dt.getFullYear()}`;
}

/** Huruf opsi (A, B, C…) dari index urutan opsi. */
function optionLetter(i: number): string {
  return String.fromCharCode(65 + i);
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get per-question analytics for a specific question
   * Includes: attempt count, accuracy, option distribution, response time
   */
  async getQuestionAnalytics(questionId: string) {
    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
      include: { options: { orderBy: { sortOrder: 'asc' } } },
    });

    if (!question) {
      throw new NotFoundException('Question not found');
    }

    // Get all answers for this question from exam attempts
    const answers = await this.prisma.examAnswer.findMany({
      where: { questionId },
      include: {
        attempt: {
          select: {
            startedAt: true,
            submittedAt: true,
          },
        },
      },
    });

    const totalAttempts = answers.length;
    const correctAttempts = answers.filter((a) => a.isCorrect === true).length;
    const accuracy = totalAttempts > 0 ? (correctAttempts / totalAttempts) * 100 : 0;

    // Calculate option distribution
    const optionDistribution = question.options.map((option) => {
      const selectedCount = answers.filter((a) =>
        a.selectedOptionIds.includes(option.id),
      ).length;
      const selectionRate = totalAttempts > 0 ? (selectedCount / totalAttempts) * 100 : 0;

      return {
        optionId: option.id,
        optionContent: option.content,
        isCorrect: option.isCorrect,
        selectedCount,
        selectionRate,
      };
    });

    // Calculate average response time (for submitted attempts only)
    const completedAttempts = answers.filter((a) => a.attempt.submittedAt);
    let avgResponseTimeMs: number | undefined;
    if (completedAttempts.length > 0) {
      const totalTime = completedAttempts.reduce((sum, answer) => {
        const attempt = answer.attempt;
        const duration = attempt.submittedAt!.getTime() - attempt.startedAt.getTime();
        return sum + duration;
      }, 0);
      avgResponseTimeMs = totalTime / completedAttempts.length;
    }

    return {
      questionId: question.id,
      questionContent: question.content,
      questionType: question.type,
      totalAttempts,
      correctAttempts,
      accuracy: Math.round(accuracy * 100) / 100,
      optionDistribution,
      avgResponseTimeMs,
    };
  }

  /**
   * Get per-question analytics for all questions in an exam
   */
  async getExamQuestionAnalytics(examId: string) {
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      include: {
        items: {
          include: {
            question: {
              include: { options: { orderBy: { sortOrder: 'asc' } } },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!exam) {
      throw new NotFoundException('Exam not found');
    }

    const analytics = await Promise.all(
      exam.items.map(async (item) => {
        return this.getQuestionAnalytics(item.questionId);
      }),
    );

    return {
      examId: exam.id,
      examTitle: exam.title,
      questionAnalytics: analytics,
    };
  }

  /**
   * Get student performance dashboard
   * Includes: score trends across exams, weak/strong topics based on tags/categories
   */
  async getStudentPerformance(studentId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { user: { select: { name: true } } },
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    // Get all submitted exam attempts for this student
    const attempts = await this.prisma.examAttempt.findMany({
      where: {
        studentId,
        status: 'SUBMITTED',
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
      orderBy: { submittedAt: 'desc' },
    });

    // Build exam history
    const examHistory = attempts.map((attempt) => {
      const percentage = attempt.maxScore > 0
        ? (attempt.score / attempt.maxScore) * 100
        : 0;

      return {
        examId: attempt.exam.id,
        examTitle: attempt.exam.title,
        examDate: attempt.exam.scheduledEndAt,
        score: attempt.score,
        maxScore: attempt.maxScore,
        percentage: Math.round(percentage * 100) / 100,
      };
    });

    // Get topic analysis based on question difficulty/program/level
    const topicAnalysis = await this.buildTopicAnalysis(studentId);

    // Grafik perkembangan nilai per bab (kategori soal) antar ujian.
    const categoryProgress = await this.buildCategoryProgress(studentId);

    // Calculate overall stats
    const overallStats = this.calculateOverallStats(examHistory);

    return {
      studentId: student.id,
      studentName: student.user.name,
      examHistory,
      topicAnalysis,
      categoryProgress,
      overallStats,
    };
  }

  /**
   * Perkembangan nilai per bab (question.category) dari ujian ke ujian.
   * Output: { categories: string[], points: [{attemptId, examTitle, date,
   *   perCategory: {<cat>: {correct,total,percent}} }] } — tiap titik satu
   * attempt SUBMITTED, diurut kronologis untuk sumbu-X chart.
   */
  private async buildCategoryProgress(studentId: string) {
    const attempts = await this.prisma.examAttempt.findMany({
      where: { studentId, status: 'SUBMITTED' },
      orderBy: { submittedAt: 'asc' },
      take: 40,
      select: {
        id: true,
        submittedAt: true,
        exam: {
          select: {
            title: true,
            items: {
              select: {
                points: true,
                question: { select: { id: true, category: true } },
              },
            },
          },
        },
        answers: {
          select: {
            questionId: true,
            score: true,
            isCorrect: true,
          },
        },
      },
    });

    // Nama kategori diresolve dari definisi tipe konten (Bab 1, dsb.).
    const catDefs = await this.prisma.contentCategoryDef.findMany({
      select: { code: true, name: true },
    });
    const catName = new Map(catDefs.map((c) => [c.code, c.name]));

    const categories: string[] = [];
    const seen = new Set<string>();
    const points = attempts.map((attempt) => {
      const perCategory: Record<
        string,
        { correct: number; total: number; score: number; maxScore: number; percent: number }
      > = {};
      const answerByQ = new Map(attempt.answers.map((a) => [a.questionId, a]));

      for (const item of attempt.exam.items) {
        const code = item.question.category || 'UMUM';
        const label = catName.get(code) ?? code;
        if (!seen.has(label)) {
          seen.add(label);
          categories.push(label);
        }
        const cell =
          perCategory[label] ??
          { correct: 0, total: 0, score: 0, maxScore: 0, percent: 0 };
        cell.total += 1;
        cell.maxScore += item.points ?? 0;
        const ans = answerByQ.get(item.question.id);
        if (ans) {
          cell.score += ans.score;
          if (ans.isCorrect === true) cell.correct += 1;
        }
        perCategory[label] = cell;
      }
      for (const c of Object.values(perCategory)) {
        c.percent = c.maxScore > 0 ? Math.round((c.score / c.maxScore) * 100) : 0;
      }
      return {
        attemptId: attempt.id,
        examTitle: attempt.exam.title,
        date: attempt.submittedAt,
        perCategory,
      };
    });

    return { categories, points };
  }

  /**
   * Build topic analysis by grouping questions by program/level/difficulty
   */
  private async buildTopicAnalysis(studentId: string) {
    // Get all answers for this student
    const answers = await this.prisma.examAnswer.findMany({
      where: {
        attempt: {
          studentId,
          status: 'SUBMITTED',
        },
      },
      include: {
        question: {
          select: {
            id: true,
            programId: true,
            levelId: true,
            difficulty: true,
            type: true,
          },
        },
      },
    });

    // Group by difficulty as a simple topic classification
    const topicGroups = new Map<string, {
      totalQuestions: number;
      correctCount: number;
      totalScore: number;
      questionCount: number;
    }>();

    for (const answer of answers) {
      const question = answer.question;
      const topicKey = question.difficulty || 'MEDIUM';
      const topicName = `${topicKey} Difficulty`;

      if (!topicGroups.has(topicName)) {
        topicGroups.set(topicName, {
          totalQuestions: 0,
          correctCount: 0,
          totalScore: 0,
          questionCount: 0,
        });
      }

      const group = topicGroups.get(topicName)!;
      group.totalQuestions++;
      group.questionCount++;
      group.totalScore += answer.score;

      if (answer.isCorrect === true) {
        group.correctCount++;
      }
    }

    // Convert to topic analysis array
    const topicAnalysis = Array.from(topicGroups.entries()).map(([topicName, data]) => {
      const accuracy = data.totalQuestions > 0
        ? (data.correctCount / data.totalQuestions) * 100
        : 0;
      const avgScore = data.questionCount > 0
        ? data.totalScore / data.questionCount
        : 0;

      let weaknessLevel: 'STRONG' | 'AVERAGE' | 'WEAK';
      if (accuracy >= 80) weaknessLevel = 'STRONG';
      else if (accuracy >= 50) weaknessLevel = 'AVERAGE';
      else weaknessLevel = 'WEAK';

      return {
        topicName,
        totalQuestions: data.totalQuestions,
        correctCount: data.correctCount,
        accuracy: Math.round(accuracy * 100) / 100,
        avgScore: Math.round(avgScore * 100) / 100,
        weaknessLevel,
      };
    });

    return topicAnalysis;
  }

  /**
   * Calculate overall statistics from exam history
   */
  private calculateOverallStats(examHistory: any[]) {
    if (examHistory.length === 0) {
      return {
        totalExams: 0,
        totalQuestionsAttempted: 0,
        overallAccuracy: 0,
        avgScore: 0,
        avgPercentage: 0,
        bestExam: null,
        worstExam: null,
      };
    }

    const totalExams = examHistory.length;
    const totalScore = examHistory.reduce((sum, exam) => sum + exam.score, 0);
    const totalMaxScore = examHistory.reduce((sum, exam) => sum + exam.maxScore, 0);
    const avgScore = totalExams > 0 ? totalScore / totalExams : 0;
    const avgPercentage = totalMaxScore > 0 ? (totalScore / totalMaxScore) * 100 : 0;

    // Simple overall accuracy estimation (will be refined with actual question data)
    const overallAccuracy = avgPercentage;

    // Find best and worst exams
    const sortedByPercentage = [...examHistory].sort((a, b) => b.percentage - a.percentage);
    const bestExam = sortedByPercentage[0];
    const worstExam = sortedByPercentage[sortedByPercentage.length - 1];

    return {
      totalExams,
      totalQuestionsAttempted: 0, // Will be calculated when we have question count data
      overallAccuracy: Math.round(overallAccuracy * 100) / 100,
      avgScore: Math.round(avgScore * 100) / 100,
      avgPercentage: Math.round(avgPercentage * 100) / 100,
      bestExam,
      worstExam,
    };
  }

  /**
   * Get analytics for a parent's child
   */
  async getParentChildAnalytics(parentUserId: string, studentId: string) {
    const parent = await this.prisma.parent.findUnique({
      where: { userId: parentUserId },
      include: {
        parentStudents: {
          where: { studentId },
        },
      },
    });

    if (!parent || parent.parentStudents.length === 0) {
      throw new ForbiddenException('You do not have access to this student data');
    }

    return this.getStudentPerformance(studentId);
  }

  /**
   * Get analytics for a tutor's group students
   */
  async getTutorGroupAnalytics(tutorUserId: string, groupId: string) {
    const tutor = await this.prisma.tutor.findUnique({
      where: { userId: tutorUserId },
      include: {
        groupTutors: {
          where: { groupId },
        },
      },
    });

    if (!tutor || tutor.groupTutors.length === 0) {
      throw new ForbiddenException('You do not have access to this group data');
    }

    // Get all students in the group
    const groupMembers = await this.prisma.groupMember.findMany({
      where: { groupId },
      include: {
        student: {
          include: { user: { select: { name: true } } },
        },
      },
    });

    // Get performance for each student
    const studentPerformances = await Promise.all(
      groupMembers.map((member) =>
        this.getStudentPerformance(member.studentId),
      ),
    );

    return {
      groupId,
      studentCount: groupMembers.length,
      studentPerformances,
    };
  }

  /**
   * Get own performance for a student (by userId)
   */
  async getMyPerformance(userId: string) {
    const student = await this.prisma.student.findUnique({
      where: { userId },
    });

    if (!student) {
      throw new NotFoundException('Student profile not found');
    }

    return this.getStudentPerformance(student.id);
  }

  /**
   * Get analytics for admin academic (aggregated across all students)
   */
  async getAdminAcademicAnalytics(filters?: {
    programId?: string;
    levelId?: string;
    groupId?: string;
    startDate?: Date;
    endDate?: Date;
  }) {
    // Get exam question analytics for all published exams
    const exams = await this.prisma.exam.findMany({
      where: {
        status: 'PUBLISHED',
        ...(filters?.programId && { items: { some: { question: { programId: filters.programId } } } }),
        ...(filters?.levelId && { items: { some: { question: { levelId: filters.levelId } } } }),
        ...(filters?.startDate && { scheduledEndAt: { gte: filters.startDate } }),
        ...(filters?.endDate && { scheduledEndAt: { lte: filters.endDate } }),
      },
      select: { id: true, title: true },
      take: 50,
    });

    const examAnalytics = await Promise.all(
      exams.map((exam) => this.getExamQuestionAnalytics(exam.id)),
    );

    // Get aggregate statistics — scope attempt ke ujian hasil filter agar
    // KPI konsisten dengan daftar (program/level menyaring daftar ujian).
    const allAttempts = await this.prisma.examAttempt.findMany({
      where: {
        status: 'SUBMITTED',
        examId: { in: exams.map((e) => e.id) },
        ...(filters?.groupId && {
          student: { groupMembers: { some: { groupId: filters.groupId } } },
        }),
        ...(filters?.startDate && { submittedAt: { gte: filters.startDate } }),
        ...(filters?.endDate && { submittedAt: { lte: filters.endDate } }),
      },
      select: {
        score: true,
        maxScore: true,
      },
    });

    const totalAttempts = allAttempts.length;
    const totalScore = allAttempts.reduce((sum, a) => sum + a.score, 0);
    const totalMaxScore = allAttempts.reduce((sum, a) => sum + a.maxScore, 0);
    const avgPercentage = totalMaxScore > 0 ? (totalScore / totalMaxScore) * 100 : 0;

    return {
      totalExams: exams.length,
      totalAttempts,
      avgPercentage: Math.round(avgPercentage * 100) / 100,
      examAnalytics,
    };
  }

  // ============ Rekap & Cetak Ujian (format seperti PDF hasil TO) ============

  /**
   * Data dasar rekap ujian: exam + item terurut + attempt SUBMITTED
   * beserta siswa (nama, asal sekolah, kelompok) dan jawabannya.
   */
  private async loadExamRecapBase(examId: string) {
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      include: {
        level: { select: { name: true } },
        subject: { select: { name: true } },
        program: { select: { name: true } },
        items: {
          orderBy: { sortOrder: 'asc' },
          include: {
            question: {
              include: {
                options: { orderBy: { sortOrder: 'asc' } },
                subject: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });
    if (!exam) throw new NotFoundException('Ujian tidak ditemukan.');

    const catDefs = await this.prisma.contentCategoryDef.findMany({
      select: { code: true, name: true },
    });
    const catName = new Map(catDefs.map((c) => [c.code, c.name]));

    const attempts = await this.prisma.examAttempt.findMany({
      where: { examId, status: 'SUBMITTED' },
      orderBy: { score: 'desc' },
      include: {
        answers: true,
        student: {
          select: {
            id: true,
            schoolOrigin: true,
            user: { select: { name: true } },
            groupMembers: {
              select: { group: { select: { name: true } } },
            },
          },
        },
      },
    });

    return { exam, attempts, catName };
  }

  /**
   * Kolom rekap: mapel bila soal ujian lintas-mapel (seperti subtes TO),
   * jika tidak → bab/kategori soal, jika tidak ada → satu kolom "Total".
   */
  private recapColumns(exam: Awaited<ReturnType<typeof this.loadExamRecapBase>>['exam'], catName: Map<string, string>) {
    const subjects = new Map<string, string>();
    for (const item of exam.items) {
      const s = item.question.subject;
      if (s) subjects.set(s.id, s.name);
    }
    if (subjects.size > 1) {
      return {
        kind: 'subject' as const,
        columns: [...subjects.entries()].map(([key, label]) => ({ key, label })),
        keyOf: (item: (typeof exam.items)[number]) => item.question.subjectId ?? 'LAIN',
      };
    }
    const cats = new Map<string, string>();
    for (const item of exam.items) {
      const code = item.question.category || 'UMUM';
      cats.set(code, catName.get(code) ?? code);
    }
    if (cats.size > 1) {
      return {
        kind: 'category' as const,
        columns: [...cats.entries()].map(([key, label]) => ({ key, label })),
        keyOf: (item: (typeof exam.items)[number]) => item.question.category || 'UMUM',
      };
    }
    return {
      kind: 'total' as const,
      columns: [{ key: 'TOTAL', label: 'Nilai' }],
      keyOf: () => 'TOTAL',
    };
  }

  /** Rekap nilai semua siswa dalam satu ujian — ala "HASIL SIMULASI" (PDF1). */
  async getExamScoreRecap(examId: string) {
    const { exam, attempts, catName } = await this.loadExamRecapBase(examId);
    const { columns, keyOf } = this.recapColumns(exam, catName);
    const colMax = new Map<string, number>(columns.map((c) => [c.key, 0]));
    for (const item of exam.items) {
      const key = keyOf(item);
      colMax.set(key, (colMax.get(key) ?? 0) + item.points);
    }

    const rows = attempts.map((a) => {
      const ansByQ = new Map(a.answers.map((x) => [x.questionId, x]));
      const cells = new Map<string, { correct: number; total: number; score: number; maxScore: number }>();
      for (const c of columns) cells.set(c.key, { correct: 0, total: 0, score: 0, maxScore: 0 });
      for (const item of exam.items) {
        const cell = cells.get(keyOf(item))!;
        cell.total += 1;
        cell.maxScore += item.points;
        const ans = ansByQ.get(item.questionId);
        if (ans) {
          cell.score += ans.score;
          if (ans.isCorrect === true) cell.correct += 1;
        }
      }
      const totalScore = a.score;
      const pct = a.maxScore > 0 ? Math.round((a.score / a.maxScore) * 100) : 0;
      return {
        studentId: a.student.id,
        name: a.student.user.name,
        school: a.student.schoolOrigin ?? '-',
        groups: a.student.groupMembers.map((gm) => gm.group.name),
        cells: columns.map((c) => ({ key: c.key, ...cells.get(c.key)! })),
        totalScore,
        maxScore: a.maxScore,
        totalCorrect: a.answers.filter((x) => x.isCorrect === true).length,
        percentage: pct,
        submittedAt: a.submittedAt,
      };
    });

    return {
      exam: {
        id: exam.id,
        title: exam.title,
        levelName: exam.level?.name ?? null,
        subjectName: exam.subject?.name ?? null,
        programName: exam.program?.name ?? null,
        scheduledStartAt: exam.scheduledStartAt,
        maxScore: exam.maxScore,
      },
      columnKind: columns.length > 1 ? 'multi' : 'single',
      columns: columns.map((c) => ({ ...c, maxScore: colMax.get(c.key) ?? 0 })),
      rows,
      participantCount: attempts.length,
    };
  }

  /**
   * Rekap jawaban per nomor — ala "JAWABAN SISWA" (PDF2):
   * baris KUNCI + jawaban tiap siswa per nomor soal.
   */
  async getExamAnswerRecap(examId: string) {
    const { exam, attempts } = await this.loadExamRecapBase(examId);

    // Kunci per soal: huruf opsi benar (A,B,…) / kunci isian / label esai.
    const optionLetters = new Map<string, string>();
    const keyOfQ = new Map<string, string>();
    exam.items.forEach((item, idx) => {
      const q = item.question;
      q.options.forEach((o, i) => optionLetters.set(o.id, optionLetter(i)));
      if (q.type === 'SHORT_ANSWER') {
        keyOfQ.set(q.id, q.answerKey || '-');
      } else if (q.type === 'ESSAY') {
        keyOfQ.set(q.id, 'Esai');
      } else {
        const correct = q.options
          .map((o, i) => (o.isCorrect ? optionLetter(i) : null))
          .filter(Boolean)
          .join('');
        keyOfQ.set(q.id, correct || '-');
      }
      void idx;
    });

    const questions = exam.items.map((item, i) => ({
      no: i + 1,
      questionId: item.questionId,
      type: item.question.type,
      key: keyOfQ.get(item.questionId) ?? '-',
      points: item.points,
    }));

    const rows = attempts.map((a) => {
      const ansByQ = new Map(a.answers.map((x) => [x.questionId, x]));
      return {
        studentId: a.student.id,
        name: a.student.user.name,
        school: a.student.schoolOrigin ?? '-',
        answers: questions.map((q) => {
          const ans = ansByQ.get(q.questionId);
          if (!ans) return { display: '-', isCorrect: null };
          if (ans.selectedOptionIds.length > 0) {
            const letters = ans.selectedOptionIds
              .map((id) => optionLetters.get(id) ?? '?')
              .sort()
              .join('');
            return { display: letters, isCorrect: ans.isCorrect };
          }
          if (ans.textAnswer) {
            return { display: ans.textAnswer, isCorrect: ans.isCorrect };
          }
          return { display: '-', isCorrect: ans.isCorrect };
        }),
      };
    });

    return {
      exam: {
        id: exam.id,
        title: exam.title,
        levelName: exam.level?.name ?? null,
        subjectName: exam.subject?.name ?? null,
      },
      questions,
      rows,
      participantCount: attempts.length,
    };
  }

  /** Lembar soal untuk dicetak (opsional sertakan kunci + pembahasan). */
  async getExamQuestionSheet(examId: string, withKey: boolean) {
    const { exam } = await this.loadExamRecapBase(examId);
    return {
      exam: {
        id: exam.id,
        title: exam.title,
        description: exam.description,
        levelName: exam.level?.name ?? null,
        subjectName: exam.subject?.name ?? null,
        programName: exam.program?.name ?? null,
        scheduledStartAt: exam.scheduledStartAt,
        durationMinutes: exam.durationMinutes,
      },
      questions: exam.items.map((item, i) => ({
        no: i + 1,
        type: item.question.type,
        content: item.question.content,
        imageUrl: item.question.imageUrl,
        points: item.points,
        options: item.question.options.map((o, oi) => ({
          letter: optionLetter(oi),
          content: o.content,
          isCorrect: o.isCorrect,
        })),
        answerKey: item.question.answerKey,
        explanation: withKey ? item.question.explanation : null,
      })),
      withKey,
    };
  }

  /** Export rekap nilai ujian ke .xlsx (ExcelJS). */
  async exportExamScoreRecapXlsx(examId: string) {
    const recap = await this.getExamScoreRecap(examId);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Rekap Nilai');

    ws.getCell('A1').value = `REKAP HASIL — ${recap.exam.title}`;
    ws.getCell('A1').font = { bold: true, size: 14 };
    ws.getCell('A2').value = [
      recap.exam.programName,
      recap.exam.levelName,
      recap.exam.subjectName,
    ]
      .filter(Boolean)
      .join(' · ');
    ws.getCell('A3').value = `Tanggal: ${fmtDateId(recap.exam.scheduledStartAt)} · Peserta: ${recap.participantCount}`;

    // Header 2 baris: nama kolom + BENAR/SKOR per kolom (seperti PDF hasil TO).
    const head1 = ws.getRow(5);
    const head2 = ws.getRow(6);
    const fixed = ['No', 'Nama', 'Asal Sekolah', 'Kelompok'];
    fixed.forEach((h, i) => {
      const cell = head1.getCell(i + 1);
      cell.value = h;
      ws.mergeCells(5, i + 1, 6, i + 1);
    });
    let col = fixed.length + 1;
    for (const c of recap.columns) {
      head1.getCell(col).value = c.label;
      ws.mergeCells(5, col, 5, col + 1);
      head2.getCell(col).value = 'BENAR';
      head2.getCell(col + 1).value = 'SKOR';
      col += 2;
    }
    head1.getCell(col).value = 'TOTAL';
    ws.mergeCells(5, col, 5, col + 1);
    head2.getCell(col).value = 'BENAR';
    head2.getCell(col + 1).value = 'SKOR';
    head1.getCell(col + 2).value = 'NILAI %';
    ws.mergeCells(5, col + 2, 6, col + 2);
    head1.font = { bold: true };
    head2.font = { bold: true };

    recap.rows.forEach((r, i) => {
      const row = ws.getRow(7 + i);
      const values: (string | number)[] = [
        i + 1,
        r.name,
        r.school,
        r.groups.join(', '),
      ];
      for (const cell of r.cells) values.push(cell.correct, cell.score);
      values.push(r.totalCorrect, r.totalScore, r.percentage);
      row.values = values;
    });

    ws.getColumn(1).width = 5;
    ws.getColumn(2).width = 26;
    ws.getColumn(3).width = 22;
    ws.getColumn(4).width = 20;
    for (let i = fixed.length + 1; i <= col + 2; i++) ws.getColumn(i).width = 9;

    const buffer = await wb.xlsx.writeBuffer();
    const safe = recap.exam.title.replace(/[^a-zA-Z0-9-_]+/g, '-').toLowerCase();
    return {
      buffer: Buffer.from(buffer),
      filename: `rekap-nilai-${safe}.xlsx`,
      recap,
    };
  }

  /** CSS bersama untuk dokumen cetak ujian. */
  private printCss() {
    return `*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0;padding:24px;font-size:12px}
h1{font-size:17px;margin:0 0 2px}.sub{color:#555;font-size:11px;margin-bottom:14px}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:4px 6px;text-align:left;vertical-align:top}
th{background:#eee;font-size:11px}.num{text-align:center;width:26px}.ctr{text-align:center}
.ok{color:#0a7d2c;font-weight:bold}.bad{color:#c0392b}.key-row td{background:#f3f6ff;font-weight:bold}
.q{margin-bottom:14px;page-break-inside:avoid}.q .qh{display:flex;gap:8px}.q .qn{font-weight:bold;min-width:26px}
.opts{margin:4px 0 0 34px}.opt{margin:2px 0}.opt .ltr{font-weight:bold;display:inline-block;width:16px}
.key{background:#f3f6ff;padding:6px 8px;margin:6px 0 0 34px;font-size:11px}
img{max-width:320px;max-height:200px;display:block;margin:6px 0}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:12px}
@media print{body{padding:0}.noprint{display:none}}`;
  }

  private printDoc(title: string, body: string) {
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${this.printCss()}</style></head><body>${body}<script>window.onload=()=>setTimeout(()=>window.print(),300)</script></body></html>`;
  }

  /** HTML cetak soal ujian. */
  renderQuestionSheetHtml(sheet: Awaited<ReturnType<typeof this.getExamQuestionSheet>>) {
    const e = sheet.exam;
    const meta = [
      e.programName,
      e.levelName,
      e.subjectName,
      e.durationMinutes ? `${e.durationMinutes} menit` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    const qs = sheet.questions
      .map((q) => {
        const opts = q.options
          .map(
            (o) =>
              `<div class="opt"><span class="ltr">${o.letter}.</span> ${esc(o.content)}${sheet.withKey && o.isCorrect ? ' <b class="ok">✓</b>' : ''}</div>`,
          )
          .join('');
        const key =
          sheet.withKey && (q.answerKey || q.explanation)
            ? `<div class="key">${q.answerKey ? `<b>Kunci:</b> ${esc(q.answerKey)}<br>` : ''}${q.explanation ? `<b>Pembahasan:</b> ${esc(q.explanation)}` : ''}</div>`
            : '';
        return `<div class="q"><div class="qh"><span class="qn">${q.no}.</span><div><div>${esc(q.content)}</div>${q.imageUrl ? `<img src="${esc(q.imageUrl)}">` : ''}<div class="opts">${opts}</div>${key}</div></div></div>`;
      })
      .join('');
    return this.printDoc(
      `Soal — ${e.title}`,
      `<div class="hdr"><div><h1>${esc(e.title)}</h1><div class="sub">${esc(meta)} · ${fmtDateId(e.scheduledStartAt)} · ${sheet.questions.length} soal${sheet.withKey ? ' · DENGAN KUNCI' : ''}</div></div><div class="sub">Bimbel GFS</div></div>${qs}`,
    );
  }

  /** HTML rekap jawaban siswa per nomor (baris KUNCI + jawaban tiap siswa). */
  renderAnswerRecapHtml(recap: Awaited<ReturnType<typeof this.getExamAnswerRecap>>) {
    const e = recap.exam;
    const head =
      `<tr><th class="num">NO</th><th>NAMA</th><th>ASAL SEKOLAH</th>` +
      recap.questions.map((q) => `<th class="ctr">NO ${q.no}</th>`).join('') +
      `</tr>`;
    const keyRow =
      `<tr class="key-row"><td colspan="3">KUNCI</td>` +
      recap.questions.map((q) => `<td class="ctr">${esc(q.key)}</td>`).join('') +
      `</tr>`;
    const rows = recap.rows
      .map(
        (r, i) =>
          `<tr><td class="ctr">${i + 1}</td><td>${esc(r.name)}</td><td>${esc(r.school)}</td>` +
          r.answers
            .map(
              (a) =>
                `<td class="ctr ${a.isCorrect === true ? 'ok' : a.isCorrect === false ? 'bad' : ''}">${esc(a.display)}</td>`,
            )
            .join('') +
          `</tr>`,
      )
      .join('');
    return this.printDoc(
      `Jawaban Siswa — ${e.title}`,
      `<div class="hdr"><div><h1>JAWABAN SISWA — ${esc(e.title)}</h1><div class="sub">${esc([e.levelName, e.subjectName].filter(Boolean).join(' · '))} · ${recap.participantCount} peserta</div></div><div class="sub">Bimbel GFS</div></div><table>${head}${keyRow}${rows}</table>`,
    );
  }

  /** HTML rekap nilai semua siswa (kolom BENAR/SKOR per mapel/bab — PDF1). */
  renderScoreRecapHtml(recap: Awaited<ReturnType<typeof this.getExamScoreRecap>>) {
    const e = recap.exam;
    const cols = recap.columns;
    const head1 =
      `<tr><th class="num" rowspan="2">NO</th><th rowspan="2">NAMA</th><th rowspan="2">ASAL SEKOLAH</th>` +
      cols.map((c) => `<th colspan="2" class="ctr">${esc(c.label)}</th>`).join('') +
      `<th colspan="2" class="ctr">TOTAL</th><th rowspan="2" class="ctr">%</th></tr>`;
    const head2 =
      `<tr>` +
      cols.map(() => `<th class="ctr">BENAR</th><th class="ctr">SKOR</th>`).join('') +
      `<th class="ctr">BENAR</th><th class="ctr">SKOR</th></tr>`;
    const rows = recap.rows
      .map(
        (r, i) =>
          `<tr><td class="ctr">${i + 1}</td><td>${esc(r.name)}</td><td>${esc(r.school)}</td>` +
          r.cells
            .map((c) => `<td class="ctr">${c.correct}/${c.total}</td><td class="ctr">${c.score}</td>`)
            .join('') +
          `<td class="ctr">${r.totalCorrect}</td><td class="ctr"><b>${r.totalScore}</b></td><td class="ctr">${r.percentage}</td></tr>`,
      )
      .join('');
    return this.printDoc(
      `Hasil — ${e.title}`,
      `<div class="hdr"><div><h1>HASIL ${esc(e.title)}</h1><div class="sub">${esc([e.programName, e.levelName, e.subjectName].filter(Boolean).join(' · '))} · ${fmtDateId(e.scheduledStartAt)} · ${recap.participantCount} peserta</div></div><div class="sub">Bimbel GFS</div></div><table>${head1}${head2}${rows}</table>`,
    );
  }

  /**
   * Laporan bulanan anak untuk ortu: kehadiran + ujian + latsol + poin
   * dalam satu periode YYYY-MM. Scope ortu diverifikasi via parentStudents.
   */
  async getChildMonthlyReport(parentUserId: string, studentId: string, period: string) {
    const parent = await this.prisma.parent.findUnique({
      where: { userId: parentUserId },
      include: { parentStudents: { where: { studentId } } },
    });
    if (!parent || parent.parentStudents.length === 0) {
      throw new ForbiddenException('Anda tidak memiliki akses ke data anak ini.');
    }

    const [y, m] = (period || '').split('-').map((s) => parseInt(s, 10));
    const valid = y > 2000 && m >= 1 && m <= 12;
    const ref = valid ? new Date(y, m - 1, 1) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const gte = ref;
    const lt = new Date(ref.getFullYear(), ref.getMonth() + 1, 1);
    const periodKey = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}`;

    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        schoolOrigin: true,
        user: { select: { name: true } },
        groupMembers: {
          select: {
            group: {
              select: { id: true, name: true, level: { select: { name: true } }, program: { select: { name: true } } },
            },
          },
        },
      },
    });
    if (!student) throw new NotFoundException('Siswa tidak ditemukan.');

    const [attendances, examAttempts, latsolAttempts, points] = await Promise.all([
      this.prisma.attendance.findMany({
        where: { studentId, session: { startsAt: { gte, lt } } },
        select: {
          status: true,
          session: {
            select: {
              startsAt: true,
              subject: { select: { name: true } },
              group: { select: { name: true } },
            },
          },
        },
        orderBy: { session: { startsAt: 'asc' } },
      }),
      this.prisma.examAttempt.findMany({
        where: { studentId, status: 'SUBMITTED', submittedAt: { gte, lt } },
        select: {
          score: true,
          maxScore: true,
          submittedAt: true,
          exam: { select: { title: true, subject: { select: { name: true } } } },
        },
        orderBy: { submittedAt: 'asc' },
      }),
      this.prisma.latsolAttempt.findMany({
        where: { studentId, status: 'SUBMITTED', submittedAt: { gte, lt } },
        select: {
          score: true,
          maxScore: true,
          submittedAt: true,
          package: { select: { title: true, subject: { select: { name: true } } } },
        },
        orderBy: { submittedAt: 'asc' },
      }),
      this.prisma.pointTransaction.aggregate({
        where: { studentId, period: periodKey },
        _sum: { points: true },
      }),
    ]);

    const att = { HADIR: 0, TERLAMBAT: 0, IZIN: 0, SAKIT: 0, ALFA: 0 } as Record<string, number>;
    for (const a of attendances) att[a.status] = (att[a.status] ?? 0) + 1;
    const attTotal = attendances.length;
    const attPct = attTotal ? Math.round((att.HADIR / attTotal) * 100) : 0;

    return {
      period: periodKey,
      monthLabel: `${MONTH_ID[ref.getMonth()]} ${ref.getFullYear()}`,
      student: {
        id: student.id,
        name: student.user.name,
        school: student.schoolOrigin ?? null,
        groups: student.groupMembers.map((gm) => ({
          name: gm.group.name,
          levelName: gm.group.level?.name ?? null,
          programName: gm.group.program.name,
        })),
      },
      attendance: {
        counts: att,
        total: attTotal,
        presentPercent: attPct,
        sessions: attendances.map((a) => ({
          date: a.session.startsAt,
          subjectName: a.session.subject?.name ?? null,
          groupName: a.session.group.name,
          status: a.status,
        })),
      },
      exams: examAttempts.map((a) => ({
        title: a.exam.title,
        subjectName: a.exam.subject?.name ?? null,
        score: a.score,
        maxScore: a.maxScore,
        percentage: a.maxScore > 0 ? Math.round((a.score / a.maxScore) * 100) : 0,
        date: a.submittedAt,
      })),
      latsol: latsolAttempts.map((a) => ({
        title: a.package.title,
        subjectName: a.package.subject?.name ?? null,
        score: a.score,
        maxScore: a.maxScore,
        percentage: a.maxScore > 0 ? Math.round((a.score / a.maxScore) * 100) : 0,
        date: a.submittedAt,
      })),
      pointsEarned: points._sum.points ?? 0,
    };
  }
}
