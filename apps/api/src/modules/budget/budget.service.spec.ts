// Unit test Fase 2d — tanpa DB (mock PrismaService).
// 1. monthRange: Februari & bulan 30 hari tidak overflow.
// 2. safeAverage/safePercent: anti #DIV/0! untuk data kosong.
// 3. Budget vsActual: agregasi budgetId + fallback kategori, variance benar.
import { monthRange } from '../../common/utils/month-range';
import { safeAverage, safePercent } from '../reports/report-helpers';
import { BudgetService } from './budget.service';

describe('Fase 2d — monthRange & safe math', () => {
  it('Februari 2026 berakhir tanggal 28 (tidak overflow ke Maret)', () => {
    const { start, end } = monthRange('2026-02');
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(1);
    expect(start.getDate()).toBe(1);
    expect(end.getMonth()).toBe(1);
    expect(end.getDate()).toBe(28);
  });

  it('April (30 hari) berakhir tanggal 30', () => {
    const { end } = monthRange('2026-04');
    expect(end.getMonth()).toBe(3);
    expect(end.getDate()).toBe(30);
  });

  it('periode invalid ditolak', () => {
    expect(() => monthRange('2026-13')).toThrow('YYYY-MM');
    expect(() => monthRange('2026-2')).toThrow('YYYY-MM');
  });

  it('safeAverage/safePercent tidak pernah NaN/Infinity', () => {
    expect(safeAverage(0, 0)).toBe(0);
    expect(safeAverage(100, 0)).toBe(0);
    expect(safePercent(50, 0)).toBe(0);
    expect(safePercent(0, 0)).toBe(0);
    expect(safePercent(1500000, 5000000)).toBe(30);
  });
});

describe('Fase 2d — BudgetService.getBudgetVsActual', () => {
  it('variance benar dari Expense nyata (budget 5jt, actual 1.5jt)', async () => {
    const prisma = {
      budget: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'b-1', category: 'AKADEMIK', period: '2026-09', amount: { toString: () => '5000000' } },
        ]),
      },
      expense: {
        findMany: jest.fn().mockResolvedValue([
          { budgetId: 'b-1', category: 'AKADEMIK', amount: { toString: () => '1500000' } },
        ]),
      },
    };
    const svc = new BudgetService(prisma as never);
    const rows = await svc.getBudgetVsActual('2026-09');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ budget: 5000000, actual: 1500000, variance: 3500000 });
    expect(rows[0].utilization).toBe(30);
    expect(rows[0].expenseCount).toBe(1);
  });

  it('tanpa expense: actual 0, variance = budget (bukan NaN)', async () => {
    const prisma = {
      budget: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'b-1', category: 'MARKETING', period: '2026-09', amount: { toString: () => '2000000' } },
        ]),
      },
      expense: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const svc = new BudgetService(prisma as never);
    const rows = await svc.getBudgetVsActual('2026-09');
    expect(rows[0]).toMatchObject({ actual: 0, variance: 2000000, utilization: 0 });
  });
});
