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

/** Titik grafik mini di dashboard: label + nilai (persen atau jumlah). */
export interface TrendPoint {
  label: string;
  value: number;
}

/** Titik grafik kas: masuk & keluar per bulan. */
export interface CashPoint {
  label: string;
  in: number;
  out: number;
}

/** Ringkasan nilai per anak untuk beranda ortu. */
export interface ChildScoreSummary {
  studentId: string;
  name: string;
  examCount: number;
  avgPct: number | null;
  lastPct: number | null;
  lastExam: string | null;
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
  childrenScores?: ChildScoreSummary[];
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
  /** Tren nilai % 8 ujian terakhir — siswa. */
  scoreTrend?: TrendPoint[];
  /** Total poin gamifikasi — siswa. */
  points?: number;
  /** Jumlah ujian diselesaikan — siswa. */
  examCount?: number;
  /** Jumlah latsol dikerjakan — siswa. */
  latsolDone?: number;
  /** Sesi minggu ini per status — tutor. */
  sessionWeek?: Record<string, number>;
  /** Total siswa di kelompok yang diampu — tutor. */
  studentsTotal?: number;
  /** % kehadiran per minggu, 6 minggu — admin academic/owner. */
  attendanceTrend?: Array<TrendPoint & { count: number }>;
  /** Funnel enrollment per status — admin academic/owner. */
  enrollmentStatus?: Record<string, number>;
  /** Ujian dijadwalkan bulan ini — admin academic/owner. */
  examsMonth?: number;
  /** Kas masuk/keluar 6 bulan — admin finance/owner. */
  cashTrend?: CashPoint[];
  /** Invoice per status — admin finance/owner. */
  invoiceStatus?: Record<string, number>;
}
