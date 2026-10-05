// Unit test Fase 5a — tanpa DB (mock PrismaService).
// Skenario DoD:
// 1. Work items ditarik dari sesi COMPLETED (klasifikasi reguler/private/ekstra,
//    guard anti-duplikat via sessionId, snapshot tarif).
// 2. Payroll 1 tutor: sesi reguler + private + 1 adjustment -> net benar.
// 3. Pay: 1 transaksi -> PAID + expense HONOR_PEGAWAI + ledger OUT.
import { Prisma } from '@prisma/client';
import { PayrollService } from './payroll.service';

type Rec = Record<string, unknown>;

function makePrismaMock() {
  const tx = {
    tutorRate: { findFirst: jest.fn() },
    tutorWorkItem: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    payrollRun: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    payrollAdjustment: {
      findMany: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    budget: { findUnique: jest.fn() },
    expense: { create: jest.fn() },
    ledgerEntry: { create: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
    session: { findMany: jest.fn() },
    tutorAttendance: {
      findMany: jest.fn(
        async (): Promise<Array<{ sessionId: string; status: string }>> => [],
      ),
    },
    tutor: { findUnique: jest.fn() },
    tutorRate: { findFirst: jest.fn() },
    tutorWorkItem: {
      findMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    payrollRun: { findUnique: jest.fn(), findMany: jest.fn() },
    financialAccount: { findUnique: jest.fn() },
  };
  return { tx, prisma };
}

// Fase 5b: NotificationEventsService di-stub — trigger notif diuji terpisah.
function eventsStub() {
  return { payrollPaid: jest.fn(() => Promise.resolve()) };
}

const tutor = { id: 't-1', user: { id: 'u-1', name: 'Tutor A', email: 'a@x' } };
const S = (
  id: string,
  opts: { scheduleId?: string | null; members: number },
) => ({
  id,
  tutorId: 't-1',
  scheduleId: opts.scheduleId ?? null,
  startsAt: new Date('2026-09-07T16:00:00'),
  endsAt: new Date('2026-09-07T17:30:00'),
  tutor,
  group: { id: 'g-1', name: 'Kelas A', _count: { members: opts.members } },
});

describe('PayrollService (Fase 5a)', () => {
  it('menarik work items dari sesi COMPLETED: klasifikasi + snapshot tarif + anti duplikat', async () => {
    const { prisma } = makePrismaMock();
    const svc = new PayrollService(prisma as never, eventsStub() as never);
    prisma.session.findMany.mockResolvedValue([
      S('s-1', { scheduleId: 'sch-1', members: 5 }), // reguler
      S('s-2', { scheduleId: 'sch-1', members: 5 }), // reguler
      S('s-3', { scheduleId: null, members: 1 }), // private (1 siswa)
      S('s-4', { scheduleId: null, members: 5 }), // kelas tambahan (ad-hoc)
    ]);
    // s-2 sudah punya work item -> harus di-skip (anti duplikat).
    prisma.tutorWorkItem.findMany.mockResolvedValue([{ sessionId: 's-2' }]);
    prisma.tutorRate.findFirst.mockImplementation(
      (a: { where: { workType: string } }) => {
        const amounts: Record<string, number> = {
          REGULAR_SESSION: 75000,
          PRIVATE_SESSION: 100000,
          EXTRA_CLASS: 90000,
        };
        const amount = amounts[a.where.workType];
        return Promise.resolve(
          amount
            ? {
                id: `r-${a.where.workType}`,
                amount: new Prisma.Decimal(amount),
                unit: 'SESSION',
              }
            : null,
        );
      },
    );
    prisma.tutorWorkItem.create.mockImplementation((a: { data: Rec }) =>
      Promise.resolve(a.data),
    );

    const res = await svc.generateWorkItems('admin-1', '2026-09');
    expect(res.created).toBe(3);
    expect(res.skippedExisting).toBe(1);

    const createdCalls = prisma.tutorWorkItem.create.mock.calls as Array<
      [{ data: Rec }]
    >;
    const created = createdCalls.map((c) => c[0].data);
    const bySession = Object.fromEntries(
      created.map((d) => [d.sessionId as string, d]),
    );
    expect(bySession['s-1'].workType).toBe('REGULAR_SESSION');
    expect(Number(bySession['s-1'].amount)).toBe(75000);
    expect(bySession['s-3'].workType).toBe('PRIVATE_SESSION');
    expect(Number(bySession['s-3'].amount)).toBe(100000);
    expect(bySession['s-4'].workType).toBe('EXTRA_CLASS');
    expect(Number(bySession['s-4'].amount)).toBe(90000);
    // Semua item sesi tercatat sourceType SESSION + sessionId -> auditable.
    for (const d of created) {
      expect(d.sourceType).toBe('SESSION');
      expect(d.sessionId).toBeTruthy();
    }
  });

  it('melewati sesi yang tutor-nya absen (IZIN/SAKIT/ALFA) — absen hadir memengaruhi payroll', async () => {
    const { prisma } = makePrismaMock();
    const svc = new PayrollService(prisma as never, eventsStub() as never);
    prisma.session.findMany.mockResolvedValue([
      S('s-1', { scheduleId: 'sch-1', members: 5 }),
      S('s-2', { scheduleId: 'sch-1', members: 5 }),
    ]);
    prisma.tutorWorkItem.findMany.mockResolvedValue([]);
    // s-2: tutor ditandai ALFA -> tidak boleh jadi work item.
    prisma.tutorAttendance.findMany.mockResolvedValue([
      { sessionId: 's-1', status: 'HADIR' },
      { sessionId: 's-2', status: 'ALFA' },
    ]);
    prisma.tutorRate.findFirst.mockResolvedValue({
      id: 'r-1',
      amount: new Prisma.Decimal(75000),
      unit: 'SESSION',
    });
    prisma.tutorWorkItem.create.mockImplementation((a: { data: Rec }) =>
      Promise.resolve(a.data),
    );

    const res = await svc.generateWorkItems('admin-1', '2026-09');
    expect(res.created).toBe(1);
    expect(res.skippedAbsent).toBe(1);
    expect(prisma.tutorWorkItem.create).toHaveBeenCalledTimes(1);
    expect(prisma.tutorWorkItem.create.mock.calls[0][0].data.sessionId).toBe(
      's-1',
    );
  });

  it('generateRuns + adjustment: net = gross + adjustment dan bisa diaudit ke work items', async () => {
    const { tx, prisma } = makePrismaMock();
    const svc = new PayrollService(prisma as never, eventsStub() as never);
    const items = [
      { id: 'w-1', tutorId: 't-1', payrollRunId: null },
      { id: 'w-2', tutorId: 't-1', payrollRunId: null },
    ];
    prisma.tutorWorkItem.findMany.mockResolvedValue(items);
    tx.payrollRun.findUnique.mockResolvedValue(null);
    tx.payrollRun.findFirst.mockResolvedValue(null); // nextRunNumber
    tx.payrollRun.create.mockImplementation((a: { data: Rec }) =>
      Promise.resolve({ id: 'run-1', status: 'UNPAID', ...a.data }),
    );
    // recalcRun: gross = 75000 + 100000 (reguler + private)
    tx.tutorWorkItem.findMany.mockResolvedValue([
      { amount: new Prisma.Decimal(75000) },
      { amount: new Prisma.Decimal(100000) },
    ]);
    tx.payrollAdjustment.findMany.mockResolvedValue([]);
    tx.payrollRun.update.mockImplementation((a: { data: Rec }) =>
      Promise.resolve({ id: 'run-1', ...a.data }),
    );

    const res = await svc.generateRuns('admin-1', '2026-09');
    expect(res.created).toBe(1);
    // Semua work items ditautkan ke run (jejak audit sumber angka).
    expect(tx.tutorWorkItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { payrollRunId: 'run-1' } }),
    );
    const runUpdates = tx.payrollRun.update.mock.calls as Array<
      [{ data: Rec }]
    >;
    expect(Number(runUpdates[0][0].data.grossAmount)).toBe(175000);

    // Tambah adjustment +10000 -> net 185000.
    prisma.payrollRun.findUnique.mockResolvedValue({
      id: 'run-1',
      status: 'UNPAID',
      adjustments: [],
    });
    tx.payrollAdjustment.create.mockResolvedValue({ id: 'adj-1' });
    tx.payrollAdjustment.findMany.mockResolvedValue([
      { amount: new Prisma.Decimal(10000) },
    ]);
    tx.payrollRun.findUniqueOrThrow.mockResolvedValue({
      id: 'run-1',
      netAmount: new Prisma.Decimal(185000),
    });
    const updated = (await svc.addAdjustment('run-1', 'admin-1', {
      amount: 10000,
      reason: 'Bonus',
    })) as { netAmount: unknown };
    const lastUpdate = runUpdates.at(-1)![0].data;
    expect(Number(lastUpdate.netAmount)).toBe(185000);
    expect(Number(updated.netAmount)).toBe(185000);
  });

  it('pay: transaction -> PAID + expense HONOR_PEGAWAI + ledger OUT', async () => {
    const { tx, prisma } = makePrismaMock();
    const events = eventsStub();
    const svc = new PayrollService(prisma as never, events as never);
    prisma.payrollRun.findUnique.mockResolvedValue({
      id: 'run-1',
      number: 'PAY-202609-0001',
      period: '2026-09',
      status: 'UNPAID',
      netAmount: new Prisma.Decimal(185000),
      tutor,
    });
    prisma.financialAccount.findUnique.mockResolvedValue({
      id: 'kas-1',
      isActive: true,
    });
    tx.budget.findUnique.mockResolvedValue({ id: 'b-1' });
    tx.expense.create.mockImplementation((a: { data: Rec }) =>
      Promise.resolve({ id: 'exp-1', ...a.data }),
    );
    tx.payrollRun.update.mockResolvedValue({});
    tx.payrollRun.findUniqueOrThrow.mockResolvedValue({
      id: 'run-1',
      status: 'PAID',
    });

    const res = (await svc.pay('run-1', 'admin-1', {
      accountId: 'kas-1',
    })) as { status: string };
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.expense.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          category: 'HONOR_PEGAWAI',
          accountId: 'kas-1',
        }) as Rec,
      }),
    );
    expect(tx.ledgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          direction: 'OUT',
          sourceType: 'EXPENSE',
          sourceId: 'exp-1',
        }) as Rec,
      }),
    );
    expect(tx.payrollRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'PAID',
          expenseId: 'exp-1',
          paidBy: 'admin-1',
        }) as Rec,
      }),
    );
    expect(res.status).toBe('PAID');
    // Fase 5b: "payroll dibayar" memicu trigger notifikasi ke tutor.
    expect(events.payrollPaid).toHaveBeenCalledWith('run-1');
  });

  it('adjustment nol dan run PAID ditolak', async () => {
    const { prisma } = makePrismaMock();
    const svc = new PayrollService(prisma as never, eventsStub() as never);
    prisma.payrollRun.findUnique.mockResolvedValue({
      id: 'run-1',
      status: 'UNPAID',
      adjustments: [],
    });
    await expect(
      svc.addAdjustment('run-1', 'admin-1', { amount: 0, reason: 'x' }),
    ).rejects.toThrow('tidak boleh nol');
    prisma.payrollRun.findUnique.mockResolvedValue({
      id: 'run-1',
      status: 'PAID',
      adjustments: [],
    });
    await expect(
      svc.addAdjustment('run-1', 'admin-1', { amount: 1000, reason: 'x' }),
    ).rejects.toThrow('sudah dibayar');
  });
});
