import { Prisma } from '@prisma/client';
import { RefundsService } from './refunds.service';

function makePrismaMock() {
  const tx = {
    refund: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    invoiceItem: { create: jest.fn() },
    invoice: { update: jest.fn() },
    ledgerEntry: { create: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    invoice: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    financialAccount: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
    refund: { findMany: jest.fn() },
    ledgerEntry: { findMany: jest.fn() },
  };
  return { tx, prisma };
}

describe('RefundsService (Fase 2c)', () => {
  it('refund partial unpaid: turunkan outstanding, tanpa cash-out / ledger OUT', async () => {
    const { tx, prisma } = makePrismaMock();
    const svc = new RefundsService(prisma as never);
    (prisma.invoice.findUnique as jest.Mock).mockResolvedValue({
      id: 'inv-1',
      number: 'INV-202609-0001',
      status: 'ISSUED',
      totalAmount: new Prisma.Decimal(100000),
      amountPaid: new Prisma.Decimal(0),
    });
    (tx.refund.create as jest.Mock).mockImplementation(async (a: { data: object }) => ({ id: 'rf-1', ...a.data }));
    (tx.refund.findUniqueOrThrow as jest.Mock).mockResolvedValue({
      id: 'rf-1',
      amount: new Prisma.Decimal(30000),
      cashOut: new Prisma.Decimal(0),
      invoice: { id: 'inv-1', totalAmount: new Prisma.Decimal(70000), amountPaid: new Prisma.Decimal(0) },
    });

    const res = await svc.createRefund('admin-1', { invoiceId: 'inv-1', amount: 30000, reason: 'Potong sisa sesi' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totalAmount: new Prisma.Decimal('70000'),
          amountPaid: new Prisma.Decimal('0'),
        }),
      }),
    );
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
    expect(res).toMatchObject({ id: 'rf-1' });
  });

  it('refund melebihi total invoice ditolak', async () => {
    const { prisma } = makePrismaMock();
    const svc = new RefundsService(prisma as never);
    (prisma.invoice.findUnique as jest.Mock).mockResolvedValue({
      id: 'inv-1',
      status: 'ISSUED',
      totalAmount: new Prisma.Decimal(10000),
      amountPaid: new Prisma.Decimal(0),
    });
    await expect(
      svc.createRefund('admin-1', { invoiceId: 'inv-1', amount: 20000, reason: 'kelebihan' }),
    ).rejects.toThrow('Nominal refund melebihi total invoice.');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
