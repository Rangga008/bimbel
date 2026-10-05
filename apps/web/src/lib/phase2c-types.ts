export interface ArInvoice {
  id: string;
  number: string;
  studentId: string;
  status: string;
  totalAmount: string | number;
  amountPaid: string | number;
  outstanding: number;
  isOverdue: boolean;
  dueDate: string | null;
  reminderStatus: 'NONE' | 'PENDING' | 'SENT' | string;
  remindedAt: string | null;
  student: {
    id: string;
    user: { id: string; name: string; email: string };
    parentStudents?: Array<{ parent: { user: { name: string } } }>;
  };
  package: { id: string; name: string; code: string | null } | null;
  enrollmentLink?: {
    program: { name: string } | null;
    level: { name: string } | null;
    group: { name: string } | null;
  } | null;
  enrollment?: {
    program: { name: string } | null;
    level: { name: string } | null;
    group: { name: string } | null;
  } | null;
}

export interface RefundRow {
  id: string;
  number: string;
  invoiceId: string;
  amount: string | number;
  cashOut: string | number;
  reason: string;
  createdAt: string;
  invoice?: { id: string; number: string; totalAmount?: string | number; amountPaid?: string | number };
  account?: { id: string; name: string; code: string | null } | null;
}

export interface LedgerAccountBalance {
  id: string;
  name: string;
  code: string | null;
  type: string;
  isActive: boolean;
  totalIn: number;
  totalOut: number;
  balance: number;
}

export interface LedgerEntryRow {
  id: string;
  accountId: string;
  direction: 'IN' | 'OUT' | string;
  amount: string | number;
  sourceType: string;
  sourceId: string;
  description: string;
  occurredAt: string;
  account: { id: string; name: string; code: string | null; type: string };
}

export interface LedgerResponse {
  accounts: LedgerAccountBalance[];
  entries: LedgerEntryRow[];
}
