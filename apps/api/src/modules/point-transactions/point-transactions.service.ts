/**
 * Fase 4b — Point Transactions Service
 * Manages point transactions for students
 * Records all point changes (exam completion, latsol, bonuses, penalties)
 */
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ScoreRulesService } from '../score-rules/score-rules.service';
import { CreatePointTransactionDto } from './dto/create-point-transaction.dto';
import { PointEventType } from '@prisma/client';

@Injectable()
export class PointTransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoreRules: ScoreRulesService,
  ) {}

  /**
   * Create a point transaction
   */
  async create(createPointTransactionDto: CreatePointTransactionDto) {
    // Verify student exists
    const student = await this.prisma.student.findUnique({
      where: { id: createPointTransactionDto.studentId },
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    // If scoreRuleId is provided, verify it exists
    if (createPointTransactionDto.scoreRuleId) {
      const rule = await this.prisma.scoreRule.findUnique({
        where: { id: createPointTransactionDto.scoreRuleId },
      });

      if (!rule) {
        throw new NotFoundException('Score rule not found');
      }
    }

    // Auto-generate period if not provided (current month)
    const now = new Date();
    const period =
      createPointTransactionDto.period ||
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    return this.prisma.pointTransaction.create({
      data: {
        ...createPointTransactionDto,
        period,
      },
    });
  }

  /**
   * Get all point transactions for a student
   */
  async findByStudent(
    studentId: string,
    filters?: {
      eventType?: PointEventType;
      period?: string;
      limit?: number;
    },
  ) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    return this.prisma.pointTransaction.findMany({
      where: {
        studentId,
        ...(filters?.eventType && { eventType: filters.eventType }),
        ...(filters?.period && { period: filters.period }),
      },
      include: {
        scoreRule: true,
      },
      orderBy: { createdAt: 'desc' },
      take: filters?.limit || 50,
    });
  }

  /**
   * Get total points for a student
   */
  async getStudentTotalPoints(studentId: string, period?: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    const where: { studentId: string; period?: string } = { studentId };
    if (period) {
      where.period = period;
    }

    const transactions = await this.prisma.pointTransaction.findMany({
      where,
      select: { points: true },
    });

    const totalPoints = transactions.reduce((sum, t) => sum + t.points, 0);

    return {
      studentId,
      period: period || 'all-time',
      totalPoints,
      transactionCount: transactions.length,
    };
  }

  /**
   * Get point transaction by ID
   */
  async findOne(id: string) {
    const transaction = await this.prisma.pointTransaction.findUnique({
      where: { id },
      include: {
        student: {
          include: {
            user: {
              select: { name: true, email: true },
            },
          },
        },
        scoreRule: true,
      },
    });

    if (!transaction) {
      throw new NotFoundException('Point transaction not found');
    }

    return transaction;
  }

  /**
   * Create point transactions for exam completion.
   * Dipanggil otomatis saat attempt di-submit (manual atau auto-submit).
   * Idempotent: bila event ini sudah pernah dicatat, return data lama
   * tanpa membuat transaksi baru — perubahan score_rule setelahnya
   * tidak retroaktif terhadap attempt yang sudah diproses.
   * Satu transaksi per rule yang berlaku (breakdown dari ScoreRulesService).
   */
  async createExamTransaction(examAttemptId: string) {
    const attempt = await this.prisma.examAttempt.findUnique({
      where: { id: examAttemptId },
      include: { exam: { select: { title: true } } },
    });

    if (!attempt) {
      throw new NotFoundException('Exam attempt not found');
    }

    if (attempt.status !== 'SUBMITTED') {
      throw new ForbiddenException(
        'Can only create points for submitted attempts',
      );
    }

    const existing = await this.prisma.pointTransaction.findMany({
      where: {
        eventType: PointEventType.EXAM_COMPLETED,
        referenceType: 'EXAM_ATTEMPT',
        referenceId: examAttemptId,
      },
      include: { scoreRule: { select: { name: true } } },
    });
    if (existing.length) {
      return { alreadyProcessed: true, transactions: existing };
    }

    const calc = await this.scoreRules.calculateExamPoints(examAttemptId);
    const at = attempt.submittedAt ?? new Date();
    const period = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}`;

    const transactions = await this.prisma.$transaction(
      calc.breakdown.map((b) =>
        this.prisma.pointTransaction.create({
          data: {
            studentId: attempt.studentId,
            scoreRuleId: b.ruleId,
            eventType: PointEventType.EXAM_COMPLETED,
            points: b.points,
            referenceId: examAttemptId,
            referenceType: 'EXAM_ATTEMPT',
            description: `${attempt.exam.title} — ${b.ruleName}: ${b.details.join('; ')}`,
            period,
          },
        }),
      ),
    );

    return { alreadyProcessed: false, transactions };
  }

  /**
   * Create point transactions for latsol completion.
   * Idempotent & per-rule seperti createExamTransaction.
   */
  async createLatsolTransaction(latsolAttemptId: string) {
    const attempt = await this.prisma.latsolAttempt.findUnique({
      where: { id: latsolAttemptId },
      include: { package: { select: { title: true } } },
    });

    if (!attempt) {
      throw new NotFoundException('Latsol attempt not found');
    }

    if (attempt.status !== 'SUBMITTED') {
      throw new ForbiddenException(
        'Can only create points for submitted attempts',
      );
    }

    const existing = await this.prisma.pointTransaction.findMany({
      where: {
        eventType: PointEventType.LATSOL_COMPLETED,
        referenceType: 'LATSOL_ATTEMPT',
        referenceId: latsolAttemptId,
      },
      include: { scoreRule: { select: { name: true } } },
    });
    if (existing.length) {
      return { alreadyProcessed: true, transactions: existing };
    }

    const calc = await this.scoreRules.calculateLatsolPoints(latsolAttemptId);
    const at = attempt.submittedAt ?? new Date();
    const period = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}`;

    const transactions = await this.prisma.$transaction(
      calc.breakdown.map((b) =>
        this.prisma.pointTransaction.create({
          data: {
            studentId: attempt.studentId,
            scoreRuleId: b.ruleId,
            eventType: PointEventType.LATSOL_COMPLETED,
            points: b.points,
            referenceId: latsolAttemptId,
            referenceType: 'LATSOL_ATTEMPT',
            description: `${attempt.package.title} — ${b.ruleName}: ${b.details.join('; ')}`,
            period,
          },
        }),
      ),
    );

    return { alreadyProcessed: false, transactions };
  }

  /**
   * Create manual adjustment (bonus or penalty)
   */
  async createManualAdjustment(
    studentId: string,
    points: number,
    description?: string,
  ) {
    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    return this.create({
      studentId,
      eventType: points > 0 ? PointEventType.BONUS : PointEventType.PENALTY,
      points,
      description:
        description || (points > 0 ? 'Manual bonus' : 'Manual penalty'),
      period,
    });
  }

  /**
   * Get leaderboard data for a scope (kelompok/level/program/gedung + periode).
   * `currentUserId` dipakai untuk menyertakan posisi siswa yang sedang login
   * (`me`) meski di luar `limit` teratas.
   */
  async getLeaderboard(
    filters?: {
      groupId?: string;
      levelId?: string;
      programId?: string;
      buildingId?: string;
      myGroup?: boolean;
      period?: string;
      limit?: number;
    },
    currentUserId?: string,
  ) {
    const where: { period?: string } = {};

    if (filters?.period) {
      where.period = filters.period;
    }

    // Get all transactions matching filters
    const transactions = await this.prisma.pointTransaction.findMany({
      where,
      include: {
        student: {
          include: {
            user: {
              select: { name: true, avatarUrl: true },
            },
            groupMembers: {
              include: {
                group: {
                  include: {
                    program: true,
                    level: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    // Filter by scope if provided
    let filteredTransactions = transactions;
    if (filters?.groupId) {
      filteredTransactions = filteredTransactions.filter((t) =>
        t.student.groupMembers.some((gm) => gm.groupId === filters.groupId),
      );
    }
    if (filters?.levelId) {
      filteredTransactions = filteredTransactions.filter((t) =>
        t.student.groupMembers.some(
          (gm) => gm.group.levelId === filters.levelId,
        ),
      );
    }
    if (filters?.programId) {
      filteredTransactions = filteredTransactions.filter((t) =>
        t.student.groupMembers.some(
          (gm) => gm.group.programId === filters.programId,
        ),
      );
    }
    if (filters?.buildingId) {
      // Gedung tidak direlasikan langsung ke siswa — scope-nya adalah siswa
      // yang tergabung di kelompok dengan sesi di ruang gedung tersebut.
      const groupRows = await this.prisma.session.findMany({
        where: { room: { buildingId: filters.buildingId } },
        select: { groupId: true },
        distinct: ['groupId'],
      });
      const buildingGroupIds = new Set(groupRows.map((r) => r.groupId));
      filteredTransactions = filteredTransactions.filter((t) =>
        t.student.groupMembers.some((gm) => buildingGroupIds.has(gm.groupId)),
      );
    }
    if (filters?.myGroup && currentUserId) {
      // Scope "kelompok saya" — siswa: kelompoknya sendiri; ortu: gabungan
      // kelompok semua anaknya. Dipakai yang tidak punya akses daftar grup global.
      const meStudent = await this.prisma.student.findUnique({
        where: { userId: currentUserId },
        include: { groupMembers: { select: { groupId: true } } },
      });
      let myGroupIds = new Set(
        (meStudent?.groupMembers ?? []).map((gm) => gm.groupId),
      );
      if (!meStudent) {
        const meParent = await this.prisma.parent.findUnique({
          where: { userId: currentUserId },
          include: {
            parentStudents: {
              include: {
                student: {
                  include: { groupMembers: { select: { groupId: true } } },
                },
              },
            },
          },
        });
        myGroupIds = new Set(
          (meParent?.parentStudents ?? []).flatMap((ps) =>
            ps.student.groupMembers.map((gm) => gm.groupId),
          ),
        );
      }
      filteredTransactions = filteredTransactions.filter((t) =>
        t.student.groupMembers.some((gm) => myGroupIds.has(gm.groupId)),
      );
    }

    // Aggregate points by student
    const studentPoints = new Map<
      string,
      {
        studentId: string;
        studentName: string;
        avatarUrl: string | null;
        schoolOrigin: string | null;
        groupNames: string[];
        totalPoints: number;
        transactionCount: number;
      }
    >();

    for (const transaction of filteredTransactions) {
      const studentId = transaction.studentId;
      const studentName = transaction.student.user.name;

      if (!studentPoints.has(studentId)) {
        studentPoints.set(studentId, {
          studentId,
          studentName,
          avatarUrl: transaction.student.user.avatarUrl,
          schoolOrigin: transaction.student.schoolOrigin,
          groupNames: transaction.student.groupMembers.map(
            (gm) => gm.group.name,
          ),
          totalPoints: 0,
          transactionCount: 0,
        });
      }

      const data = studentPoints.get(studentId)!;
      data.totalPoints += transaction.points;
      data.transactionCount++;
    }

    // Urutkan semua siswa, lalu potong sesuai limit — posisi `me` dihitung
    // dari urutan penuh supaya siswa di luar top-N tetap tahu rank-nya.
    const ranked = Array.from(studentPoints.values()).sort(
      (a, b) =>
        b.totalPoints - a.totalPoints ||
        a.studentName.localeCompare(b.studentName),
    );

    const leaderboard = ranked
      .slice(0, filters?.limit || 50)
      .map((entry, index) => ({
        rank: index + 1,
        ...entry,
      }));

    let me: { studentId: string; rank: number; totalPoints: number } | null =
      null;
    if (currentUserId) {
      const student = await this.prisma.student.findUnique({
        where: { userId: currentUserId },
        select: { id: true },
      });
      if (student) {
        const idx = ranked.findIndex((e) => e.studentId === student.id);
        me = {
          studentId: student.id,
          rank: idx >= 0 ? idx + 1 : 0,
          totalPoints: idx >= 0 ? ranked[idx].totalPoints : 0,
        };
      }
    }

    return {
      period: filters?.period || 'all-time',
      filters,
      leaderboard,
      me,
    };
  }
}
