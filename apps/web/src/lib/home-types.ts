export interface SessionBrief {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  group: { id: string; name: string };
  tutor: { id: string; user: { name: string } } | null;
  room: { id: string; name: string } | null;
  /** Nama anak ortu di kelompok sesi — hanya untuk dashboard ortu. */
  childNames?: string[];
}

/** Tagihan outstanding anak untuk beranda ortu. */
export interface DueInvoiceBrief {
  id: string;
  number: string;
  studentName: string;
  program: string | null;
  dueDate: string | null;
  sisa: number;
}

/** Performa kehadiran minggu ini per anak untuk beranda ortu. */
export interface ChildPerformance {
  studentId: string;
  name: string;
  hadir: number;
  total: number;
  pct: number | null;
}

export interface FinanceSummary {
  period: string;
  issuedCount: number;
  outstandingTotal: number;
  overdueCount: number;
  pendingProofs: number;
  cashIn: number;
  cashOut: number;
  cashBalance: number;
  accountCount: number;
  rabBudget: number;
  rabActual: number;
  rabRemaining: number;
}

export interface HomeData {
  role: string;
  user?: string;
  groups?: Array<{ id: string; name: string }>;
  children?: Array<{ id: string; user: { name: string } }>;
  counts?: Record<string, number>;
  upcomingSessions?: SessionBrief[];
  todaySessions?: SessionBrief[];
  pendingAttendance?: Array<{ id: string; startsAt: string; group: { name: string } }>;
  attendanceSummary?: { total: number; hadir: number };
  weekAttendance?: Record<string, number> | { total: number; hadir: number };
  unreadNotifications?: number;
  childPerformance?: ChildPerformance[];
  dueInvoices?: DueInvoiceBrief[];
  finance?: FinanceSummary;
  packageUsage?: Array<{
    groupId: string;
    groupName: string;
    packageName: string;
    total: number;
    used: number;
  }>;
  sessionMonth?: Record<string, number>;
}
