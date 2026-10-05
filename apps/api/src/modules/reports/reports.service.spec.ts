// Unit test Fase 2d+6 — ReportsService tanpa DB.
// Header standar selalu ada + dataset kosong aman (tanpa #N/A/#DIV/0!)
// untuk SEMUA jenis laporan lintas modul.
// PrismaService di-mock supaya chain @nestjs/config (ESM) tidak ikut termuat di jest.
jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class {},
}));
import { ReportsService } from './reports.service';

/** Stub SettingsService — getCompanyInfo tidak diuji di sini. */
function settingsMock() {
  return { get: jest.fn().mockResolvedValue({}) };
}

function prismaMock(overrides: Record<string, unknown[] | undefined> = {}) {
  const findMany = (key: string) =>
    jest.fn().mockResolvedValue(overrides[key] ?? []);
  return {
    invoice: { findMany: findMany('invoice') },
    payment: { findMany: findMany('payment') },
    budget: { findMany: findMany('budget') },
    expense: { findMany: findMany('expense') },
    payrollRun: { findMany: findMany('payrollRun') },
    attendance: { findMany: findMany('attendance') },
    learningGroup: { findMany: findMany('learningGroup') },
    tutor: { findMany: findMany('tutor') },
    examAttempt: { findMany: findMany('examAttempt') },
    latsolAttempt: { findMany: findMany('latsolAttempt') },
    pointTransaction: { findMany: findMany('pointTransaction') },
    student: { findMany: findMany('student') },
    reportSnapshot: {
      create: jest.fn().mockImplementation(({ data }) => ({
        id: 'snap-1',
        ...data,
      })),
      findMany: findMany('reportSnapshot'),
      findUnique: jest.fn().mockResolvedValue(null),
    },
  };
}

const ALL_KINDS = [
  'invoice',
  'payment',
  'rab',
  'revenue',
  'ar',
  'payroll',
  'attendance',
  'groups',
  'tutor',
  'students',
  'academic',
  'ranking',
  'progress',
];

describe('Fase 2d — ReportsService', () => {
  it('invoice kosong: header standar + baris Belum ada data, kolektibilitas 0%', async () => {
    const svc = new ReportsService(prismaMock() as never, settingsMock() as never);
    const doc = await svc.build('invoice', { period: '2026-02' });
    expect(doc.brand).toContain('Bimbel');
    expect(doc.periodLabel).toBe('2026-02');
    expect(doc.generatedAt).toBeTruthy();
    expect(doc.filterText).toBeTruthy();
    expect(doc.rows).toHaveLength(0);
    expect(doc.summaryLines.join(' ')).toContain('0%');
    const csv = svc.renderExcelCsv(doc);
    expect(csv).toContain('Belum ada data');
    expect(csv).not.toContain('#DIV/0!');
    expect(csv).not.toContain('#N/A');
    const html = svc.renderPdfHtml(doc);
    expect(html).toContain('Belum ada data');
    expect(html).toContain(doc.periodLabel);
  });

  it('RAB vs Actual: variance benar + CSV/HTML ada header standar', async () => {
    const svc = new ReportsService(
      prismaMock({
        budget: [
          {
            id: 'b-1',
            category: 'AKADEMIK',
            period: '2026-09',
            amount: { toString: () => '5000000' },
          },
        ],
        expense: [
          { budgetId: 'b-1', category: 'AKADEMIK', amount: { toString: () => '1500000' } },
        ],
      }) as never,
      settingsMock() as never,
    );
    const doc = await svc.build('rab', { period: '2026-09' });
    expect(doc.rows[0][1]).toBe('5000000');
    expect(doc.rows[0][2]).toBe('1500000');
    expect(doc.rows[0][3]).toBe('3500000');
    const csv = svc.renderExcelCsv(doc);
    // Baris pertama = directive `sep=;` agar Excel locale Indonesia memisah kolom.
    expect(csv.split('\r\n')[0]).toBe('sep=;');
    expect(csv.split('\r\n')[1]).toContain('Bimbel');
    expect(csv).toContain('2026-09');
  });

  it('periode invalid jatuh ke periode berjalan (tidak throw)', async () => {
    const svc = new ReportsService(prismaMock() as never, settingsMock() as never);
    const doc = await svc.build('payment', { period: '2026-13' });
    expect(/^\d{4}-(0[1-9]|1[0-2])$/.test(doc.periodLabel)).toBe(true);
  });
});

describe('Fase 6 — laporan lanjutan lintas modul', () => {
  it.each(ALL_KINDS)(
    'jenis "%s": dataset kosong tetap valid (no throw, no #DIV/0!)',
    async (kind) => {
      const svc = new ReportsService(prismaMock() as never, settingsMock() as never);
      const doc = await svc.build(kind, { period: '2026-09' });
      expect(doc.kind).toBe(kind);
      expect(doc.rows).toHaveLength(0);
      const csv = svc.renderExcelCsv(doc);
      const html = svc.renderPdfHtml(doc);
      for (const out of [csv, html]) {
        expect(out).toContain('Belum ada data');
        expect(out).not.toContain('#DIV/0!');
        expect(out).not.toContain('#N/A');
        expect(out).not.toContain('NaN');
      }
    },
  );

  it('kind tidak dikenal -> BadRequestException', async () => {
    const svc = new ReportsService(prismaMock() as never, settingsMock() as never);
    await expect(svc.build('ngawur', {})).rejects.toThrow('tidak dikenal');
  });
});

describe('Fase 6 — snapshot laporan (data beku)', () => {
  it('createSnapshot membekukan dokumen ke payload JSON', async () => {
    const prisma = prismaMock();
    const svc = new ReportsService(prisma as never, settingsMock() as never);
    const snap = await svc.createSnapshot(
      'rab',
      { period: '2026-09' },
      'user-1',
    );
    expect(prisma.reportSnapshot.create).toHaveBeenCalledTimes(1);
    const call = (prisma.reportSnapshot.create as jest.Mock).mock.calls[0][0];
    // payload berisi rows beku — bukan referensi ke data sumber.
    expect(call.data.payload.rows).toBeDefined();
    expect(call.data.reportKind).toBe('rab');
    expect(call.data.period).toBe('2026-09');
    expect(snap.id).toBe('snap-1');
  });

  it('getSnapshot melempar NotFound bila id tidak ada', async () => {
    const svc = new ReportsService(prismaMock() as never, settingsMock() as never);
    await expect(svc.getSnapshot('nope')).rejects.toThrow('tidak ditemukan');
  });
});
