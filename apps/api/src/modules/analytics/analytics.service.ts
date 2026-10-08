/**
 * Fase 4a — Analytics Service
 * Per-question analytics & student performance dashboard
 * Uses data from Fase 3 (exam_attempts, exam_answers) as source
 * Does NOT duplicate exam schema - pure aggregation
 */
import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TutorScopeService } from '../../common/tutor-scope/tutor-scope.service';
import { PERMISSION_CODES } from '../rbac/permissions.constants';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly tutorScope: TutorScopeService,
  ) {}

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
        r.groups.join('\n'),
      ];
      for (const cell of r.cells) values.push(cell.correct, cell.score);
      values.push(r.totalCorrect, r.totalScore, r.percentage);
      row.values = values;
      row.getCell(4).alignment = { wrapText: true, vertical: 'top' };
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

  /**
   * Export rekap jawaban per nomor ke .xlsx — baris KUNCI + jawaban tiap
   * siswa per nomor, sel benar hijau / salah merah (matriks "JAWABAN SISWA").
   */
  async exportExamAnswerRecapXlsx(examId: string) {
    const recap = await this.getExamAnswerRecap(examId);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Rekap Jawaban');

    ws.getCell('A1').value = `JAWABAN SISWA — ${recap.exam.title}`;
    ws.getCell('A1').font = { bold: true, size: 14 };
    ws.getCell('A2').value = [recap.exam.levelName, recap.exam.subjectName]
      .filter(Boolean)
      .join(' · ');
    ws.getCell('A3').value = `Peserta: ${recap.participantCount}`;

    const head = ws.getRow(5);
    head.getCell(1).value = 'NO';
    head.getCell(2).value = 'NAMA';
    head.getCell(3).value = 'ASAL SEKOLAH';
    recap.questions.forEach((q, i) => {
      const cell = head.getCell(4 + i);
      cell.value = `NO ${q.no}`;
      cell.alignment = { horizontal: 'center' };
    });
    head.font = { bold: true };

    // Baris KUNCI.
    const keyRow = ws.getRow(6);
    keyRow.getCell(2).value = 'KUNCI';
    keyRow.font = { bold: true, color: { argb: 'FF1E3A5F' } };
    recap.questions.forEach((q, i) => {
      const cell = keyRow.getCell(4 + i);
      cell.value = q.key;
      cell.alignment = { horizontal: 'center' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F6FF' } };
    });

    const GREEN = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFE7F6EC' } };
    const RED = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFDECEC' } };
    recap.rows.forEach((r, i) => {
      const row = ws.getRow(7 + i);
      row.getCell(1).value = i + 1;
      row.getCell(2).value = r.name;
      row.getCell(3).value = r.school;
      r.answers.forEach((a, qi) => {
        const cell = row.getCell(4 + qi);
        cell.value = a.display;
        cell.alignment = { horizontal: 'center' };
        if (a.isCorrect === true) cell.fill = GREEN;
        else if (a.isCorrect === false) cell.fill = RED;
      });
    });

    ws.getColumn(1).width = 5;
    ws.getColumn(2).width = 26;
    ws.getColumn(3).width = 22;
    for (let i = 4; i <= 3 + recap.questions.length; i++) ws.getColumn(i).width = 6;
    // Freeze kolom identitas + header saat scroll — tabel puluhan nomor
    // tetap kebaca.
    ws.views = [{ state: 'frozen', xSplit: 3, ySplit: 6 }];

    const buffer = await wb.xlsx.writeBuffer();
    const safe = recap.exam.title.replace(/[^a-zA-Z0-9-_]+/g, '-').toLowerCase();
    return {
      buffer: Buffer.from(buffer),
      filename: `rekap-jawaban-${safe}.xlsx`,
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

  private printDoc(title: string, body: string, extraCss = '') {
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${this.printCss()}</style>${extraCss ? `<style>${extraCss}</style>` : ''}</head><body>${body}<script>window.onload=()=>setTimeout(()=>window.print(),300)</script></body></html>`;
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
      // Sel benar/salah diwarnai; kolom nomor rapat agar banyak soal tetap muat.
      `td.ok{background:#e7f6ec}td.bad{background:#fdecec}
td,th{padding:2px 4px;font-size:10px}`,
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

  // =====================================================================
  // Laporan hasil belajar siswa (cetak) — matriks nilai per mapel lintas
  // beberapa ujian satu tipe (mis. Simulasi TKA 1..n), ala "Laporan Hasil
  // Belajar" bimbel: identitas + NIS + tabel nilai + grafik + tanda tangan.
  // =====================================================================

  /** Baris nilai satu ujian: persen per mapel (sesuai `columns`) + jumlah. */
  private learningReportRow(
    attempt: {
      score: number;
      maxScore: number;
      submittedAt: Date | null;
      answers: { questionId: string; score: number }[];
      exam: {
        title: string;
        scheduledStartAt: Date;
        items: {
          points: number;
          questionId: string;
          question: { subjectId: string | null };
        }[];
      };
    },
    colKey: (item: {
      question: { subjectId: string | null };
    }) => string,
    columns: { key: string }[],
  ) {
    const ansScore = new Map(attempt.answers.map((a) => [a.questionId, a.score]));
    const acc = new Map<string, { got: number; max: number }>(
      columns.map((c) => [c.key, { got: 0, max: 0 }]),
    );
    for (const item of attempt.exam.items) {
      const cell = acc.get(colKey(item));
      if (!cell) continue;
      cell.max += item.points;
      cell.got += ansScore.get(item.questionId) ?? 0;
    }
    const cells = columns.map((c) => {
      const { got, max } = acc.get(c.key)!;
      return max > 0 ? (got / max) * 100 : null; // null = ujian ini tak punya mapel tsb
    });
    const total = cells.reduce<number>((s, v) => s + (v ?? 0), 0);
    return {
      title: attempt.exam.title,
      date: attempt.exam.scheduledStartAt ?? attempt.submittedAt,
      cells,
      total,
    };
  }

  /**
   * Laporan hasil belajar siswa per tipe ujian (`category`, mis. TO/TKA).
   * `basicCategory` opsional = tipe "Tes Kemampuan Dasar" yang dirender
   * sebagai tabel tersendiri di atas tabel utama (seperti format laporan).
   */
  /** Student id untuk akun login — lempar Forbidden kalau bukan siswa. */
  async studentIdForUser(userId: string) {
    const student = await this.prisma.student.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!student) throw new ForbiddenException('Akun ini bukan siswa.');
    return student.id;
  }

  /** Pastikan ortu tertaut ke siswa — dipakai endpoint scope orang tua. */
  async assertParentOwnsChild(parentUserId: string, studentId: string) {
    const parent = await this.prisma.parent.findUnique({
      where: { userId: parentUserId },
      include: { parentStudents: { where: { studentId } } },
    });
    if (!parent || parent.parentStudents.length === 0) {
      throw new ForbiddenException('Anda tidak memiliki akses ke data anak ini.');
    }
  }

  /**
   * Akses laporan siswa: pemegang `analytics.student_performance.view`
   * bebas; tutor harus mengampu siswa tsb (anggota kelompok yang dia ajar).
   */
  async assertStudentPerformanceAccess(
    actor: { id: string; roles: string[]; permissions: string[] },
    studentId: string,
  ) {
    if (
      actor.permissions.includes(
        PERMISSION_CODES.ANALYTICS_STUDENT_PERFORMANCE_VIEW,
      )
    ) {
      return;
    }
    const scope = await this.tutorScope.for(actor);
    if (!scope) {
      throw new ForbiddenException('Tidak punya akses ke laporan siswa.');
    }
    const member = await this.prisma.groupMember.findFirst({
      where: {
        studentId,
        groupId: { in: scope.groupIds.length ? scope.groupIds : ['__none__'] },
      },
      select: { id: true },
    });
    if (!member) {
      throw new ForbiddenException(
        'Siswa ini di luar kelompok yang Anda ampu.',
      );
    }
  }

  /** Siswa yang diampu tutor — pemilih siswa di halaman laporan tutor. */
  async myStudents(actor: {
    id: string;
    roles: string[];
    permissions: string[];
  }) {
    const scope = await this.tutorScope.for(actor);
    if (!scope || !scope.groupIds.length) return [];
    return this.prisma.student.findMany({
      where: {
        isActive: true,
        groupMembers: { some: { groupId: { in: scope.groupIds } } },
      },
      select: { id: true, user: { select: { name: true } } },
      orderBy: { user: { name: 'asc' } },
      take: 200,
    });
  }

  /**
   * Daftar ujian yang punya attempt SUBMITTED siswa — untuk pemilih
   * "ujian yang disertakan" di halaman Laporan Hasil Belajar.
   */
  async listReportExams(studentId: string) {
    const attempts = await this.prisma.examAttempt.findMany({
      where: { studentId, status: 'SUBMITTED' },
      select: {
        submittedAt: true,
        exam: {
          select: { id: true, title: true, category: true, scheduledStartAt: true },
        },
      },
      orderBy: { exam: { scheduledStartAt: 'asc' } },
    });
    const seen = new Map<string, { id: string; title: string; category: string | null; scheduledStartAt: Date }>();
    for (const a of attempts) {
      if (!seen.has(a.exam.id)) seen.set(a.exam.id, a.exam);
    }
    return [...seen.values()];
  }

  async getStudentLearningReport(
    studentId: string,
    category: string,
    basicCategory?: string,
    examIds?: string[],
  ) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        nis: true,
        schoolOrigin: true,
        majorChoice1: true,
        majorChoice2: true,
        user: { select: { name: true } },
        parentStudents: {
          select: { parent: { select: { user: { select: { name: true } } } } },
        },
        groupMembers: {
          where: { group: { isActive: true } },
          select: {
            group: {
              select: {
                name: true,
                level: { select: { name: true } },
                program: { select: { name: true } },
              },
            },
          },
          take: 1,
        },
      },
    });
    if (!student) throw new NotFoundException('Siswa tidak ditemukan.');

    const itemInclude = {
      items: {
        orderBy: { sortOrder: 'asc' as const },
        select: {
          points: true,
          questionId: true,
          question: {
            select: { subjectId: true, subject: { select: { id: true, name: true } } },
          },
        },
      },
    };
    const loadAttempts = (cat: string, ids?: string[]) =>
      this.prisma.examAttempt.findMany({
        where: {
          studentId,
          status: 'SUBMITTED',
          // `ids` = ujian yang dipilih user di halaman laporan (subset kategori).
          exam: { category: cat, ...(ids?.length ? { id: { in: ids } } : {}) },
        },
        orderBy: { exam: { scheduledStartAt: 'asc' } },
        include: {
          answers: { select: { questionId: true, score: true } },
          exam: {
            select: {
              id: true,
              title: true,
              scheduledStartAt: true,
              program: { select: { name: true } },
              ...itemInclude,
            },
          },
        },
      });

    // Hanya attempt SUBMITTED terakhir per ujian (kalau siswa retake).
    const latestPerExam = (
      attempts: Awaited<ReturnType<typeof loadAttempts>>,
    ) => {
      const byExam = new Map<string, (typeof attempts)[number]>();
      for (const a of attempts) byExam.set(a.exam.id, a);
      return [...byExam.values()].sort(
        (x, y) =>
          new Date(x.exam.scheduledStartAt).getTime() -
          new Date(y.exam.scheduledStartAt).getTime(),
      );
    };

    const catDefs = await this.prisma.contentCategoryDef.findMany({
      select: { code: true, name: true },
    });
    const catLabel = (code: string) =>
      catDefs.find((c) => c.code === code)?.name ?? code;

    const buildSection = async (cat: string, ids?: string[]) => {
      if (!cat) return null;
      const attempts = latestPerExam(await loadAttempts(cat, ids));
      // Kolom = gabungan mapel dari semua ujian pada tipe ini.
      const colMap = new Map<string, string>();
      for (const a of attempts) {
        for (const item of a.exam.items) {
          const s = item.question.subject;
          const key = s?.id ?? 'UMUM';
          if (!colMap.has(key)) colMap.set(key, s?.name ?? 'Umum');
        }
      }
      const columns = [...colMap.entries()].map(([key, label]) => ({
        key,
        label,
      }));
      const colKey = (item: {
        question: { subjectId: string | null };
      }) => item.question.subjectId ?? 'UMUM';
      const rows = attempts.map((a) => this.learningReportRow(a, colKey, columns));
      const averages = columns.map((_, i) => {
        const vals = rows.map((r) => r.cells[i]).filter((v): v is number => v !== null);
        return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
      });
      const avgTotal = rows.length
        ? rows.reduce((s, r) => s + r.total, 0) / rows.length
        : null;
      return {
        category: cat,
        categoryLabel: catLabel(cat),
        columns,
        rows,
        averages,
        avgTotal,
        programName: attempts[0]?.exam.program?.name ?? null,
      };
    };

    const main = await buildSection(category, examIds);
    const basic =
      basicCategory && basicCategory !== category
        ? await buildSection(basicCategory)
        : null;

    return {
      student: {
        id: student.id,
        name: student.user.name,
        nis: student.nis,
        school: student.schoolOrigin,
        majorChoice1: student.majorChoice1,
        majorChoice2: student.majorChoice2,
        parentNames: student.parentStudents.map((p) => p.parent.user.name),
        groupName: student.groupMembers[0]?.group.name ?? null,
        levelName: student.groupMembers[0]?.group.level?.name ?? null,
      },
      main,
      basic,
    };
  }

  /** Resolve studentId dari akun yang sedang login (untuk laporan mandiri). */
  async getMyLearningReport(
    userId: string,
    category: string,
    basicCategory?: string,
    examIds?: string[],
  ) {
    const studentId = await this.studentIdForUser(userId);
    return this.getStudentLearningReport(studentId, category, basicCategory, examIds);
  }

  /** Laporan anak — scope ortu diverifikasi via parentStudents. */
  async getChildLearningReport(
    parentUserId: string,
    studentId: string,
    category: string,
    basicCategory?: string,
    examIds?: string[],
  ) {
    const parent = await this.prisma.parent.findUnique({
      where: { userId: parentUserId },
      include: { parentStudents: { where: { studentId } } },
    });
    if (!parent || parent.parentStudents.length === 0) {
      throw new ForbiddenException('Anda tidak memiliki akses ke data anak ini.');
    }
    return this.getStudentLearningReport(studentId, category, basicCategory, examIds);
  }

  /** HTML cetak laporan hasil belajar — letterhead + tabel + grafik + ttd. */
  async renderLearningReportHtml(
    report: Awaited<ReturnType<typeof this.getStudentLearningReport>>,
  ) {
    const [companyRow, brandingRow, financeRow] = await Promise.all([
      this.prisma.appSetting.findUnique({ where: { key: 'company' } }),
      this.prisma.appSetting.findUnique({ where: { key: 'branding' } }),
      this.prisma.appSetting.findUnique({ where: { key: 'finance' } }),
    ]);
    const company = (companyRow?.value ?? {}) as Record<string, unknown>;
    const branding = (brandingRow?.value ?? {}) as Record<string, unknown>;
    const finance = (financeRow?.value ?? {}) as Record<string, unknown>;
    const compName =
      (typeof company.name === 'string' && company.name) ||
      (branding.appName as string) ||
      'Bimbel GFS';
    const tagline = (branding.tagline as string) || '';
    const logoUrl = (branding.logoUrl as string) || '';
    const address = (company.address as string) || '';
    const phone = (company.phone as string) || '';
    const signerName = (finance.receiptSignerName as string) || '';
    const signerTitle =
      (finance.receiptSignerTitle as string) || 'Penanggungjawab Operasional';
    const signatureUrl = (finance.receiptSignatureUrl as string) || '';

    const st = report.student;
    const parentLabel =
      st.parentNames.join(' & ') ||
      `Orang Tua/Wali ${st.name}`;

    const fmtPct = (v: number | null) =>
      v === null ? '' : String(Math.round(v));
    const fmtNum2 = (v: number | null) =>
      v === null ? '-' : v.toFixed(2).replace('.', ',');

    // Tabel per-seksi (Tes Kemampuan Dasar / tabel utama) — No | Kegiatan |
    // <mapel…> | JUMLAH, lalu baris Rata-rata.
    const sectionTable = (
      sec: NonNullable<typeof report.main>,
      withNo = true,
    ) => {
      const head =
        `<tr>${withNo ? '<th class="num">No</th>' : ''}<th>Kegiatan</th>` +
        sec.columns.map((c) => `<th class="ctr">${esc(c.label)}</th>`).join('') +
        `<th class="ctr">JUMLAH</th></tr>`;
      const rows = sec.rows
        .map(
          (r, i) =>
            `<tr>${withNo ? `<td class="ctr">${i + 1}</td>` : ''}<td>${esc(r.title)}</td>` +
            r.cells.map((c) => `<td class="ctr">${fmtPct(c)}</td>`).join('') +
            `<td class="ctr"><b>${fmtNum2(r.total)}</b></td></tr>`,
        )
        .join('');
      const avg =
        `<tr class="avg"><td colspan="${withNo ? 2 : 1}"><b>Rata-rata</b></td>` +
        sec.averages.map((a) => `<td class="ctr">${fmtNum2(a)}</td>`).join('') +
        `<td class="ctr"><b>${fmtNum2(sec.avgTotal)}</b></td></tr>`;
      return `<table>${head}${rows}${sec.rows.length ? avg : ''}</table>`;
    };

    // Grafik batang per kegiatan per mapel + garis jumlah (SVG murni — print aman).
    const chart = (() => {
      const sec = report.main;
      if (!sec || sec.rows.length === 0) return '';
      const W = 460;
      const H = 200;
      const padL = 30;
      const padB = 26;
      const padT = 8;
      const maxV =
        Math.max(
          ...sec.rows.flatMap((r) => r.cells.map((c) => c ?? 0)),
          100,
        ) || 100;
      const innerW = W - padL - 10;
      const innerH = H - padT - padB;
      const nGroups = sec.rows.length;
      const groupW = innerW / Math.max(nGroups, 1);
      const nBars = Math.max(sec.columns.length, 1);
      const barW = Math.min(16, (groupW * 0.7) / nBars);
      const palette = ['#4472c4', '#ed7d31', '#a5a5a5', '#ffc000', '#5b9bd5', '#70ad47', '#264478', '#9e480e'];
      const y = (v: number) => padT + innerH - (v / maxV) * innerH;
      const bars = sec.rows
        .map((r, gi) =>
          r.cells
            .map((v, ci) => {
              if (v === null) return '';
              const x =
                padL + gi * groupW + (groupW - barW * nBars) / 2 + ci * barW;
              return `<rect x="${x.toFixed(1)}" y="${y(v).toFixed(1)}" width="${barW.toFixed(1)}" height="${(padT + innerH - y(v)).toFixed(1)}" fill="${palette[ci % palette.length]}"/>`;
            })
            .join(''),
        )
        .join('');
      // Garis total dinormalisasi ke skala grafik (total dibagi jumlah kolom → rata2 %).
      const linePts = sec.rows
        .map((r, gi) => {
          const mean = r.total / Math.max(sec.columns.length, 1);
          const x = padL + gi * groupW + groupW / 2;
          return `${x.toFixed(1)},${y(Math.min(mean, maxV)).toFixed(1)}`;
        })
        .join(' ');
      const xlabels = sec.rows
        .map((r, gi) => {
          const x = padL + gi * groupW + groupW / 2;
          return `<text x="${x.toFixed(1)}" y="${(H - 8).toFixed(1)}" font-size="8" text-anchor="middle">${esc(r.title.replace(/^Simulasi\s*/i, '').slice(0, 12))}</text>`;
        })
        .join('');
      const legend = sec.columns
        .map(
          (c, i) =>
            `<span style="display:inline-block;margin-right:8px;font-size:9px"><span style="display:inline-block;width:9px;height:9px;background:${palette[i % palette.length]};margin-right:3px"></span>${esc(c.label)}</span>`,
        )
        .join('');
      return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
        <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + innerH}" stroke="#888"/>
        <line x1="${padL}" y1="${padT + innerH}" x2="${padL + innerW}" y2="${padT + innerH}" stroke="#888"/>
        <text x="4" y="${y(100).toFixed(0)}" font-size="8">100</text>
        ${bars}
        <polyline points="${linePts}" fill="none" stroke="#c00000" stroke-width="1.5"/>
        ${xlabels}
      </svg><div>${legend}<span style="font-size:9px;color:#c00000">— Rata-rata</span></div>`;
    })();

    const dateStr = fmtDateId(new Date());
    return `<!doctype html><html><head><meta charset="utf-8"><title>Laporan Hasil Belajar — ${esc(st.name)}</title><style>
*{box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;color:#111;margin:0;padding:28px;font-size:12.5px}
.lh{display:flex;justify-content:space-between;align-items:center;border-bottom:3px double #1e3a5f;padding-bottom:10px}
.lh img{height:56px;width:56px;object-fit:contain}
.lh .brand{text-align:center;flex:1}
.lh .brand .l1{font-size:11px;color:#444}
.lh .brand .l2{font-size:22px;font-weight:800;color:#c00000;letter-spacing:1px}
.lh .brand .l3{font-size:11px;font-style:italic;color:#444}
.lh .brand .l4{font-size:10.5px;color:#333;margin-top:3px}
h1.title{text-align:center;font-size:17px;letter-spacing:2px;margin:18px 0 2px}
.subtitle{text-align:center;font-size:12px;letter-spacing:1px;color:#333;margin-bottom:16px}
.addr{margin:10px 0;font-size:12.5px}
.greet{margin:10px 0;text-align:justify;line-height:1.55;font-size:12.5px}
table.idbox{width:100%;border-collapse:collapse;margin:14px 0}
table.idbox td{padding:5px 8px;vertical-align:top;font-size:12.5px}
.nisbox{background:#cfe3f3;border:1px solid #7fa8c9;text-align:center;font-weight:800;font-size:15px;padding:10px;width:34%;color:#1e3a5f}
.nislbl{font-size:9.5px;font-weight:700;color:#fff;background:#5b9bd5;padding:3px;letter-spacing:1px;margin-bottom:6px}
table{border-collapse:collapse;width:100%;margin:10px 0}
th,td{border:1px solid #888;padding:4px 7px;text-align:left}
th{background:#ffe08a;font-size:11.5px}.num{text-align:center;width:28px}.ctr{text-align:center}
tr.avg td{background:#cfe3f3}
.sect{font-size:12.5px;font-weight:700;background:#fdeada;padding:5px 8px;margin:18px 0 4px;letter-spacing:1px}
.footgrid{display:flex;justify-content:space-between;align-items:flex-end;margin-top:18px}
.sig{text-align:center;font-size:12px;min-width:220px}
.sig img{height:60px;object-fit:contain;display:block;margin:2px auto}
.sig .nm{font-weight:700;border-bottom:1px solid #333;display:inline-block;min-width:170px;margin-top:4px}
@media print{body{padding:0}}
</style></head><body>
<div class="lh">
  <div class="brand">
    <div class="l1">Bimbingan Belajar</div>
    <div class="l2">${esc(compName)}</div>
    ${tagline ? `<div class="l3">${esc(tagline)}</div>` : ''}
    <div class="l4">${esc(address)}${phone ? ` &nbsp;·&nbsp; SMS/WA: ${esc(phone)}` : ''}</div>
  </div>
  ${logoUrl ? `<img src="${esc(logoUrl)}" alt="logo" onerror="this.style.display='none'">` : ''}
</div>
<h1 class="title">LAPORAN HASIL BELAJAR SISWA</h1>
<div class="subtitle">${esc(report.main?.programName ?? 'PROGRAM KELAS REGULER')}</div>
<div class="addr">Kepada Yth.<br>Orang Tua/Wali <b>${esc(parentLabel)}</b>${st.levelName ? ` Kelas ${esc(st.levelName)}` : ''}<br>Di Tempat</div>
<div class="greet"><i>Assalammu'alaikum Wr. Wb.</i><br>Berdasarkan hasil evaluasi terhadap proses kegiatan pembelajaran dan perkembangan belajar siswa, laporan ini berguna untuk melihat perkembangan belajar Ananda dalam mencapai target nilai. Berikut kami sampaikan laporan hasil belajar Ananda:</div>
<table class="idbox"><tr>
  <td class="nisbox" rowspan="4"><div class="nislbl">NOMOR INDUK SISWA (NIS)</div>${esc(st.nis ?? '-')}</td>
  <td style="width:14%">Nama</td><td>: ${esc(st.name)}</td>
</tr><tr><td>Sekolah</td><td>: ${esc(st.school ?? '-')}</td></tr>
<tr><td>Pil. 1</td><td>: ${esc(st.majorChoice1 ?? '-')}</td></tr>
<tr><td>Pil. 2</td><td>: ${esc(st.majorChoice2 ?? '-')}</td></tr></table>
<div class="sect">PERKEMBANGAN NILAI ${esc((report.main?.categoryLabel ?? 'TRY OUT').toUpperCase())} SISWA</div>
${report.basic && report.basic.rows.length ? `<div class="sect" style="background:#e2efda">TES KEMAMPUAN DASAR — ${esc(report.basic.categoryLabel.toUpperCase())}</div>${sectionTable(report.basic, false)}` : ''}
${report.main && report.main.rows.length ? sectionTable(report.main) : '<p><i>Belum ada ujian bertipe ini yang sudah dinilai.</i></p>'}
<div class="footgrid">
  <div>${chart}</div>
  <div class="sig">
    <div>Hormat Kami,</div>
    <div>${esc(signerTitle)}</div>
    ${signatureUrl ? `<img src="${esc(signatureUrl)}" alt="ttd" onerror="this.style.display='none'">` : '<div style="height:60px"></div>'}
    <div class="nm">${esc(signerName || compName)}</div>
    <div>${esc(compName)}</div>
    <div style="font-size:10px;color:#666">${dateStr}</div>
  </div>
</div>
<script>window.onload=()=>setTimeout(()=>window.print(),400)</script>
</body></html>`;
  }
}
