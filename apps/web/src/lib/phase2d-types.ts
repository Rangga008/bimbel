export interface BudgetRow {
  id: string;
  category: string;
  period: string;
  amount: string | number;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  expenses: Array<{ id: string; amount: string | number; occurredAt: string }>;
}

export interface BudgetSummary {
  period: string;
  totalBudget: number;
  totalActual: number;
  remaining: number;
  budgetCount: number;
  expenseCount: number;
}

export interface BudgetVsActual {
  category: string;
  period: string;
  budget: number;
  actual: number;
  variance: number;
  variancePercent: number;
  expenseCount: number;
}

export interface ExpenseRow {
  id: string;
  budgetId: string | null;
  accountId: string;
  amount: string | number;
  description: string;
  category: string;
  occurredAt: string;
  receiptUrl: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  budget?: { id: string; category: string; period: string; amount: string | number } | null;
  account?: { id: string; name: string; code: string | null; type: string } | null;
}

export interface ExpenseSummary {
  period: string;
  totalAmount: number;
  expenseCount: number;
  byCategory: Record<string, number>;
}

export interface FinancialAccount {
  id: string;
  name: string;
  code: string | null;
  type: string;
  isActive: boolean;
}

export const BUDGET_CATEGORIES = [
  { value: 'PENGADAAN_RUANG_BELAJAR', label: 'Pengadaan Ruang Belajar' },
  { value: 'PERSIAPAN_TAHUN_AJARAN', label: 'Persiapan Tahun Ajaran' },
  { value: 'OVERHEAD_RUMAH_TANGGA', label: 'Overhead & Rumah Tangga' },
  { value: 'LOGISTIK_PERAWATAN', label: 'Logistik & Perawatan' },
  { value: 'AKADEMIK', label: 'Akademik' },
  { value: 'MARKETING', label: 'Marketing' },
  { value: 'KESEHATAN_TUNJANGAN', label: 'Kesehatan & Tunjangan' },
  { value: 'HONOR_PEGAWAI', label: 'Honor Pegawai' },
  { value: 'LAIN_LAIN', label: 'Lain-lain' },
] as const;