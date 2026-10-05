/**
 * Daftar kode permission & nama role Fase 0. Sumber tunggal dipakai oleh seed script
 * dan guard supaya tidak ada string permission yang hardcode berbeda-beda di tempat lain.
 */
export const ROLE_NAMES = {
  SISWA: 'SISWA',
  ORANG_TUA: 'ORANG_TUA',
  TUTOR: 'TUTOR',
  ADMIN_FINANCE: 'ADMIN_FINANCE',
  ADMIN_ACADEMIC: 'ADMIN_ACADEMIC',
  OWNER: 'OWNER',
} as const;

export type RoleName = (typeof ROLE_NAMES)[keyof typeof ROLE_NAMES];

export const PERMISSION_CODES = {
  DASHBOARD_SISWA_VIEW: 'dashboard.siswa.view',
  DASHBOARD_ORANG_TUA_VIEW: 'dashboard.orang_tua.view',
  DASHBOARD_TUTOR_VIEW: 'dashboard.tutor.view',
  DASHBOARD_ADMIN_FINANCE_VIEW: 'dashboard.admin_finance.view',
  DASHBOARD_ADMIN_ACADEMIC_VIEW: 'dashboard.admin_academic.view',
  DASHBOARD_OWNER_VIEW: 'dashboard.owner.view',
  RBAC_MANAGE_ROLES: 'rbac.manage_roles',
  // --- Fase 0b: Manajemen Akun (sisipan setelah Fase 0) ---
  USERS_MANAGE: 'users.manage',
  USERS_RESET_PASSWORD: 'users.reset_password',
  // --- Fase 1a: People & Programs ---
  PEOPLE_VIEW: 'people.view',
  PEOPLE_STUDENT_MANAGE: 'people.student.manage',
  PEOPLE_PARENT_MANAGE: 'people.parent.manage',
  PEOPLE_TUTOR_MANAGE: 'people.tutor.manage',
  PROGRAM_MANAGE: 'program.manage',
  // Harga paket saja (finance) — tanpa akses struktur program/level (program.manage).
  PRICE_MANAGE: 'price.manage',
  // --- Fase 1b: Groups & Tutor Assignment ---
  GROUP_VIEW: 'group.view',
  GROUP_MANAGE: 'group.manage',
  // --- Fase 1c: Schedule & Session (+ Room/Building minimal) ---
  SCHEDULE_VIEW: 'schedule.view',
  SCHEDULE_MANAGE: 'schedule.manage',
  SESSION_VIEW: 'session.view',
  SESSION_MANAGE: 'session.manage',
  FACILITY_MANAGE: 'facility.manage',
  // --- Fase 1d: Attendance & Notification skeleton (in-app) ---
  ATTENDANCE_VIEW: 'attendance.view',
  ATTENDANCE_MANAGE: 'attendance.manage',
  ATTENDANCE_CORRECT: 'attendance.correct',
  NOTIFICATION_VIEW: 'notification.view',
  // --- Fase 2a: Invoice & Core Finance (CRUD invoice saja; payment menyusul 2b) ---
  INVOICE_VIEW: 'invoice.view',
  INVOICE_MANAGE: 'invoice.manage',
  // --- Fase 2b: Payment Channels (cash, manual upload bukti, gateway dummy) ---
  PAYMENT_VIEW: 'payment.view',
  PAYMENT_CREATE: 'payment.create',
  PAYMENT_VERIFY: 'payment.verify',
  // --- Fase 2c: Piutang (AR), Refund, Ledger Kas/Bank ---
  AR_VIEW: 'ar.view',
  REFUND_MANAGE: 'refund.manage',
  LEDGER_VIEW: 'ledger.view',
  // --- Fase 2d: RAB, Expense & Laporan Finance ---
  BUDGET_VIEW: 'budget.view',
  BUDGET_MANAGE: 'budget.manage',
  EXPENSE_VIEW: 'expense.view',
  EXPENSE_MANAGE: 'expense.manage',
  REPORT_EXPORT: 'report.export',
  // --- Fase 3a: Materials & Question Bank ---
  MATERIAL_VIEW: 'material.view',
  MATERIAL_MANAGE: 'material.manage',
  QUESTION_VIEW: 'question.view',
  QUESTION_MANAGE: 'question.manage',
  // --- Fase 3b: Latsol (paket latihan + attempt siswa, feedback instan) ---
  LATSOL_VIEW: 'latsol.view',
  LATSOL_MANAGE: 'latsol.manage',
  // --- Fase 3c: Exam Core & Timing (ujian resmi dengan timing global) ---
  EXAM_VIEW: 'exam.view',
  EXAM_MANAGE: 'exam.manage',
  EXAM_ATTEMPT: 'exam.attempt',
  // --- Fase 3d: Proctoring & Anti-Leak ---
  EXAM_PROCTOR_UNLOCK: 'exam_proctor.unlock',
  // --- Fase 4a: Analytics & Dashboard ---
  ANALYTICS_QUESTION_VIEW: 'analytics.question.view',
  ANALYTICS_EXAM_VIEW: 'analytics.exam.view',
  ANALYTICS_STUDENT_PERFORMANCE_VIEW: 'analytics.student_performance.view',
  ANALYTICS_PARENT_CHILD_VIEW: 'analytics.parent_child.view',
  ANALYTICS_TUTOR_GROUP_VIEW: 'analytics.tutor_group.view',
  ANALYTICS_ADMIN_ACADEMIC_VIEW: 'analytics.admin_academic.view',
  ANALYTICS_MY_PERFORMANCE_VIEW: 'analytics.my_performance.view',
  // --- Fase 4b: Score Rules & Ranking ---
  SCORE_RULES_VIEW: 'score_rules.view',
  SCORE_RULES_CREATE: 'score_rules.create',
  SCORE_RULES_UPDATE: 'score_rules.update',
  SCORE_RULES_DELETE: 'score_rules.delete',
  POINT_TRANSACTIONS_VIEW: 'point_transactions.view',
  POINT_TRANSACTIONS_VIEW_OWN: 'point_transactions.view_own',
  POINT_TRANSACTIONS_CREATE: 'point_transactions.create',
  LEADERBOARD_VIEW: 'leaderboard.view',
  // --- Fase 5a: Tutor Payroll ---
  PAYROLL_VIEW: 'payroll.view',
  PAYROLL_MANAGE: 'payroll.manage',
  PAYROLL_VIEW_OWN: 'payroll.view_own',
  // --- Fase 5b: WhatsApp outbox (admin memantau antrean pesan keluar) ---
  WHATSAPP_OUTBOX_VIEW: 'whatsapp_outbox.view',
  WHATSAPP_OUTBOX_MANAGE: 'whatsapp_outbox.manage',
  // --- Fase 6: Laporan lanjutan & halaman Audit (Owner) ---
  AUDIT_VIEW: 'audit.view',
  // --- Fase 6: Pengaturan aplikasi (identitas, default finance, notifikasi WA) ---
  SETTINGS_MANAGE: 'settings.manage',
  // --- Pustaka gambar (upload/pilih/hapus) — hanya admin akademik, tutor, owner ---
  MEDIA_MANAGE: 'media.manage',
  // --- Pustaka media keuangan (bukti bayar, kwitansi, dokumen finance) ---
  MEDIA_FINANCE_MANAGE: 'media.finance.manage',
  // --- Pendaftaran siswa self-service (ortu daftarkan anak → verifikasi → tempat kelompok) ---
  ENROLLMENT_CREATE: 'enrollment.create',
  ENROLLMENT_VIEW: 'enrollment.view',
  ENROLLMENT_REVIEW: 'enrollment.review',
  ENROLLMENT_PLACE: 'enrollment.place',
} as const;

export type PermissionCode =
  (typeof PERMISSION_CODES)[keyof typeof PERMISSION_CODES];
