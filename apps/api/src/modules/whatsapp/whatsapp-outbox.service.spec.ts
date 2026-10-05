// Unit test Fase 5b — WhatsApp outbox (tanpa DB, mock Prisma + provider).
// Skenario DoD:
// 1. enqueue -> baris PENDING (tidak ada kirim langsung).
// 2. processPending -> provider.send dipanggil -> status SENT + providerRef.
// 3. Provider gagal -> retry PENDING sampai maxAttempts -> FAILED.
// 4. Preferensi whatsAppEnabled=false -> pesan tidak di-antrekan.
import { ConfigService } from '@nestjs/config';
import { WhatsAppOutboxService } from './whatsapp-outbox.service';
import type { WhatsAppProvider, WhatsAppSendResult } from './whatsapp.provider';

type CreateArg = { data: Record<string, unknown> };
type UpdateArg = { where: { id: string }; data: Record<string, unknown> };

function makePrismaMock() {
  return {
    whatsAppOutbox: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      // Crash-recovery + klaim atomik PENDING->SENDING selalu "berhasil".
      updateMany: jest.fn(async () => ({ count: 1 })),
      groupBy: jest.fn(),
    },
    notificationPreference: {
      findUnique: jest.fn(),
    },
  };
}

function makeService(
  prisma: ReturnType<typeof makePrismaMock>,
  provider: WhatsAppProvider,
  maxAttempts = '3',
) {
  const config = {
    get: (k: string, fb?: string) =>
      k === 'WHATSAPP_OUTBOX_MAX_ATTEMPTS' ? maxAttempts : fb,
  } as unknown as ConfigService;
  return new WhatsAppOutboxService(prisma as never, config, provider);
}

describe('WhatsAppOutboxService (Fase 5b)', () => {
  it('enqueue membuat baris PENDING tanpa mengirim langsung', async () => {
    const prisma = makePrismaMock();
    const send = jest.fn(() =>
      Promise.resolve<WhatsAppSendResult>({ providerRef: 'LOG-1' }),
    );
    const provider: WhatsAppProvider = { name: 'log', send };
    const svc = makeService(prisma, provider);
    prisma.notificationPreference.findUnique.mockResolvedValue(null);
    prisma.whatsAppOutbox.create.mockImplementation((a: CreateArg) =>
      Promise.resolve({
        id: 'wo-1',
        status: 'PENDING',
        ...a.data,
      }),
    );

    const row = (await svc.enqueue({
      phone: '08123456789',
      userId: 'u-1',
      eventType: 'PAYMENT_VERIFIED',
      referenceType: 'Payment',
      referenceId: 'pay-1',
      message: 'Terverifikasi',
    })) as { status: string };

    expect(row.status).toBe('PENDING');
    expect(send).not.toHaveBeenCalled();
    const createCalls = prisma.whatsAppOutbox.create.mock
      .calls as unknown as CreateArg[][];
    const createArg = createCalls[0][0];
    expect(createArg.data.eventType).toBe('PAYMENT_VERIFIED');
    expect(createArg.data.referenceId).toBe('pay-1');
  });

  it('processPending: PENDING -> SENT lewat provider (simpan providerRef)', async () => {
    const prisma = makePrismaMock();
    const send = jest.fn(() =>
      Promise.resolve<WhatsAppSendResult>({ providerRef: 'LOG-1' }),
    );
    const svc = makeService(prisma, { name: 'log', send });
    prisma.whatsAppOutbox.findMany.mockResolvedValue([
      {
        id: 'wo-1',
        recipientPhone: '0812',
        recipientName: 'Ortu',
        message: 'Halo',
        eventType: 'PAYMENT_VERIFIED',
        referenceType: 'Payment',
        referenceId: 'pay-1',
        attempts: 0,
      },
    ]);
    prisma.whatsAppOutbox.update.mockImplementation((a: UpdateArg) =>
      Promise.resolve(a.data),
    );

    const result = await svc.processPending();

    expect(send).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ found: 1, sent: 1, failed: 0 });
    const updateCalls = prisma.whatsAppOutbox.update.mock
      .calls as unknown as UpdateArg[][];
    const updateArg = updateCalls[0][0];
    expect(updateArg.where.id).toBe('wo-1');
    expect(updateArg.data).toMatchObject({
      status: 'SENT',
      provider: 'log',
      providerRef: 'LOG-1',
    });
  });

  it('provider gagal -> tetap PENDING sampai maxAttempts lalu FAILED', async () => {
    const prisma = makePrismaMock();
    const send = jest.fn(() => Promise.reject(new Error('network down')));
    const svc = makeService(prisma, { name: 'log', send }, '2');
    const row = {
      id: 'wo-9',
      recipientPhone: '0812',
      recipientName: null,
      message: 'x',
      eventType: 'TEST',
      referenceType: null,
      referenceId: null,
      attempts: 1, // percobaan ke-2 = terakhir (maxAttempts=2)
    };
    prisma.whatsAppOutbox.findMany.mockResolvedValue([row]);

    const result = await svc.processPending();
    expect(result.failed).toBe(1);
    const updateCalls = prisma.whatsAppOutbox.update.mock
      .calls as unknown as UpdateArg[][];
    const updateArg = updateCalls[0][0];
    expect(updateArg.where.id).toBe('wo-9');
    expect(updateArg.data).toMatchObject({ status: 'FAILED', attempts: 2 });
  });

  it('whatsAppEnabled=false -> pesan tidak di-antrekan', async () => {
    const prisma = makePrismaMock();
    const send = jest.fn(() =>
      Promise.resolve<WhatsAppSendResult>({ providerRef: 'LOG-1' }),
    );
    const svc = makeService(prisma, { name: 'log', send });
    prisma.notificationPreference.findUnique.mockResolvedValue({
      whatsAppEnabled: false,
    });

    const row = await svc.enqueue({
      phone: '0812',
      userId: 'u-1',
      eventType: 'TEST',
      message: 'x',
    });
    expect(row).toBeNull();
    expect(prisma.whatsAppOutbox.create).not.toHaveBeenCalled();
  });
});
