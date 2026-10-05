export interface TutorRef {
  id: string;
  user: { id: string; name: string; email: string };
}

export interface TutorRateRow {
  id: string;
  tutorId: string;
  workType: string;
  amount: string | number;
  unit: 'SESSION' | 'HOUR';
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  tutor?: TutorRef;
}

export interface WorkItemRow {
  id: string;
  tutorId: string;
  workType: string;
  sourceType: 'SESSION' | 'MANUAL';
  sessionId: string | null;
  period: string;
  description: string;
  occurredAt: string;
  quantity: string | number;
  rateId: string | null;
  unitAmount: string | number;
  amount: string | number;
  payrollRunId: string | null;
  createdAt: string;
  tutor?: TutorRef;
  session?: {
    id: string;
    startsAt: string;
    endsAt: string;
    status: string;
    group: { id: string; name: string } | null;
  } | null;
  rate?: { id: string; workType: string; unit: string; amount: string | number } | null;
}

export interface PayrollAdjustmentRow {
  id: string;
  payrollRunId: string;
  amount: string | number;
  reason: string;
  createdBy: string;
  createdAt: string;
}

export interface PayrollRunRow {
  id: string;
  number: string;
  tutorId: string;
  period: string;
  grossAmount: string | number;
  adjustmentAmount: string | number;
  netAmount: string | number;
  status: 'UNPAID' | 'PAID';
  accountId: string | null;
  expenseId: string | null;
  paidAt: string | null;
  paidBy: string | null;
  createdAt: string;
  tutor?: TutorRef;
  account?: { id: string; name: string; code: string | null; type: string } | null;
  _count?: { workItems: number; adjustments: number };
}

export interface PayrollRunDetail extends PayrollRunRow {
  workItems: WorkItemRow[];
  adjustments: PayrollAdjustmentRow[];
}

export interface MyPayrollResponse {
  tutor: {
    id: string;
    specialization: string | null;
    isActive: boolean;
    user: { id: string; name: string; email: string };
  };
  runs: PayrollRunDetail[];
}

export const WORK_TYPES = [
  { value: 'REGULAR_SESSION', label: 'Sesi Reguler' },
  { value: 'PRIVATE_SESSION', label: 'Sesi Private' },
  { value: 'EXTRA_CLASS', label: 'Kelas Tambahan' },
  { value: 'SPECIAL_TASK', label: 'Tugas Khusus' },
] as const;

export function workTypeLabel(value: string): string {
  return WORK_TYPES.find((t) => t.value === value)?.label ?? value;
}
