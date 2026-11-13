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
  /** Jumlah siswa terjadwal di roster sesi — dashboard admin. */
  _count?: { students: number };
}

/** Baris ujian untuk kartu dashboard — admin academic (bulan ini) / tutor. */
export interface ExamBriefHome {
  id: string;
  title: string;
  status: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  attempts: number;
  submitted: number;
  live: boolean;
}

/** Ujian terbuka untuk siswa + status attempt miliknya. */
export interface AvailableExamBrief {
  id: string;
  title: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  durationMinutes: number | null;
  myStatus: "NONE" | "IN_PROGRESS" | "SUBMITTED" | "LOCKED";
}

/** Attempt ujian anak yang sedang berjalan/terkunci — dashboard ortu. */
export interface ChildExamAlert {
  studentName: string;
  examTitle: string;
  status: string;
  endsAt: string;
}

/** Kesehatan antrean WhatsApp — pending masih antre, failed perlu retry. */
export interface WaOutboxHealth {
  pending: number;
  failed: number;
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
  /** Top 5 siswa per rata-rata nilai — tutor. */
  topStudents?: Array<{ studentId: string; name: string; avgPct: number; examCount: number }>;
  /** Rata-rata nilai per kelompok diampu — tutor. */
  groupAvgs?: Array<{ groupId: string; name: string; avgPct: number; students: number }>;
  /** 8 attempt ujian terakhir siswa kelompok — tutor. */
  recentAttempts?: Array<{
    id: string;
    studentName: string;
    examId: string;
    examTitle: string;
    pct: number;
    submittedAt: string | null;
  }>;
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
  /** Daftar ujian bulan ini + jumlah attempt — admin academic/owner. */
  examsMonthList?: ExamBriefHome[];
  /** Attempt sedang berjalan sekarang — admin academic/owner. */
  liveAttempts?: number;
  /** Attempt terkunci menunggu unlock — admin academic/owner/tutor. */
  lockedAttempts?: number;
  /** Ujian yang dibuat tutor ini — tutor. */
  myExams?: ExamBriefHome[];
  /** Ujian terbuka untuk dikerjakan — siswa. */
  availableExams?: AvailableExamBrief[];
  /** Attempt ujian anak sedang jalan/terkunci — orang tua. */
  childExamAlerts?: ChildExamAlert[];
  /** Kesehatan antrean WA — admin academic/finance/owner. */
  waOutbox?: WaOutboxHealth;
}
