import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationEventsService } from '../notifications/notification-events.service';
import { monthRange } from '../../common/utils/month-range';
import {
  CreateAdjustmentDto,
  CreateManualWorkItemDto,
  CreateTutorRateDto,
  PayPayrollRunDto,
  TutorWorkTypeValue,
  UpdateTutorRateDto,
  UpdateWorkItemDto,
} from './dto/payroll.dto';

const tutorSelect = {
  id: true,
  user: { select: { id: true, name: true, email: true } },
} as const;

const rateInclude = {
  tutor: { select: tutorSelect },
} as const;

const workItemInclude = {
  tutor: { select: tutorSelect },
  session: {
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      status: true,
      group: { select: { id: true, name: true } },
    },
  },
  rate: { select: { id: true, workType: true, unit: true, amount: true } },
} as const;

const runInclude = {
  tutor: { select: tutorSelect },
  account: { select: { id: true, name: true, code: true, type: true } },
  adjustments: { orderBy: { createdAt: 'asc' as const } },
  workItems: {
    include: workItemInclude,
    orderBy: { occurredAt: 'asc' as const },
  },
} as const;

type Tx = Prisma.TransactionClient;

/**
 * Fase 5a — Tutor Payroll.
 * Work items SESI ditarik dari Session COMPLETED (absensi Fase 1d menandai
 * sesi selesai) — bukan input manual. Klasifikasi:
 *   - kelompok 1 anggota        -> PRIVATE_SESSION
 *   - sesi dari template jadwal -> REGULAR_SESSION
 *   - sesi ad-hoc lainnya       -> EXTRA_CLASS
 * SPECIAL_TASK hanya dibuat manual (tidak ada sumber operasional).
 * Semua nominal di-snapshot di work item; pembayaran dibungkus transaction.
 */
@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: NotificationEventsService,
  ) {}

  private periodOf(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  private assertPeriod(period: string) {
    try {
      monthRange(period);
    } catch {
      throw new BadRequestException('Format periode harus YYYY-MM.');
    }
  }

  /** Kuantitas item dari rate: HOUR = durasi sesi (jam), selain itu 1 unit. */
  private quantityFor(
    rate: { unit: string } | null | undefined,
    session?: { startsAt: Date; endsAt: Date } | null,
  ) {
    if (rate?.unit === 'HOUR' && session) {
      const hours =
        (session.endsAt.getTime() - session.startsAt.getTime()) / 3_600_000;
      return Math.max(hours, 0);
    }
    return 1;
  }

  /** Tarif aktif yang berlaku pada tanggal `at` untuk tutor + jenis kerja. */
  private async findRate(
    tutorId: string,
    workType: TutorWorkTypeValue,
    at: Date,
    tx?: Tx,
  ) {
    const db = tx ?? this.prisma;
    return db.tutorRate.findFirst({
      where: {
        tutorId,
        workType,
        isActive: true,
        effectiveFrom: { lte: at },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: at } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });
  }

  /** Hitung ulang gross/adjustment/net sebuah run dari sumbernya. */
  private async recalcRun(tx: Tx, runId: string) {
    const [items, adjustments] = await Promise.all([
      tx.tutorWorkItem.findMany({
        where: { payrollRunId: runId },
        select: { amount: true },
      }),
      tx.payrollAdjustment.findMany({
        where: { payrollRunId: runId },
        select: { amount: true },
      }),
    ]);
    const gross = items.reduce((s, i) => s + Number(i.amount), 0);
    const adj = adjustments.reduce((s, a) => s + Number(a.amount), 0);
    return tx.payrollRun.update({
      where: { id: runId },
      data: {
        grossAmount: new Prisma.Decimal(gross),
        adjustmentAmount: new Prisma.Decimal(adj),
        netAmount: new Prisma.Decimal(gross + adj),
      },
    });
  }

  private assertUnpaid(run: { status: string }) {
    if (run.status === 'PAID') {
      throw new BadRequestException(
        'Payroll sudah dibayar — tidak bisa diubah.',
      );
    }
  }

  // ------------------------------------------------------------------ rates

  listRates(tutorId?: string) {
    return this.prisma.tutorRate.findMany({
      where: tutorId ? { tutorId } : {},
      include: rateInclude,
      orderBy: [
        { tutorId: 'asc' },
        { workType: 'asc' },
        { effectiveFrom: 'desc' },
      ],
      take: 500,
    });
  }

  async createRate(dto: CreateTutorRateDto) {
    const tutor = await this.prisma.tutor.findUnique({
      where: { id: dto.tutorId },
    });
    if (!tutor) throw new BadRequestException('Tutor tidak ditemukan.');
    const from = new Date(dto.effectiveFrom);
    const to = dto.effectiveTo ? new Date(dto.effectiveTo) : null;
    if (Number.isNaN(from.getTime()) || (to && Number.isNaN(to.getTime()))) {
      throw new BadRequestException('Tanggal masa berlaku tidak valid.');
    }
    if (to && to < from) {
      throw new BadRequestException(
        'effectiveTo tidak boleh sebelum effectiveFrom.',
      );
    }
    return this.prisma.tutorRate.create({
      data: {
        tutorId: dto.tutorId,
        workType: dto.workType,
        amount: new Prisma.Decimal(String(dto.amount)),
        unit: dto.unit ?? 'SESSION',
        effectiveFrom: from,
        effectiveTo: to,
      },
      include: rateInclude,
    });
  }

  async updateRate(id: string, dto: UpdateTutorRateDto) {
    const rate = await this.prisma.tutorRate.findUnique({ where: { id } });
    if (!rate) throw new NotFoundException('Tarif tidak ditemukan.');
    const from =
      dto.effectiveFrom !== undefined
        ? new Date(dto.effectiveFrom)
        : rate.effectiveFrom;
    const to =
      dto.effectiveTo === undefined
        ? rate.effectiveTo
        : dto.effectiveTo
          ? new Date(dto.effectiveTo)
          : null;
    if (Number.isNaN(from.getTime()) || (to && Number.isNaN(to.getTime()))) {
      throw new BadRequestException('Tanggal masa berlaku tidak valid.');
    }
    if (to && to < from) {
      throw new BadRequestException(
        'effectiveTo tidak boleh sebelum effectiveFrom.',
      );
    }
    return this.prisma.tutorRate.update({
      where: { id },
      data: {
        amount:
          dto.amount !== undefined
            ? new Prisma.Decimal(String(dto.amount))
            : undefined,
        unit: dto.unit,
        effectiveFrom: from,
        effectiveTo: to,
        isActive: dto.isActive,
      },
      include: rateInclude,
    });
  }

  // ------------------------------------------------------------- work items

  listWorkItems(query: { period?: string; tutorId?: string }) {
    const where: Record<string, unknown> = {};
    if (query.period) {
      this.assertPeriod(query.period);
      where.period = query.period;
    }
    if (query.tutorId) where.tutorId = query.tutorId;
    return this.prisma.tutorWorkItem.findMany({
      where,
      include: workItemInclude,
      orderBy: [{ occurredAt: 'asc' }],
      take: 500,
    });
  }

  /**
   * Tarik work items dari Session COMPLETED pada periode (jangan input manual
   * duplikat). Sesi tanpa tarif yang cocok tetap dicatat dengan amount 0 dan
   * dilaporkan di `unrated` supaya admin bisa menambah tarif lalu reprice.
   */
  async generateWorkItems(actorId: string, period: string, tutorId?: string) {
    this.assertPeriod(period);
    const { start, end } = monthRange(period);
    const sessions = await this.prisma.session.findMany({
      where: {
        status: 'COMPLETED',
        tutorId: { not: null },
        startsAt: { gte: start, lte: end },
        ...(tutorId ? { tutorId } : {}),
      },
      include: {
        tutor: { select: tutorSelect },
        group: {
          select: {
            id: true,
            name: true,
            _count: { select: { members: true } },
          },
        },
      },
      orderBy: { startsAt: 'asc' },
    });

    const sessionIds = sessions.map((s) => s.id);
    const existing = await this.prisma.tutorWorkItem.findMany({
      where: { sessionId: { in: sessionIds } },
      select: { sessionId: true },
    });
    const existingSet = new Set(existing.map((e) => e.sessionId));

    // Absen kehadiran tutor: sesi dengan status IZIN/SAKIT/ALFA tidak dihitung
    // sebagai work item (tutor tidak mengajar). Sesi tanpa catatan (data lama)
    // dan HADIR/TERLAMBAT tetap dihitung — kompatibel dengan payroll historis.
    const presence = await this.prisma.tutorAttendance.findMany({
      where: { sessionId: { in: sessionIds } },
      select: { sessionId: true, status: true },
    });
    const absentSet = new Set(
      presence
        .filter((p) => p.status === 'IZIN' || p.status === 'SAKIT' || p.status === 'ALFA')
        .map((p) => p.sessionId),
    );

    let created = 0;
    let skippedAbsent = 0;
    const unrated: Array<{
      sessionId: string;
      tutorName: string;
      workType: string;
    }> = [];

    for (const session of sessions) {
      if (existingSet.has(session.id) || !session.tutorId) continue;
      if (absentSet.has(session.id)) {
        skippedAbsent += 1;
        continue;
      }
      const memberCount = session.group._count.members;
      const workType: TutorWorkTypeValue =
        memberCount <= 1
          ? 'PRIVATE_SESSION'
          : session.scheduleId
            ? 'REGULAR_SESSION'
            : 'EXTRA_CLASS';
      const rate = await this.findRate(
        session.tutorId,
        workType,
        session.startsAt,
      );
      const quantity = this.quantityFor(rate, session);
      const unitAmount = rate ? Number(rate.amount) : 0;
      if (!rate && session.tutor) {
        unrated.push({
          sessionId: session.id,
          tutorName: session.tutor.user.name,
          workType,
        });
      }
      await this.prisma.tutorWorkItem.create({
        data: {
          tutorId: session.tutorId,
          workType,
          sourceType: 'SESSION',
          sessionId: session.id,
          period,
          description: `Sesi ${session.group.name} — ${session.startsAt.toISOString().slice(0, 10)} ${session.startsAt.toISOString().slice(11, 16)}`,
          occurredAt: session.startsAt,
          quantity: new Prisma.Decimal(quantity.toFixed(2)),
          rateId: rate?.id ?? null,
          unitAmount: new Prisma.Decimal(unitAmount),
          amount: new Prisma.Decimal((quantity * unitAmount).toFixed(2)),
          createdBy: actorId,
        },
      });
      created += 1;
    }

    return {
      period,
      sessionsFound: sessions.length,
      created,
      skippedExisting: sessions.length - created - skippedAbsent,
      skippedAbsent,
      unrated,
    };
  }

  /** Tugas khusus — satu-satunya work item yang boleh diinput manual. */
  async createManualWorkItem(actorId: string, dto: CreateManualWorkItemDto) {
    const tutor = await this.prisma.tutor.findUnique({
      where: { id: dto.tutorId },
    });
    if (!tutor) throw new BadRequestException('Tutor tidak ditemukan.');
    const occurredAt = new Date(dto.occurredAt);
    if (Number.isNaN(occurredAt.getTime())) {
      throw new BadRequestException('Tanggal kerja tidak valid.');
    }
    const quantity = dto.quantity ?? 1;
    let rateId: string | null = null;
    let unitAmount = dto.unitAmount;
    if (unitAmount === undefined) {
      const rate = await this.findRate(dto.tutorId, 'SPECIAL_TASK', occurredAt);
      if (!rate) {
        throw new BadRequestException(
          'Tidak ada tarif SPECIAL_TASK yang berlaku — isi unitAmount manual atau buat tarif dulu.',
        );
      }
      rateId = rate.id;
      unitAmount = Number(rate.amount);
    }
    return this.prisma.tutorWorkItem.create({
      data: {
        tutorId: dto.tutorId,
        workType: 'SPECIAL_TASK',
        sourceType: 'MANUAL',
        period: this.periodOf(occurredAt),
        description: dto.description.trim(),
        occurredAt,
        quantity: new Prisma.Decimal(String(quantity)),
        rateId,
        unitAmount: new Prisma.Decimal(String(unitAmount)),
        amount: new Prisma.Decimal((quantity * unitAmount).toFixed(2)),
        createdBy: actorId,
      },
      include: workItemInclude,
    });
  }

  async updateWorkItem(id: string, dto: UpdateWorkItemDto) {
    const item = await this.prisma.tutorWorkItem.findUnique({
      where: { id },
      include: {
        payrollRun: { select: { id: true, status: true } },
        session: { select: { startsAt: true, endsAt: true } },
      },
    });
    if (!item) throw new NotFoundException('Work item tidak ditemukan.');
    if (item.payrollRun) this.assertUnpaid(item.payrollRun);

    return this.prisma.$transaction(async (tx) => {
      const workType = dto.workType ?? item.workType;
      let quantity = dto.quantity ?? Number(item.quantity);
      let rateId = item.rateId;
      let unitAmount =
        dto.unitAmount !== undefined ? dto.unitAmount : Number(item.unitAmount);

      if (dto.unitAmount !== undefined) {
        rateId = null; // override manual — lepas referensi tarif
      } else if (dto.workType && dto.workType !== item.workType) {
        const rate = await this.findRate(
          item.tutorId,
          dto.workType,
          item.occurredAt,
          tx,
        );
        rateId = rate?.id ?? null;
        unitAmount = rate ? Number(rate.amount) : 0;
        // Tarif HOUR: kuantitas mengikuti durasi sesi sumbernya.
        if (dto.quantity === undefined && item.session) {
          quantity = this.quantityFor(rate, item.session);
        }
      }

      const updated = await tx.tutorWorkItem.update({
        where: { id },
        data: {
          workType,
          quantity: new Prisma.Decimal(String(quantity)),
          unitAmount: new Prisma.Decimal(String(unitAmount)),
          amount: new Prisma.Decimal((quantity * unitAmount).toFixed(2)),
          rateId,
          description: dto.description,
        },
        include: workItemInclude,
      });

      if (item.payrollRunId) await this.recalcRun(tx, item.payrollRunId);
      return updated;
    });
  }

  async deleteWorkItem(id: string) {
    const item = await this.prisma.tutorWorkItem.findUnique({
      where: { id },
      include: { payrollRun: { select: { id: true, status: true } } },
    });
    if (!item) throw new NotFoundException('Work item tidak ditemukan.');
    if (item.payrollRun) this.assertUnpaid(item.payrollRun);

    return this.prisma.$transaction(async (tx) => {
      await tx.tutorWorkItem.delete({ where: { id } });
      if (item.payrollRunId) await this.recalcRun(tx, item.payrollRunId);
      return item;
    });
  }

  /**
   * Reprice ulang work items periode tsb — dipakai setelah admin menambah/
   * mengubah tarif. Hanya menyentuh item yang belum masuk run PAID.
   */
  async repriceWorkItems(period: string, tutorId?: string) {
    this.assertPeriod(period);
    const items = await this.prisma.tutorWorkItem.findMany({
      where: {
        period,
        ...(tutorId ? { tutorId } : {}),
        OR: [{ payrollRunId: null }, { payrollRun: { status: 'UNPAID' } }],
      },
      select: {
        id: true,
        tutorId: true,
        workType: true,
        occurredAt: true,
        payrollRunId: true,
        rateId: true,
        quantity: true,
        sourceType: true,
        session: { select: { startsAt: true, endsAt: true } },
      },
    });
    const affectedRuns = new Set<string>();
    let repriced = 0;
    const stillUnrated: string[] = [];

    await this.prisma.$transaction(async (tx) => {
      for (const item of items) {
        const rate = await this.findRate(
          item.tutorId,
          item.workType,
          item.occurredAt,
          tx,
        );
        if (!rate) {
          if (item.rateId === null) stillUnrated.push(item.id);
          continue;
        }
        // Tarif HOUR pada item sesi: kuantitas = durasi sesi (bukan 1).
        const quantity =
          item.sourceType === 'SESSION' && item.session
            ? this.quantityFor(rate, item.session)
            : Number(item.quantity);
        const unitAmount = Number(rate.amount);
        await tx.tutorWorkItem.update({
          where: { id: item.id },
          data: {
            rateId: rate.id,
            quantity: new Prisma.Decimal(quantity.toFixed(2)),
            unitAmount: new Prisma.Decimal(unitAmount),
            amount: new Prisma.Decimal((quantity * unitAmount).toFixed(2)),
          },
        });
        repriced += 1;
        if (item.payrollRunId) affectedRuns.add(item.payrollRunId);
      }
      for (const runId of affectedRuns) await this.recalcRun(tx, runId);
    });

    return {
      period,
      repriced,
      stillUnrated: stillUnrated.length,
      runsRecalculated: affectedRuns.size,
    };
  }

  // ------------------------------------------------------------ payroll run

  listRuns(query: { period?: string; status?: string }) {
    const where: Record<string, unknown> = {};
    if (query.period) {
      this.assertPeriod(query.period);
      where.period = query.period;
    }
    if (query.status) where.status = query.status;
    return this.prisma.payrollRun.findMany({
      where,
      include: {
        tutor: { select: tutorSelect },
        account: { select: { id: true, name: true, code: true, type: true } },
        _count: { select: { workItems: true, adjustments: true } },
      },
      orderBy: [{ period: 'desc' }, { createdAt: 'asc' }],
      take: 200,
    });
  }

  async getRun(id: string) {
    const run = await this.prisma.payrollRun.findUnique({
      where: { id },
      include: runInclude,
    });
    if (!run) throw new NotFoundException('Payroll run tidak ditemukan.');
    return run;
  }

  private async nextRunNumber(tx: Tx, period: string) {
    const prefix = `PAY-${period.replace('-', '')}-`;
    const last = await tx.payrollRun.findFirst({
      where: { number: { startsWith: prefix } },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    const seq = last ? (Number(last.number.slice(prefix.length)) || 0) + 1 : 1;
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }

  /**
   * Buat/hitung ulang payroll per periode dari work items yang sudah ditarik.
   * Run UNPAID yang sudah ada di-sync ulang (item baru ikut masuk);
   * run PAID dilewati dan dilaporkan di `skippedPaid`.
   */
  async generateRuns(actorId: string, period: string, tutorId?: string) {
    this.assertPeriod(period);
    const items = await this.prisma.tutorWorkItem.findMany({
      where: { period, ...(tutorId ? { tutorId } : {}) },
      select: { id: true, tutorId: true, payrollRunId: true },
    });
    const byTutor = new Map<string, string[]>();
    for (const item of items) {
      const list = byTutor.get(item.tutorId) ?? [];
      list.push(item.id);
      byTutor.set(item.tutorId, list);
    }

    const result = {
      period,
      processed: 0,
      created: 0,
      updated: 0,
      skippedPaid: [] as string[],
    };

    for (const [tId, itemIds] of byTutor) {
      const processed = await this.prisma.$transaction(async (tx) => {
        let run = await tx.payrollRun.findUnique({
          where: { tutorId_period: { tutorId: tId, period } },
        });
        if (run?.status === 'PAID') return 'paid';
        let created = false;
        if (!run) {
          run = await tx.payrollRun.create({
            data: {
              number: await this.nextRunNumber(tx, period),
              tutorId: tId,
              period,
              createdBy: actorId,
            },
          });
          created = true;
        }
        await tx.tutorWorkItem.updateMany({
          where: {
            id: { in: itemIds },
            OR: [{ payrollRunId: null }, { payrollRunId: run.id }],
          },
          data: { payrollRunId: run.id },
        });
        await this.recalcRun(tx, run.id);
        return created ? 'created' : 'updated';
      });
      if (processed === 'paid') result.skippedPaid.push(tId);
      else {
        result.processed += 1;
        if (processed === 'created') result.created += 1;
        else result.updated += 1;
      }
    }

    return result;
  }

  // ----------------------------------------------------------- adjustments

  async addAdjustment(
    runId: string,
    actorId: string,
    dto: CreateAdjustmentDto,
  ) {
    const run = await this.getRun(runId);
    this.assertUnpaid(run);
    if (dto.amount === 0) {
      throw new BadRequestException('Nominal adjustment tidak boleh nol.');
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.payrollAdjustment.create({
        data: {
          payrollRunId: runId,
          amount: new Prisma.Decimal(String(dto.amount)),
          reason: dto.reason.trim(),
          createdBy: actorId,
        },
      });
      await this.recalcRun(tx, runId);
      return tx.payrollRun.findUniqueOrThrow({
        where: { id: runId },
        include: runInclude,
      });
    });
  }

  async removeAdjustment(runId: string, adjustmentId: string) {
    const run = await this.getRun(runId);
    this.assertUnpaid(run);
    const adj = run.adjustments.find((a) => a.id === adjustmentId);
    if (!adj) throw new NotFoundException('Adjustment tidak ditemukan.');
    return this.prisma.$transaction(async (tx) => {
      await tx.payrollAdjustment.delete({ where: { id: adjustmentId } });
      await this.recalcRun(tx, runId);
      return { deleted: adj };
    });
  }

  // ------------------------------------------------------------------- pay

  /**
   * Bayar payroll — WAJIB transaction (aturan finance): status PAID +
   * expense HONOR_PEGAWAI + ledger OUT kas/bank dibuat atomik.
   */
  async pay(id: string, actorId: string, dto: PayPayrollRunDto) {
    const run = await this.prisma.payrollRun.findUnique({
      where: { id },
      include: { tutor: { select: tutorSelect } },
    });
    if (!run) throw new NotFoundException('Payroll run tidak ditemukan.');
    this.assertUnpaid(run);
    if (Number(run.netAmount) < 0) {
      throw new BadRequestException(
        'Net pay negatif — perbaiki adjustment dulu.',
      );
    }
    const account = await this.prisma.financialAccount.findUnique({
      where: { id: dto.accountId },
    });
    if (!account || !account.isActive) {
      throw new BadRequestException(
        'Akun kas/bank tidak valid atau tidak aktif.',
      );
    }

    const paid = await this.prisma.$transaction(async (tx) => {
      const budget = await tx.budget.findUnique({
        where: {
          category_period: { category: 'HONOR_PEGAWAI', period: run.period },
        },
        select: { id: true },
      });
      const description = `Honor tutor ${run.tutor.user.name} — payroll ${run.number} periode ${run.period}`;
      const now = new Date();
      const expense = await tx.expense.create({
        data: {
          budgetId: budget?.id ?? null,
          accountId: dto.accountId,
          amount: run.netAmount,
          description,
          category: 'HONOR_PEGAWAI',
          occurredAt: now,
          createdBy: actorId,
        },
      });
      await tx.ledgerEntry.create({
        data: {
          accountId: dto.accountId,
          direction: 'OUT',
          amount: run.netAmount,
          sourceType: 'EXPENSE',
          sourceId: expense.id,
          description: `Pengeluaran: ${description}`,
          occurredAt: now,
        },
      });
      await tx.payrollRun.update({
        where: { id },
        data: {
          status: 'PAID',
          accountId: dto.accountId,
          expenseId: expense.id,
          paidAt: now,
          paidBy: actorId,
        },
      });
      return tx.payrollRun.findUniqueOrThrow({
        where: { id },
        include: runInclude,
      });
    });
    // Fase 5b: "payroll dibayar" -> notif + WA ke tutor terkait.
    await this.events.payrollPaid(id);
    return paid;
  }

  // ------------------------------------------------------------- tutor self

  /** Profil & rincian honor tutor yang sedang login (payroll.view_own). */
  async myPayroll(userId: string, period?: string) {
    const tutor = await this.prisma.tutor.findUnique({
      where: { userId },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    if (!tutor) throw new NotFoundException('Profil tutor tidak ditemukan.');
    if (period) this.assertPeriod(period);
    const runs = await this.prisma.payrollRun.findMany({
      where: { tutorId: tutor.id, ...(period ? { period } : {}) },
      include: runInclude,
      orderBy: { period: 'desc' },
      take: 24,
    });
    return { tutor, runs };
  }
}
