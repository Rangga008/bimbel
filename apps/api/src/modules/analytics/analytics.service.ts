/**
 * Fase 4a — Analytics Service
 * Per-question analytics & student performance dashboard
 * Uses data from Fase 3 (exam_attempts, exam_answers) as source
 * Does NOT duplicate exam schema - pure aggregation
 */
import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

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

    // Calculate overall stats
    const overallStats = this.calculateOverallStats(examHistory);

    return {
      studentId: student.id,
      studentName: student.user.name,
      examHistory,
      topicAnalysis,
      overallStats,
    };
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
}
