export interface PaymentListItem {
  id: string;
  invoiceId: string | null;
  studentId: string | null;
  accountId: string | null;
  amount: string | number;
  method: string;
  channel: string;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  provider: string | null;
  providerRef: string | null;
  /** URL halaman bayar gateway (Snap Midtrans) untuk pembayaran PENDING. */
  paymentUrl?: string | null;
  proofUrl: string | null;
  proofNote: string | null;
  rejectReason: string | null;
  paidAt: string | null;
  createdAt: string;
  account: { id: string; name: string; code: string | null; type: string } | null;
  allocations: Array<{
    id: string;
    amount: string | number;
    invoice: {
      id: string;
      number: string;
      student?: {
        id: string;
        user: { id: string; name: string; email?: string | null };
        parentStudents?: Array<{ parent: { user: { name: string } } }>;
      } | null;
      enrollmentLink?: {
        program: { name: string; code: string } | null;
        level: { name: string } | null;
        group: { name: string } | null;
      } | null;
      enrollment?: {
        program: { name: string; code: string } | null;
        level: { name: string } | null;
        group: { name: string } | null;
      } | null;
      items?: Array<{ description: string }>;
    };
  }>;
  receipts: Array<{ id: string; number: string; amount: string | number }>;
  redirectUrl?: string;
  expiresAt?: string;
  studentIdResolved?: string;
}

export interface ChildInvoice {
  id: string;
  number: string;
  totalAmount: string | number;
  amountPaid: string | number;
}

export interface ReceiptItem {
  id: string;
  number: string;
  paymentId: string;
  invoiceId: string | null;
  studentId: string;
  amount: string | number;
  method: string;
  status: string;
  issuedAt: string;
  invoice?: {
    number?: string;
    student?: {
      user?: { name?: string };
      parentStudents?: Array<{ parent: { user: { name: string } } }>;
    } | null;
    enrollmentLink?: {
      program?: { name?: string } | null;
      level?: { name?: string } | null;
      group?: { name?: string } | null;
    } | null;
    enrollment?: {
      program?: { name?: string } | null;
      level?: { name?: string } | null;
      group?: { name?: string } | null;
    } | null;
  } | null;
  student?: { user?: { name?: string } } | null;
  verifier?: { name?: string } | null;
}
