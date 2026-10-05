import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { monthRange } from '../../common/utils/month-range';
import { CreateExpenseDto, UpdateExpenseDto } from './dto/expense.dto';

/**
 * Fase 2d — Expense (Pengeluaran) management.
 * Terhubung ke kategori RAB & financial_accounts.
 * Mengurangi saldo kas/bank via ledger entry.
 */
@Injectable()
export class ExpenseService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: { period?: string; category?: string; accountId?: string; search?: string; from?: string; to?: string }) {
    const where: Record<string, unknown> = {};

    if (query.from || query.to) {
      const occurredAt: { gte?: Date; lte?: Date } = {};
      if (query.from) {
        const d = new Date(query.from);
        if (Number.isNaN(d.getTime())) throw new BadRequestException('Format tanggal "from" tidak valid.');
        occurredAt.gte = d;
      }
      if (query.to) {
        const d = new Date(query.to);
        if (Number.isNaN(d.getTime())) throw new BadRequestException('Format tanggal "to" tidak valid.');
        occurredAt.lte = d;
      }
      where.occurredAt = occurredAt;
    }

    if (query.period && !query.from && !query.to) {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(query.period)) {
        throw new BadRequestException('Format periode harus YYYY-MM.');
      }
      const { start, end } = monthRange(query.period);
      where.occurredAt = { gte: start, lte: end };
    }
    
    if (query.category) where.category = query.category;
    if (query.accountId) where.accountId = query.accountId;
    
    if (query.search) {
      where.OR = [
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    
    return this.prisma.expense.findMany({
      where,
      include: {
        budget: { select: { id: true, category: true, period: true, amount: true } },
        account: { select: { id: true, name: true, code: true, type: true } },
      },
      orderBy: { occurredAt: 'desc' },
      take: 100,
    });
  }

  async get(id: string) {
    const expense = await this.prisma.expense.findUnique({
      where: { id },
      include: {
        budget: { select: { id: true, category: true, period: true, amount: true } },
        account: { select: { id: true, name: true, code: true, type: true } },
      },
    });
    if (!expense) throw new NotFoundException('Expense tidak ditemukan.');
    return expense;
  }

  async create(actorId: string, dto: CreateExpenseDto) {
    // Validasi akun kas/bank
    const account = await this.prisma.financialAccount.findUnique({
      where: { id: dto.accountId },
    });
    if (!account || !account.isActive) {
      throw new BadRequestException('Akun kas/bank tidak valid atau tidak aktif.');
    }

    // Validasi budget jika ada
    if (dto.budgetId) {
      const budget = await this.prisma.budget.findUnique({
        where: { id: dto.budgetId },
      });
      if (!budget) throw new BadRequestException('Budget tidak ditemukan.');
    }

    return this.prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          budgetId: dto.budgetId,
          accountId: dto.accountId,
          amount: new Prisma.Decimal(String(dto.amount)),
          description: dto.description.trim(),
          category: dto.category,
          occurredAt: new Date(dto.occurredAt),
          receiptUrl: dto.receiptUrl,
          createdBy: actorId,
        },
      });

      // Kurangi saldo kas/bank via ledger entry
      await tx.ledgerEntry.create({
        data: {
          accountId: dto.accountId,
          direction: 'OUT',
          amount: new Prisma.Decimal(String(dto.amount)),
          sourceType: 'EXPENSE',
          sourceId: expense.id,
          description: `Pengeluaran: ${dto.description.trim()}`,
          occurredAt: new Date(dto.occurredAt),
        },
      });

      return tx.expense.findUniqueOrThrow({
        where: { id: expense.id },
        include: {
          budget: { select: { id: true, category: true, period: true, amount: true } },
          account: { select: { id: true, name: true, code: true, type: true } },
        },
      });
    });
  }

  /** Koreksi expense + sinkron ledger. TIDAK ada hard-delete (aturan finance). */
  async update(id: string, dto: UpdateExpenseDto) {
    const expense = await this.prisma.expense.findUnique({ where: { id } });
    if (!expense) throw new NotFoundException('Expense tidak ditemukan.');

    // Validasi akun jika berubah
    if (dto.accountId && dto.accountId !== expense.accountId) {
      const account = await this.prisma.financialAccount.findUnique({
        where: { id: dto.accountId },
      });
      if (!account || !account.isActive) {
        throw new BadRequestException('Akun kas/bank tidak valid atau tidak aktif.');
      }
    }

    // Validasi budget jika berubah
    if (dto.budgetId && dto.budgetId !== expense.budgetId) {
      const budget = await this.prisma.budget.findUnique({
        where: { id: dto.budgetId },
      });
      if (!budget) throw new BadRequestException('Budget tidak ditemukan.');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.expense.update({
        where: { id },
        data: {
          budgetId: dto.budgetId,
          accountId: dto.accountId,
          amount: dto.amount ? new Prisma.Decimal(String(dto.amount)) : undefined,
          description: dto.description,
          category: dto.category,
          occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : undefined,
          receiptUrl: dto.receiptUrl,
        },
      });

      // Update ledger entry jika amount atau account berubah
      if (dto.amount || dto.accountId) {
        const existingLedger = await tx.ledgerEntry.findFirst({
          where: { sourceType: 'EXPENSE', sourceId: id },
        });

        if (existingLedger) {
          const oldAmount = Number(existingLedger.amount);
          const newAmount = dto.amount ? Number(dto.amount) : oldAmount;
          const newAccountId = dto.accountId ?? existingLedger.accountId;

          await tx.ledgerEntry.update({
            where: { id: existingLedger.id },
            data: {
              accountId: newAccountId,
              amount: new Prisma.Decimal(String(newAmount)),
              description: `Pengeluaran: ${dto.description ?? expense.description}`,
              occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : existingLedger.occurredAt,
            },
          });
        }
      }

      return tx.expense.findUniqueOrThrow({
        where: { id },
        include: {
          budget: { select: { id: true, category: true, period: true, amount: true } },
          account: { select: { id: true, name: true, code: true, type: true } },
        },
      });
    });
  }

  /** DILARANG dipakai dari controller: finance tidak boleh hard-delete. */
  async delete(id: string) {
    void id;
    throw new BadRequestException('Expense tidak bisa dihapus — koreksi via PATCH + audit log.');
  }

  async getSummary(period?: string) {
    const fallback = new Date().toISOString().slice(0, 7);
    const safe = period && /^\d{4}-(0[1-9]|1[0-2])$/.test(period) ? period : fallback;
    const { start, end } = monthRange(safe);
    const expenses = await this.prisma.expense.findMany({
      where: { occurredAt: { gte: start, lte: end } },
    });
    const totalAmount = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
    const byCategory = new Map<string, number>();
    for (const exp of expenses) {
      byCategory.set(exp.category, (byCategory.get(exp.category) ?? 0) + Number(exp.amount));
    }
    return { period: safe, totalAmount, expenseCount: expenses.length, byCategory: Object.fromEntries(byCategory) };
  }
}