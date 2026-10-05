import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateRefundDto } from './dto/refund.dto';

const arInclude = {
  student: {
    select: {
      id: true,
      user: { select: { id: true, name: true, email: true } },
      parentStudents: {
        select: { parent: { select: { user: { select: { name: true } } } } },
        take: 2,
      },
    },
  },
  package: { select: { id: true, name: true, code: true } },
  enrollmentLink: {
    select: {
      program: { select: { name: true } },
      level: { select: { name: true } },
      group: { select: { name: true } },
    },
  },
  enrollment: {
    select: {
      program: { select: { name: true } },
      level: { select: { name: true } },
      group: { select: { name: true } },
    },
  },
  refunds: { orderBy: { createdAt: 'desc' as const }, take: 5 },
} as const;

function money(v: unknown): number {
  return Number(v);
}

/**
 * Fase 2c — Piutang, refund, ledger kas/bank.
 * Refund: credit note dulu (turunkan outstanding), sisa yang sudah terbayar di-cash-out.
 * Semua mutasi finansial dalam 1 $transaction. Tidak ada soft-delete.
 */
@Injectable()
export class RefundsService {
  constructor(private readonly prisma: PrismaService) {}

  private async refundNumber(tx: Prisma.TransactionClient): Promise<string> {
    const d = new Date();
    const prefix = `RF-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}-`;
    for (let i = 0; i < 20; i += 1) {
      const last = await tx.refund.findFirst({
        where: { number: { startsWith: prefix } },
        orderBy: { number: 'desc' },
        select: { number: true },
      });
      const seq = last ? (Number(last.number.slice(prefix.length)) || 0) + 1 : 1;
      const candidate = `${prefix}${String(seq).padStart(4, '0')}`;
      const clash = await tx.refund.findUnique({ where: { number: candidate } });
      if (!clash) return candidate;
    }
    return `${prefix}${String(Date.now()).slice(-4)}`;
  }

  private withArFields<T extends { totalAmount: unknown; amountPaid: unknown; dueDate: Date | null; reminderStatus: string }>(
    inv: T,
  ) {
    const outstanding = Math.max(0, Math.round((money(inv.totalAmount) - money(inv.amountPaid)) * 100) / 100);
    const due = inv.dueDate ? new Date(inv.dueDate) : null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isOverdue = Boolean(due && due < today && outstanding > 0.009);
    return { ...inv, outstanding, isOverdue };
  }

  async listAr(query: { search?: string; reminderStatus?: string; overdue?: string }) {
    const where: Record<string, unknown> = { status: 'ISSUED' };
    if (query.reminderStatus) {
      const s = query.reminderStatus.toUpperCase();
      if (!['NONE', 'PENDING', 'SENT'].includes(s)) {
        throw new BadRequestException('Status reminder tidak valid (NONE/PENDING/SENT).');
      }
      where.reminderStatus = s;
    }
    if (query.search) {
      where.OR = [
        { number: { contains: query.search, mode: 'insensitive' } },
        { student: { user: { name: { contains: query.search, mode: 'insensitive' } } } },
      ];
    }
    const rows = await this.prisma.invoice.findMany({
      where,
      include: arInclude,
      take: 300,
    });
    const mapped = rows
      .map((r) => this.withArFields(r))
      .filter((r) => r.outstanding > 0.009);
    const overdueOnly = query.overdue === '1' || query.overdue === 'true';
    const filtered = overdueOnly ? mapped.filter((r) => r.isOverdue) : mapped;
    filtered.sort((a, b) => {
      const ad = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
      const bd = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
      if (ad !== bd) return ad - bd;
      return a.number.localeCompare(b.number);
    });
    return filtered.slice(0, 100);
  }

  /**
   * Invoice ISSUED yang masih ada sisa & jatuh tempo dalam `days` hari
   * (termasuk yang sudah lewat). Dipakai reminder jatuh tempo massal.
   */
  async dueInvoices(days = 7) {
    const until = new Date();
    until.setDate(until.getDate() + Math.max(0, days));
    const rows = await this.prisma.invoice.findMany({
      where: { status: 'ISSUED', dueDate: { lte: until } },
      select: { id: true, number: true, totalAmount: true, amountPaid: true, dueDate: true },
      orderBy: { dueDate: 'asc' },
      take: 200,
    });
    return rows.filter((r) => money(r.totalAmount) - money(r.amountPaid) > 0.009);
  }

  async setReminder(invoiceId: string, status: 'NONE' | 'PENDING' | 'SENT') {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundException('Invoice tidak ditemukan.');
    if (invoice.status !== 'ISSUED') {
      throw new BadRequestException('Reminder hanya untuk invoice ISSUED.');
    }
    return this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        reminderStatus: status,
        remindedAt: status === 'NONE' ? null : new Date(),
      },
      include: arInclude,
    }).then((row) => this.withArFields(row));
  }

  listRefunds(invoiceId?: string) {
    return this.prisma.refund.findMany({
      where: invoiceId ? { invoiceId } : undefined,
      include: {
        invoice: {
          select: {
            id: true, number: true, studentId: true,
            student: { select: { id: true, user: { select: { id: true, name: true } } } },
          },
        },
        account: { select: { id: true, name: true, code: true, type: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /** Snapshot invoice sebelum refund — untuk oldData audit log (aturan 00-project-overview). */
  async getInvoiceForAudit(invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, number: true, status: true, totalAmount: true, amountPaid: true },
    });
    if (!invoice) throw new NotFoundException('Invoice tidak ditemukan.');
    return {
      id: invoice.id,
      number: invoice.number,
      status: invoice.status,
      totalAmount: String(invoice.totalAmount),
      amountPaid: String(invoice.amountPaid),
    };
  }

  async createRefund(actorId: string, dto: CreateRefundDto) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: dto.invoiceId } });
    if (!invoice) throw new NotFoundException('Invoice tidak ditemukan.');
    if (invoice.status !== 'ISSUED') {
      throw new BadRequestException('Refund hanya untuk invoice ISSUED.');
    }
    const total = money(invoice.totalAmount);
    const paid = money(invoice.amountPaid);
    const outstanding = Math.max(0, total - paid);
    const amount = Number(dto.amount);
    if (amount - total > 0.009) {
      throw new BadRequestException('Nominal refund melebihi total invoice.');
    }
    const credit = Math.min(amount, outstanding);
    const cashOut = Math.round((amount - credit) * 100) / 100;
    if (cashOut - paid > 0.009) {
      throw new BadRequestException('Cash-out refund melebihi jumlah yang sudah dibayar.');
    }

    let accountId = dto.accountId ?? null;
    if (cashOut > 0.009) {
      if (!accountId) {
        const kas = await this.prisma.financialAccount.findFirst({ where: { code: 'KAS', isActive: true } });
        const fallback = kas ?? (await this.prisma.financialAccount.findFirst({ where: { isActive: true } }));
        if (!fallback) throw new BadRequestException('Akun kas/bank belum dikonfigurasi.');
        accountId = fallback.id;
      } else {
        const acc = await this.prisma.financialAccount.findUnique({ where: { id: accountId } });
        if (!acc || !acc.isActive) throw new BadRequestException('Akun kas/bank tidak valid.');
      }
    }

    const newTotal = Math.round((total - amount) * 100) / 100;
    const newPaid = Math.round((paid - cashOut) * 100) / 100;

    return this.prisma.$transaction(async (tx) => {
      const number = await this.refundNumber(tx);
      const refund = await tx.refund.create({
        data: {
          number,
          invoiceId: invoice.id,
          accountId,
          amount: new Prisma.Decimal(String(amount)),
          cashOut: new Prisma.Decimal(String(cashOut)),
          reason: dto.reason.trim(),
          createdBy: actorId,
        },
      });
      await tx.invoiceItem.create({
        data: {
          invoiceId: invoice.id,
          description: `Refund ${number}: ${dto.reason.trim()}`,
          quantity: 1,
          unitPrice: new Prisma.Decimal(String(-amount)),
          amount: new Prisma.Decimal(String(-amount)),
        },
      });
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          totalAmount: new Prisma.Decimal(String(newTotal)),
          amountPaid: new Prisma.Decimal(String(newPaid)),
        },
      });
      if (cashOut > 0.009 && accountId) {
        await tx.ledgerEntry.create({
          data: {
            accountId,
            direction: 'OUT',
            amount: new Prisma.Decimal(String(cashOut)),
            sourceType: 'REFUND',
            sourceId: refund.id,
            refundId: refund.id,
            description: `Refund ${number} invoice ${invoice.number}`,
            occurredAt: new Date(),
          },
        });
      }
      return tx.refund.findUniqueOrThrow({
        where: { id: refund.id },
        include: {
          invoice: { select: { id: true, number: true, totalAmount: true, amountPaid: true } },
          account: { select: { id: true, name: true, code: true } },
        },
      });
    });
  }

  /**
   * Transaksi manual harian — kas masuk/keluar di luar siklus invoice &
   * pengeluaran budget (mis. melayani tamu, spidol habis). Ditulis sebagai
   * LedgerEntry sourceType MANUAL agar tetap muncul di mutasi kas/bank.
   */
  async createManualEntry(dto: {
    accountId: string;
    direction: 'IN' | 'OUT';
    amount: number;
    description: string;
    occurredAt?: string;
  }) {
    const account = await this.prisma.financialAccount.findUnique({
      where: { id: dto.accountId },
    });
    if (!account) throw new NotFoundException('Akun kas/bank tidak ditemukan.');
    if (!account.isActive)
      throw new BadRequestException('Akun nonaktif — pilih akun aktif.');
    if (!['IN', 'OUT'].includes(dto.direction))
      throw new BadRequestException('Arah transaksi harus IN atau OUT.');
    if (!Number.isFinite(dto.amount) || dto.amount <= 0)
      throw new BadRequestException('Nominal harus lebih dari 0.');
    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();
    if (Number.isNaN(occurredAt.getTime()))
      throw new BadRequestException('Tanggal transaksi tidak valid.');
    const entry = await this.prisma.ledgerEntry.create({
      data: {
        accountId: dto.accountId,
        direction: dto.direction,
        amount: new Prisma.Decimal(String(dto.amount)),
        sourceType: 'MANUAL',
        sourceId: `manual-${Date.now()}`,
        description: dto.description.trim(),
        occurredAt,
      },
      include: {
        account: { select: { id: true, name: true, code: true, type: true } },
      },
    });
    return entry;
  }

  /** Hapus entry MANUAL — hanya transaksi ad-hoc yang boleh dihapus. */
  async deleteManualEntry(id: string) {
    const entry = await this.prisma.ledgerEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException('Transaksi tidak ditemukan.');
    if (entry.sourceType !== 'MANUAL')
      throw new BadRequestException(
        'Hanya transaksi manual yang bisa dihapus — transaksi dari invoice/refund/gaji dihapus lewat modulnya.',
      );
    await this.prisma.ledgerEntry.delete({ where: { id } });
    return { success: true };
  }

  async listLedger(query: { accountId?: string; from?: string; to?: string }) {
    const accounts = await this.prisma.financialAccount.findMany({ orderBy: { name: 'asc' } });
    const where: Record<string, unknown> = {};
    if (query.accountId) where.accountId = query.accountId;
    if (query.from || query.to) {
      const range: { gte?: Date; lte?: Date } = {};
      if (query.from) {
        const d = new Date(query.from);
        if (!Number.isNaN(d.getTime())) range.gte = d;
      }
      if (query.to) {
        const d = new Date(query.to);
        if (!Number.isNaN(d.getTime())) range.lte = d;
      }
      if (range.gte || range.lte) where.occurredAt = range;
    }
    const entries = await this.prisma.ledgerEntry.findMany({
      where,
      include: {
        account: { select: { id: true, name: true, code: true, type: true } },
      },
      orderBy: { occurredAt: 'desc' },
      take: 200,
    });
    // Saldo = agregat DB (SUM per akun per arah), bukan loop in-memory atas
    // seluruh tabel — konsisten untuk rekonsiliasi walau entries di-take(200).
    const sums = await this.prisma.ledgerEntry.groupBy({
      by: ['accountId', 'direction'],
      where: query.accountId ? { accountId: query.accountId } : undefined,
      _sum: { amount: true },
    });
    const sumMap = new Map<string, { in: number; out: number }>();
    for (const a of accounts) sumMap.set(a.id, { in: 0, out: 0 });
    for (const s of sums) {
      const row = sumMap.get(s.accountId) ?? { in: 0, out: 0 };
      if (s.direction === 'IN') row.in = money(s._sum.amount);
      else if (s.direction === 'OUT') row.out = money(s._sum.amount);
      sumMap.set(s.accountId, row);
    }
    const balances = accounts.map((a) => {
      const s = sumMap.get(a.id) ?? { in: 0, out: 0 };
      return {
        ...a,
        totalIn: s.in,
        totalOut: s.out,
        balance: Math.round((s.in - s.out) * 100) / 100,
      };
    });
    return { accounts: balances, entries };
  }
}
