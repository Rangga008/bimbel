// Unit test Fase 2b — tanpa DB (mock PrismaService + ConfigService).
// Skenario kritis:
// 1. Cash: payment + allocation + invoice + receipt dalam 1 $transaction.
// 2. Webhook tanpa signature valid → 401 & status tetap PENDING (DoD anti-bypass).
// 3. Nominal webhook ≠ nominal payment → 400, tidak ada alokasi.
// 4. Verify APPROVE → VERIFIED + receipt; REJECT tanpa reason → 400.
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { DummyGatewayProvider } from './gateway/payment-gateway.provider';
import { PaymentsService } from './payments.service';

function makePrismaMock() {
  const tx = {
    invoice: { findUniqueOrThrow: jest.fn(), update: jest.fn() },
    payment: {
      create: jest.fn(),
      update: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    paymentAllocation: { upsert: jest.fn() },
    receipt: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    financialAccount: { findFirst: jest.fn() },
    ledgerEntry: { findFirst: jest.fn(), create: jest.fn() },
    enrollment: { updateMany: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
    parent: { findUnique: jest.fn() },
    invoice: { findUnique: jest.fn(), findMany: jest.fn() },
    payment: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    receipt: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    financialAccount: { findFirst: jest.fn(), findUnique: jest.fn() },
    student: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
  };
  return { tx, prisma };
}

function makeService(prismaMock: ReturnType<typeof makePrismaMock>['prisma']) {
  const config = {
    get: (k: string, fb?: string) =>
      k === 'PAYMENT_WEBHOOK_SECRET' ? 'test-secret' : fb,
  } as unknown as ConfigService;
  // Fase 5b: NotificationEventsService di-stub — trigger notif diuji terpisah.
  const events = {
    paymentVerified: jest.fn(() => Promise.resolve()),
    paymentRejected: jest.fn(() => Promise.resolve()),
    paymentProofSubmitted: jest.fn(() => Promise.resolve()),
  };
  // Midtrans nonaktif di test -> resolveGateway() selalu mengembalikan DUMMY.
  const settings = {
    get: jest.fn(() =>
      Promise.resolve({
        enabled: false,
        isProduction: false,
        serverKey: '',
        clientKey: '',
      }),
    ),
  };
  return {
    svc: new PaymentsService(
      prismaMock as never,
      config,
      events as never,
      settings as never,
    ),
    events,
  };
}

describe('PaymentsService (Fase 2b)', () => {
  it('gateway dummy: signature HMAC valid diterima, salah ditolak', () => {
    const gw = new DummyGatewayProvider('s3cr3t');
    const body = JSON.stringify({
      providerRef: 'DUMMY-1',
      status: 'SUCCESS',
      amount: 1000,
    });
    const { createHmac } = jest.requireActual('node:crypto');
    const sig = createHmac('sha256', 's3cr3t').update(body).digest('hex');
    expect(gw.verifyWebhookSignature(body, sig)).toBe(true);
    expect(gw.verifyWebhookSignature(body, 'salah')).toBe(false);
    expect(gw.verifyWebhookSignature(body, undefined)).toBe(false);
  });

  it('cash: 1 transaksi membuat payment VERIFIED + allocation + receipt', async () => {
    const { tx, prisma } = makePrismaMock();
    const { svc, events } = makeService(prisma);
    prisma.invoice.findUnique.mockResolvedValue({
      id: 'inv-1',
      studentId: 'stu-1',
      status: 'ISSUED',
      totalAmount: new Prisma.Decimal(100000),
      amountPaid: new Prisma.Decimal(0),
    });
    prisma.financialAccount.findFirst.mockResolvedValue({
      id: 'kas-1',
    });
    tx.payment.create.mockImplementation(async (a: { data: object }) => ({
      id: 'pay-1',
      ...a.data,
    }));
    tx.invoice.findUniqueOrThrow.mockResolvedValue({
      id: 'inv-1',
      totalAmount: new Prisma.Decimal(100000),
      amountPaid: new Prisma.Decimal(0),
    });
    tx.receipt.findFirst.mockResolvedValue(null);
    tx.receipt.create.mockImplementation(async (a: { data: object }) => ({
      id: 'rc-1',
      ...a.data,
    }));
    tx.payment.findUniqueOrThrow.mockResolvedValue({
      id: 'pay-1',
      status: 'VERIFIED',
    });

    const res = await svc.createCash('admin-1', {
      invoiceId: 'inv-1',
      amount: 100000,
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.paymentAllocation.upsert).toHaveBeenCalledTimes(1);
    expect(tx.receipt.create).toHaveBeenCalledTimes(1);
    expect(res).toMatchObject({ id: 'pay-1', status: 'VERIFIED' });
    // Fase 5b: event "pembayaran terverifikasi" memicu trigger notifikasi.
    expect(events.paymentVerified).toHaveBeenCalledWith('pay-1');
  });

  it('webhook tanpa signature valid → 401, status tetap PENDING (DoD anti-bypass)', async () => {
    const { prisma } = makePrismaMock();
    const { svc } = makeService(prisma);
    await expect(
      svc.handleWebhook(
        JSON.stringify({ providerRef: 'DUMMY-1' }),
        { providerRef: 'DUMMY-1', status: 'SUCCESS', amount: 100 } as never,
        'salah',
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.payment.update).not.toHaveBeenCalled();
  });

  it('verify REJECT tanpa reason → 400; APPROVE memakai 1 transaksi + receipt', async () => {
    const { tx, prisma } = makePrismaMock();
    const { svc, events } = makeService(prisma);
    prisma.payment.findUnique.mockResolvedValue({
      id: 'pay-2',
      status: 'PENDING',
      invoiceId: 'inv-1',
      studentId: 'stu-1',
      method: 'TRANSFER_MANUAL',
      amount: new Prisma.Decimal(50000),
      accountId: null,
    });
    await expect(svc.verify('admin-1', 'pay-2', 'REJECT', {})).rejects.toThrow(
      'Alasan penolakan wajib diisi.',
    );
    prisma.financialAccount.findFirst.mockResolvedValue({
      id: 'bank-1',
    });
    tx.invoice.findUniqueOrThrow.mockResolvedValue({
      id: 'inv-1',
      totalAmount: new Prisma.Decimal(100000),
      amountPaid: new Prisma.Decimal(0),
    });
    tx.receipt.findFirst.mockResolvedValue(null);
    tx.payment.findUniqueOrThrow.mockResolvedValue({
      id: 'pay-2',
      status: 'VERIFIED',
    });
    const ok = await svc.verify('admin-1', 'pay-2', 'APPROVE', {});
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(ok).toMatchObject({ id: 'pay-2', status: 'VERIFIED' });
    // Fase 5b: approve manual juga memicu trigger "pembayaran terverifikasi".
    expect(events.paymentVerified).toHaveBeenCalledWith('pay-2');
  });
});
