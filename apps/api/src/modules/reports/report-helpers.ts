// Fase 6 — model dokumen laporan generik (dipakai semua laporan lintas modul)
// + helper aman untuk dataset kosong / pembagian nol (anti #N/A, #DIV/0!).

export type ReportKind =
  // Keuangan
  | 'invoice'
  | 'payment'
  | 'rab'
  | 'revenue'
  | 'ar'
  | 'payroll'
  // Operasional
  | 'attendance'
  | 'groups'
  | 'tutor'
  | 'students'
  // Akademik
  | 'academic'
  | 'ranking'
  | 'progress';

/** Alias mundur-compatible dengan tipe Fase 2d. */
export type FinanceReportKind = Extract<ReportKind, 'invoice' | 'payment' | 'rab'>;

export interface ReportFilters {
  period?: string;
  from?: string;
  to?: string;
  groupId?: string;
  programId?: string;
  levelId?: string;
  tutorId?: string;
  studentId?: string;
  status?: string;
  channel?: string;
  search?: string;
}

/** Where-klausul LearningGroup dari filter (dipakai builder yang berbasis kelompok). */
export function groupScopeWhere(filters: ReportFilters): Record<string, string> {
  const where: Record<string, string> = {};
  if (filters.groupId) where.id = filters.groupId;
  if (filters.programId) where.programId = filters.programId;
  if (filters.levelId) where.levelId = filters.levelId;
  return where;
}

/** Where-klausul "siswa anggota kelompok yang cocok" untuk relasi Student. */
export function studentInScope(filters: ReportFilters) {
  const group = groupScopeWhere(filters);
  if (!Object.keys(group).length) return null;
  return { groupMembers: { some: { group } } };
}

/** Alias mundur-compatible dengan tipe Fase 2d. */
export type FinanceReportFilters = ReportFilters;

export interface ReportDoc {
  brand: string;
  title: string;
  kind: ReportKind;
  /** Label periode yang dipakai laporan (YYYY-MM atau rentang tanggal). */
  periodLabel: string;
  generatedAt: string;
  filterText: string;
  headers: string[];
  /** Seluruh sel sudah berupa string siap-render (angka = plain, bukan formatted). */
  rows: string[][];
  summaryLines: string[];
  fileBase: string;
}

/** Alias mundur-compatible dengan tipe Fase 2d. */
export type FinanceReportDoc = ReportDoc;

export const REPORT_BRAND = 'Bimbel — Laporan';
/** Alias mundur-compatible dengan konstanta Fase 2d. */
export const FINANCE_REPORT_BRAND = 'Bimbel — Laporan Finance';

export const REPORT_KIND_META: Record<ReportKind, { title: string; domain: string }> = {
  invoice: { title: 'Laporan Invoice', domain: 'Keuangan' },
  payment: { title: 'Laporan Pembayaran', domain: 'Keuangan' },
  rab: { title: 'Laporan RAB vs Actual', domain: 'Keuangan' },
  revenue: { title: 'Laporan Revenue', domain: 'Keuangan' },
  ar: { title: 'Laporan Piutang (AR)', domain: 'Keuangan' },
  payroll: { title: 'Laporan Payroll Tutor', domain: 'Keuangan' },
  attendance: { title: 'Laporan Kehadiran', domain: 'Operasional' },
  groups: { title: 'Laporan Kelompok', domain: 'Operasional' },
  tutor: { title: 'Laporan Kinerja Tutor', domain: 'Operasional' },
  students: { title: 'Laporan Siswa per Sekolah', domain: 'Operasional' },
  academic: { title: 'Laporan Nilai Ujian', domain: 'Akademik' },
  ranking: { title: 'Laporan Ranking Poin', domain: 'Akademik' },
  progress: { title: 'Laporan Progres Siswa', domain: 'Akademik' },
};

/**
 * Cakupan domain laporan per role (nama role backend).
 * Role yang tidak terdaftar & non-OWNER tidak dapat domain apa pun;
 * OWNER mendapat `null` = semua domain.
 */
const REPORT_DOMAINS_BY_ROLE: Record<string, string[]> = {
  ADMIN_FINANCE: ['Keuangan'],
  ADMIN_ACADEMIC: ['Operasional', 'Akademik'],
};

/**
 * Domain laporan yang boleh diakses kumpulan role.
 * `null` = tak dibatasi (OWNER). Array kosong = tidak ada akses.
 */
export function reportDomainsForRoles(roles: string[]): string[] | null {
  if (roles.includes('OWNER')) return null;
  const domains = new Set<string>();
  for (const role of roles) {
    for (const d of REPORT_DOMAINS_BY_ROLE[role] ?? []) domains.add(d);
  }
  return [...domains];
}

export function reportMoney(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

export function reportRupiah(n: number): string {
  return `Rp ${Math.round(n).toLocaleString('id-ID')}`;
}

/** Rata-rata aman: count<=0 atau input tidak valid -> 0 (anti #DIV/0!). */
export function safeAverage(total: number, count: number): number {
  if (!Number.isFinite(total) || !Number.isFinite(count) || count <= 0) return 0;
  return Math.round((total / count) * 100) / 100;
}

/** Persen aman: whole<=0 -> 0 (anti #DIV/0!). */
export function safePercent(part: number, whole: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return 0;
  return Math.round((part / whole) * 10000) / 100;
}

export function fmtDateId(value: Date | string | null | undefined): string {
  if (!value) return '-';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('id-ID');
}

export function fmtDateTimeId(value: Date | string | null | undefined): string {
  if (!value) return '-';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('id-ID');
}

/** Normalisasi "YYYY-MM" — nilai invalid jatuh ke bulan berjalan (tidak throw). */
export function normalizePeriod(period?: string | null): string {
  if (period && /^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return period;
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Rentang [gte, lt) untuk satu periode YYYY-MM (akurat lintas bulan, bukan "-31"). */
export function periodRange(period: string): { gte: Date; lt: Date } {
  const [y, m] = period.split('-').map((s) => parseInt(s, 10));
  return { gte: new Date(y, m - 1, 1), lt: new Date(y, m, 1) };
}

/** Label periode fleksibel: period YYYY-MM, rentang from-to, atau "Semua periode". */
export function periodLabel(filters: ReportFilters): string {
  if (filters.period) return normalizePeriod(filters.period);
  if (filters.from || filters.to) {
    return `${filters.from ?? '…'} s.d. ${filters.to ?? '…'}`;
  }
  return 'Semua periode';
}

/** Rentang tanggal efektif dari filter (period menang atas from/to). */
export function effectiveRange(filters: ReportFilters): { gte?: Date; lt?: Date } {
  if (filters.period) return periodRange(normalizePeriod(filters.period));
  const range: { gte?: Date; lt?: Date } = {};
  if (filters.from) {
    const d = new Date(`${filters.from}T00:00:00`);
    if (!Number.isNaN(d.getTime())) range.gte = d;
  }
  if (filters.to) {
    const d = new Date(`${filters.to}T23:59:59.999`);
    if (!Number.isNaN(d.getTime())) range.lt = d;
  }
  return range;
}

/** Rangkuman filter aktif menjadi satu baris teks untuk header laporan. */
export function buildFilterText(filters: ReportFilters): string {
  const parts: string[] = [`Periode: ${periodLabel(filters)}`];
  if (filters.studentId) parts.push(`Siswa: ${filters.studentId}`);
  if (filters.programId) parts.push(`Program: ${filters.programId}`);
  if (filters.levelId) parts.push(`Level: ${filters.levelId}`);
  if (filters.groupId) parts.push(`Kelompok: ${filters.groupId}`);
  if (filters.tutorId) parts.push(`Tutor: ${filters.tutorId}`);
  if (filters.status) parts.push(`Status: ${filters.status}`);
  if (filters.channel) parts.push(`Channel: ${filters.channel}`);
  if (filters.search) parts.push(`Cari: ${filters.search}`);
  return parts.join(' · ');
}

/** Angka sebagai string polos (tanpa pemisah ribuan) — aman diimpor ke Excel. */
export function numCell(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return String(Math.round(n * 100) / 100);
}
