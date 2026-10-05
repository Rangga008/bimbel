import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { monthRange } from '../../common/utils/month-range';
import { CreateBudgetDto, UpdateBudgetDto } from './dto/budget.dto';

/**
 * Fase 2d — RAB (Budget) management.
 * Budget per kategori per periode (format YYYY-MM).
 * Digunakan untuk membandingkan dengan actual expense.
 */
@Injectable()
export class BudgetService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: { period?: string; category?: string }) {
    const where: Record<string, unknown> = {};
    if (query.period) where.period = query.period;
    if (query.category) where.category = query.category;
    
    return this.prisma.budget.findMany({
      where,
      include: {
        expenses: {
          select: { id: true, amount: true, occurredAt: true },
          orderBy: { occurredAt: 'desc' },
          take: 10,
        },
      },
      orderBy: [{ period: 'desc' }, { category: 'asc' }],
      take: 100,
    });
  }

  async get(id: string) {
    const budget = await this.prisma.budget.findUnique({
      where: { id },
      include: {
        expenses: {
          include: {
            account: { select: { id: true, name: true, code: true } },
          },
          orderBy: { occurredAt: 'desc' },
        },
      },
    });
    if (!budget) throw new NotFoundException('Budget tidak ditemukan.');
    return budget;
  }

  async create(actorId: string, dto: CreateBudgetDto) {
    void actorId;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(dto.period)) {
      throw new BadRequestException('Format periode harus YYYY-MM dengan bulan 01-12.');
    }

    // Cek duplikat category + period
    const existing = await this.prisma.budget.findFirst({
      where: {
        category: dto.category,
        period: dto.period,
      },
    });
    if (existing) {
      throw new BadRequestException(`Budget untuk kategori ${dto.category} periode ${dto.period} sudah ada.`);
    }

    return this.prisma.budget.create({
      data: {
        category: dto.category,
        period: dto.period,
        amount: new Prisma.Decimal(String(dto.amount)),
        description: dto.description,
      },
    });
  }

  async update(id: string, dto: UpdateBudgetDto) {
    const budget = await this.prisma.budget.findUnique({ where: { id } });
    if (!budget) throw new NotFoundException('Budget tidak ditemukan.');
    const nextCategory = dto.category ?? budget.category;
    const nextPeriod = dto.period ?? budget.period;
    if (dto.period !== undefined && !/^\d{4}-(0[1-9]|1[0-2])$/.test(nextPeriod)) {
      throw new BadRequestException('Format periode harus YYYY-MM dengan bulan 01-12.');
    }
    // Cek duplikat jika category/period berubah
    if (nextCategory !== budget.category || nextPeriod !== budget.period) {
      const existing = await this.prisma.budget.findFirst({
        where: {
          category: dto.category ?? budget.category,
          period: dto.period ?? budget.period,
          id: { not: id },
        },
      });
      if (existing) {
        throw new BadRequestException('Budget dengan kategori dan periode tersebut sudah ada.');
      }
    }

    return this.prisma.budget.update({
      where: { id },
      data: {
        category: dto.category,
        period: dto.period,
        amount: dto.amount ? new Prisma.Decimal(String(dto.amount)) : undefined,
        description: dto.description,
        isActive: dto.isActive,
      },
    });
  }

  async delete(id: string) {
    const budget = await this.prisma.budget.findUnique({ where: { id } });
    if (!budget) throw new NotFoundException('Budget tidak ditemukan.');

    // Cek apakah ada expense terkait
    const expenseCount = await this.prisma.expense.count({ where: { budgetId: id } });
    if (expenseCount > 0) {
      throw new BadRequestException('Tidak bisa menghapus budget yang masih memiliki expense terkait.');
    }

    return this.prisma.budget.delete({ where: { id } });
  }

  async getBudgetVsActual(period: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
      throw new BadRequestException('Format periode harus YYYY-MM.');
    }
    const { start, end } = monthRange(period);
    const budgets = await this.prisma.budget.findMany({
      where: { period },
      orderBy: { category: 'asc' },
    });
    const expenses = await this.prisma.expense.findMany({
      where: { occurredAt: { gte: start, lte: end } },
      select: { budgetId: true, category: true, amount: true },
    });
    const byBudget = new Map<string, { total: number; count: number }>();
    const byCategory = new Map<string, number>();
    for (const e of expenses) {
      const amt = Number(e.amount);
      const cur = byBudget.get(e.budgetId ?? '') ?? { total: 0, count: 0 };
      if (e.budgetId) byBudget.set(e.budgetId, { total: cur.total + amt, count: cur.count + 1 });
      byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + amt);
    }
    return budgets.map((budget) => {
      const linked = byBudget.get(budget.id);
      const catTotal = byCategory.get(budget.category) ?? 0;
      const actual = linked ? linked.total : catTotal;
      const budgetAmount = Number(budget.amount);
      const variance = Math.round((budgetAmount - actual) * 100) / 100;
      const variancePercent = budgetAmount > 0 ? Math.round(((variance / budgetAmount) * 100) * 100) / 100 : 0;
      const utilization = budgetAmount > 0 ? Math.round(((actual / budgetAmount) * 100) * 100) / 100 : 0;
      return {
        budgetId: budget.id,
        category: budget.category,
        period: budget.period,
        budget: budgetAmount,
        actual: Math.round(actual * 100) / 100,
        variance,
        variancePercent,
        utilization,
        expenseCount: linked ? linked.count : 0,
      };
    });
  }

  async getSummary(period?: string) {
    const p = period || new Date().toISOString().slice(0, 7);
    const { start, end } = monthRange(/^\d{4}-(0[1-9]|1[0-2])$/.test(p) ? p : new Date().toISOString().slice(0, 7));
    const budgets = await this.prisma.budget.findMany({ where: { period: p } });
    const totalBudget = budgets.reduce((sum, b) => sum + Number(b.amount), 0);
    const expenses = await this.prisma.expense.findMany({
      where: { occurredAt: { gte: start, lte: end } },
    });
    const totalActual = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
    return {
      period: p,
      totalBudget,
      totalActual,
      remaining: totalBudget - totalActual,
      budgetCount: budgets.length,
      expenseCount: expenses.length,
    };
  }
}