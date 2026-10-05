/**
 * Fase 4b — Score Rules Service
 * Data-driven scoring system - rules stored in database, not hardcoded
 * Changes to rules only apply to future exams, not retroactive
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateScoreRuleDto } from './dto/create-score-rule.dto';
import { UpdateScoreRuleDto } from './dto/update-score-rule.dto';

@Injectable()
export class ScoreRulesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new score rule
   */
  async create(createScoreRuleDto: CreateScoreRuleDto) {
    return this.prisma.scoreRule.create({
      data: {
        ...createScoreRuleDto,
        validFrom: createScoreRuleDto.validFrom
          ? new Date(createScoreRuleDto.validFrom)
          : new Date(),
        validTo: createScoreRuleDto.validTo
          ? new Date(createScoreRuleDto.validTo)
          : null,
      },
    });
  }

  /**
   * Get all score rules
   */
  async findAll(filters?: { entityType?: string; isActive?: boolean }) {
    return this.prisma.scoreRule.findMany({
      where: {
        ...(filters?.entityType && { entityType: filters.entityType }),
        ...(filters?.isActive !== undefined && { isActive: filters.isActive }),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get a specific score rule
   */
  async findOne(id: string) {
    const rule = await this.prisma.scoreRule.findUnique({
      where: { id },
      include: {
        pointTransactions: {
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!rule) {
      throw new NotFoundException('Score rule not found');
    }

    return rule;
  }

  /**
   * Update a score rule
   * IMPORTANT: Changes only apply to future transactions, not retroactive
   */
  async update(id: string, updateScoreRuleDto: UpdateScoreRuleDto) {
    const existing = await this.prisma.scoreRule.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Score rule not found');
    }

    return this.prisma.scoreRule.update({
      where: { id },
      data: {
        ...updateScoreRuleDto,
        validFrom: updateScoreRuleDto.validFrom
          ? new Date(updateScoreRuleDto.validFrom)
          : undefined,
        validTo: updateScoreRuleDto.validTo
          ? new Date(updateScoreRuleDto.validTo)
          : undefined,
      },
    });
  }

  /**
   * Delete a score rule (soft delete by setting isActive to false)
   */
  async remove(id: string) {
    const existing = await this.prisma.scoreRule.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Score rule not found');
    }

    // Soft delete - don't actually remove the record
    return this.prisma.scoreRule.update({
      where: { id },
      data: { isActive: false },
    });
  }

  /**
   * Get active score rules for a specific entity type and value
   * This is used when calculating points for exams/latsol
   */
  async getActiveRules(entityType: string, entityValue?: string) {
    const now = new Date();

    return this.prisma.scoreRule.findMany({
      where: {
        entityType,
        entityValue: entityValue || null,
        isActive: true,
        validFrom: { lte: now },
        OR: [{ validTo: null }, { validTo: { gte: now } }],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Semua rule aktif & masih berlaku untuk suatu entityType (entityValue apa pun).
   * Dipakai untuk QUESTION_TYPE yang entityValue-nya adalah tipe soal —
   * pemilihan tipe dilakukan saat evaluasi jawaban, bukan di query ini.
   */
  async listActiveRules(entityType: string) {
    const now = new Date();

    return this.prisma.scoreRule.findMany({
      where: {
        entityType,
        isActive: true,
        validFrom: { lte: now },
        OR: [{ validTo: null }, { validTo: { gte: now } }],
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Rules yang berlaku untuk suatu entityType: rule umum (entityValue null)
   * plus rule yang menargetkan entityValue spesifik (mis. examId tertentu).
   * Rule dengan entityValue lain (milik exam/paket berbeda) tidak ikut.
   */
  async getApplicableRules(entityType: string, entityValue?: string | null) {
    const rules = await this.listActiveRules(entityType);
    return rules.filter((r) => !r.entityValue || r.entityValue === entityValue);
  }

  /**
   * Calculate points for an exam attempt based on active rules
   * This is data-driven - uses the rules from database, not hardcoded formulas.
   * Mengembalikan breakdown per-rule supaya tiap rule menghasilkan
   * point_transaction sendiri (perubahan rule tidak retroaktif).
   */
  async calculateExamPoints(examAttemptId: string) {
    const attempt = await this.prisma.examAttempt.findUnique({
      where: { id: examAttemptId },
      include: {
        exam: { select: { id: true, title: true } },
        answers: {
          include: { question: { select: { type: true } } },
        },
      },
    });

    if (!attempt) {
      throw new NotFoundException('Exam attempt not found');
    }

    const percentage =
      attempt.maxScore > 0 ? (attempt.score / attempt.maxScore) * 100 : 0;
    const breakdown: Array<{
      ruleId: string;
      ruleName: string;
      points: number;
      details: string[];
    }> = [];

    // Rules scoped ke EXAM (umum + khusus exam ini)
    const examRules = await this.getApplicableRules('EXAM', attempt.examId);
    for (const rule of examRules) {
      let points = 0;
      const details: string[] = [];

      if (rule.pointsPerUnit) {
        const base = attempt.score * rule.pointsPerUnit;
        points += base;
        details.push(
          `Base: ${attempt.score} × ${rule.pointsPerUnit} = ${base}`,
        );
      }
      if (
        rule.bonusThreshold != null &&
        rule.bonusPoints &&
        percentage >= rule.bonusThreshold
      ) {
        points += rule.bonusPoints;
        details.push(
          `Bonus: ${percentage.toFixed(1)}% ≥ ${rule.bonusThreshold}% = +${rule.bonusPoints}`,
        );
      }
      if (points !== 0) {
        breakdown.push({
          ruleId: rule.id,
          ruleName: rule.name,
          points,
          details,
        });
      }
    }

    // Rules per jenis soal (QUESTION_TYPE) — poin per jawaban benar per tipe.
    // Semua rule aktif diambil; entityValue = tipe soal yang ditarget.
    const qtRules = await this.listActiveRules('QUESTION_TYPE');
    for (const rule of qtRules) {
      const correctCount = attempt.answers.filter(
        (a) =>
          a.isCorrect &&
          (!rule.entityValue || a.question.type === rule.entityValue),
      ).length;
      const points = correctCount * (rule.pointsPerUnit ?? 0);
      if (points !== 0) {
        breakdown.push({
          ruleId: rule.id,
          ruleName: rule.name,
          points,
          details: [
            `${correctCount} jawaban benar ${rule.entityValue ?? '(semua tipe)'} × ${rule.pointsPerUnit}`,
          ],
        });
      }
    }

    return {
      totalPoints: breakdown.reduce((sum, r) => sum + r.points, 0),
      breakdown,
      attemptScore: attempt.score,
      maxScore: attempt.maxScore,
      percentage,
    };
  }

  /**
   * Calculate points for a latsol attempt based on active rules
   */
  async calculateLatsolPoints(latsolAttemptId: string) {
    const attempt = await this.prisma.latsolAttempt.findUnique({
      where: { id: latsolAttemptId },
      include: {
        package: { select: { id: true, title: true } },
        answers: {
          include: { question: { select: { type: true } } },
        },
      },
    });

    if (!attempt) {
      throw new NotFoundException('Latsol attempt not found');
    }

    const percentage =
      attempt.maxScore > 0 ? (attempt.score / attempt.maxScore) * 100 : 0;
    const breakdown: Array<{
      ruleId: string;
      ruleName: string;
      points: number;
      details: string[];
    }> = [];

    // Rules scoped ke LATSOL (umum + khusus paket ini)
    const latsolRules = await this.getApplicableRules(
      'LATSOL',
      attempt.packageId,
    );
    for (const rule of latsolRules) {
      let points = 0;
      const details: string[] = [];

      if (rule.pointsPerUnit) {
        const base = attempt.score * rule.pointsPerUnit;
        points += base;
        details.push(
          `Base: ${attempt.score} × ${rule.pointsPerUnit} = ${base}`,
        );
      }
      if (
        rule.bonusThreshold != null &&
        rule.bonusPoints &&
        percentage >= rule.bonusThreshold
      ) {
        points += rule.bonusPoints;
        details.push(
          `Bonus: ${percentage.toFixed(1)}% ≥ ${rule.bonusThreshold}% = +${rule.bonusPoints}`,
        );
      }
      if (points !== 0) {
        breakdown.push({
          ruleId: rule.id,
          ruleName: rule.name,
          points,
          details,
        });
      }
    }

    // Rules per jenis soal (QUESTION_TYPE) — entityValue = tipe soal target
    const qtRules = await this.listActiveRules('QUESTION_TYPE');
    for (const rule of qtRules) {
      const correctCount = attempt.answers.filter(
        (a) =>
          a.isCorrect &&
          (!rule.entityValue || a.question.type === rule.entityValue),
      ).length;
      const points = correctCount * (rule.pointsPerUnit ?? 0);
      if (points !== 0) {
        breakdown.push({
          ruleId: rule.id,
          ruleName: rule.name,
          points,
          details: [
            `${correctCount} jawaban benar ${rule.entityValue ?? '(semua tipe)'} × ${rule.pointsPerUnit}`,
          ],
        });
      }
    }

    return {
      totalPoints: breakdown.reduce((sum, r) => sum + r.points, 0),
      breakdown,
      attemptScore: attempt.score,
      maxScore: attempt.maxScore,
      percentage,
    };
  }
}
