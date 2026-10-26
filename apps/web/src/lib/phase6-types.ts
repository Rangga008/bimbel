// Fase 6 — tipe untuk laporan lanjutan + halaman Audit (Owner).

export type ReportKind =
  | "invoice"
  | "payment"
  | "rab"
  | "revenue"
  | "ar"
  | "payroll"
  | "attendance"
  | "groups"
  | "tutor"
  | "academic"
  | "ranking"
  | "progress";

export interface ReportKindMeta {
  kind: ReportKind;
  title: string;
  domain: string;
}

/** Tabel terpisah dalam satu laporan (mis. satu tabel per bulan/jenjang). */
export interface ReportSection {
  title: string;
  note?: string;
  headers: string[];
  rows: string[][];
}

/** Chart yang ikut dirender (pie/bar) — data sudah mentah label+nilai. */
export interface ReportChart {
  type: "pie" | "bar";
  title: string;
  items: { label: string; value: number; color?: string }[];
}

/** Dokumen laporan generik — semua laporan Fase 6 punya bentuk ini. */
export interface ReportDoc {
  brand: string;
  title: string;
  kind: ReportKind;
  periodLabel: string;
  generatedAt: string;
  filterText: string;
  /** Paragraf penjelasan cara membaca laporan — tampil di atas tabel. */
  description?: string;
  headers: string[];
  rows: string[][];
  /** Bila diisi: daftar tabel berjudul (per bulan/jenjang) menggantikan tabel tunggal. */
  sections?: ReportSection[];
  charts?: ReportChart[];
  summaryLines: string[];
  fileBase: string;
}

export interface ReportSnapshotItem {
  id: string;
  reportKind: string;
  period: string | null;
  title: string;
  filterText: string | null;
  createdAt: string;
  createdBy: { id: string; name: string; email: string } | null;
}

export interface ReportSnapshotDetail extends ReportSnapshotItem {
  payload: ReportDoc;
}

export interface AuditLogActor {
  id: string;
  name: string;
  email: string;
}

export interface AuditLogRow {
  id: string;
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string;
  oldData: unknown;
  newData: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  actor: AuditLogActor | null;
}

export interface AuditLogListResponse {
  total: number;
  page: number;
  pageSize: number;
  data: AuditLogRow[];
}

export interface AuditLogMeta {
  actions: string[];
  entities: string[];
  actors: AuditLogActor[];
}
