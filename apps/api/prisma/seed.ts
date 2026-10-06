import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';

// Define permissions locally for seed since we can't import from src in Docker
const PERMISSION_CODES = {
  DASHBOARD_SISWA_VIEW: 'dashboard.siswa.view',
  DASHBOARD_ORANG_TUA_VIEW: 'dashboard.orang_tua.view',
  DASHBOARD_TUTOR_VIEW: 'dashboard.tutor.view',
  DASHBOARD_ADMIN_FINANCE_VIEW: 'dashboard.admin_finance.view',
  DASHBOARD_ADMIN_ACADEMIC_VIEW: 'dashboard.admin_academic.view',
  DASHBOARD_OWNER_VIEW: 'dashboard.owner.view',
  RBAC_MANAGE_ROLES: 'rbac.manage_roles',
  USERS_MANAGE: 'users.manage',
  USERS_RESET_PASSWORD: 'users.reset_password',
  PEOPLE_VIEW: 'people.view',
  PEOPLE_STUDENT_MANAGE: 'people.student.manage',
  PEOPLE_PARENT_MANAGE: 'people.parent.manage',
  PEOPLE_TUTOR_MANAGE: 'people.tutor.manage',
  PROGRAM_MANAGE: 'program.manage',
  PRICE_MANAGE: 'price.manage',
  GROUP_VIEW: 'group.view',
  GROUP_MANAGE: 'group.manage',
  SCHEDULE_VIEW: 'schedule.view',
  SCHEDULE_MANAGE: 'schedule.manage',
  SESSION_VIEW: 'session.view',
  SESSION_MANAGE: 'session.manage',
  FACILITY_MANAGE: 'facility.manage',
  ATTENDANCE_VIEW: 'attendance.view',
  ATTENDANCE_MANAGE: 'attendance.manage',
  ATTENDANCE_CORRECT: 'attendance.correct',
  NOTIFICATION_VIEW: 'notification.view',
  INVOICE_VIEW: 'invoice.view',
  INVOICE_MANAGE: 'invoice.manage',
  PAYMENT_VIEW: 'payment.view',
  PAYMENT_CREATE: 'payment.create',
  PAYMENT_VERIFY: 'payment.verify',
  AR_VIEW: 'ar.view',
  REFUND_MANAGE: 'refund.manage',
  LEDGER_VIEW: 'ledger.view',
  BUDGET_VIEW: 'budget.view',
  BUDGET_MANAGE: 'budget.manage',
  EXPENSE_VIEW: 'expense.view',
  EXPENSE_MANAGE: 'expense.manage',
  REPORT_EXPORT: 'report.export',
  MATERIAL_VIEW: 'material.view',
  MATERIAL_MANAGE: 'material.manage',
  QUESTION_VIEW: 'question.view',
  QUESTION_MANAGE: 'question.manage',
  LATSOL_VIEW: 'latsol.view',
  LATSOL_MANAGE: 'latsol.manage',
  EXAM_VIEW: 'exam.view',
  EXAM_MANAGE: 'exam.manage',
  EXAM_ATTEMPT: 'exam.attempt',
  EXAM_PROCTOR_UNLOCK: 'exam_proctor.unlock',
  ANALYTICS_QUESTION_VIEW: 'analytics.question.view',
  ANALYTICS_EXAM_VIEW: 'analytics.exam.view',
  ANALYTICS_STUDENT_PERFORMANCE_VIEW: 'analytics.student_performance.view',
  ANALYTICS_PARENT_CHILD_VIEW: 'analytics.parent_child.view',
  ANALYTICS_TUTOR_GROUP_VIEW: 'analytics.tutor_group.view',
  ANALYTICS_ADMIN_ACADEMIC_VIEW: 'analytics.admin_academic.view',
  ANALYTICS_MY_PERFORMANCE_VIEW: 'analytics.my_performance.view',
  SCORE_RULES_VIEW: 'score_rules.view',
  SCORE_RULES_CREATE: 'score_rules.create',
  SCORE_RULES_UPDATE: 'score_rules.update',
  SCORE_RULES_DELETE: 'score_rules.delete',
  POINT_TRANSACTIONS_VIEW: 'point_transactions.view',
  POINT_TRANSACTIONS_VIEW_OWN: 'point_transactions.view_own',
  POINT_TRANSACTIONS_CREATE: 'point_transactions.create',
  LEADERBOARD_VIEW: 'leaderboard.view',
  PAYROLL_VIEW: 'payroll.view',
  PAYROLL_MANAGE: 'payroll.manage',
  PAYROLL_VIEW_OWN: 'payroll.view_own',
  WHATSAPP_OUTBOX_VIEW: 'whatsapp_outbox.view',
  WHATSAPP_OUTBOX_MANAGE: 'whatsapp_outbox.manage',
  AUDIT_VIEW: 'audit.view',
  SETTINGS_MANAGE: 'settings.manage',
  MEDIA_MANAGE: 'media.manage',
  MEDIA_FINANCE_MANAGE: 'media.finance.manage',
  ENROLLMENT_CREATE: 'enrollment.create',
  ENROLLMENT_VIEW: 'enrollment.view',
  ENROLLMENT_REVIEW: 'enrollment.review',
  ENROLLMENT_PLACE: 'enrollment.place',
} as const;

const ROLE_NAMES = {
  SISWA: 'SISWA',
  ORANG_TUA: 'ORANG_TUA',
  TUTOR: 'TUTOR',
  ADMIN_FINANCE: 'ADMIN_FINANCE',
  ADMIN_ACADEMIC: 'ADMIN_ACADEMIC',
  OWNER: 'OWNER',
} as const;

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const SEED_PASSWORD_SALT_ROUNDS = 12;

/** Satu permission dashboard per role + permission Fase 1a/1b/1c/1d per role operasional. */
const ROLE_PERMISSION_MAP: Record<string, string[]> = {
  [ROLE_NAMES.SISWA]: [
    PERMISSION_CODES.DASHBOARD_SISWA_VIEW,
    PERMISSION_CODES.SESSION_VIEW,
    PERMISSION_CODES.NOTIFICATION_VIEW,
    PERMISSION_CODES.MATERIAL_VIEW,
    PERMISSION_CODES.LATSOL_VIEW,
    PERMISSION_CODES.EXAM_ATTEMPT,
    PERMISSION_CODES.ANALYTICS_MY_PERFORMANCE_VIEW,
    PERMISSION_CODES.POINT_TRANSACTIONS_VIEW_OWN,
    PERMISSION_CODES.LEADERBOARD_VIEW,
  ],
  [ROLE_NAMES.ORANG_TUA]: [
    PERMISSION_CODES.DASHBOARD_ORANG_TUA_VIEW,
    PERMISSION_CODES.SESSION_VIEW,
    PERMISSION_CODES.NOTIFICATION_VIEW,
    PERMISSION_CODES.INVOICE_VIEW,
    PERMISSION_CODES.PAYMENT_VIEW,
    PERMISSION_CODES.PAYMENT_CREATE,
    PERMISSION_CODES.ANALYTICS_PARENT_CHILD_VIEW,
    PERMISSION_CODES.POINT_TRANSACTIONS_VIEW,
    PERMISSION_CODES.LEADERBOARD_VIEW,
    // Pendaftaran anak mandiri dari portal ortu.
    PERMISSION_CODES.ENROLLMENT_CREATE,
    PERMISSION_CODES.ENROLLMENT_VIEW,
  ],
  [ROLE_NAMES.TUTOR]: [
    PERMISSION_CODES.DASHBOARD_TUTOR_VIEW,
    PERMISSION_CODES.GROUP_VIEW,
    PERMISSION_CODES.SCHEDULE_VIEW,
    PERMISSION_CODES.SESSION_VIEW,
    PERMISSION_CODES.ATTENDANCE_VIEW,
    PERMISSION_CODES.ATTENDANCE_MANAGE,
    PERMISSION_CODES.NOTIFICATION_VIEW,
    PERMISSION_CODES.MATERIAL_VIEW,
    PERMISSION_CODES.QUESTION_VIEW,
    PERMISSION_CODES.LATSOL_VIEW,
    PERMISSION_CODES.LATSOL_MANAGE,
    PERMISSION_CODES.EXAM_VIEW,
    PERMISSION_CODES.MEDIA_MANAGE,
    // Fase 3d: unlock proctoring bersifat permission-based lintas kelompok/program,
    // bukan dibatasi relasi tutor-siswa — semua tutor bisa jadi pengawas ujian.
    PERMISSION_CODES.EXAM_PROCTOR_UNLOCK,
    PERMISSION_CODES.ANALYTICS_QUESTION_VIEW,
    PERMISSION_CODES.ANALYTICS_EXAM_VIEW,
    PERMISSION_CODES.ANALYTICS_TUTOR_GROUP_VIEW,
    PERMISSION_CODES.POINT_TRANSACTIONS_VIEW,
    PERMISSION_CODES.LEADERBOARD_VIEW,
    // Fase 5a: tutor melihat rincian honornya sendiri di halaman profil.
    PERMISSION_CODES.PAYROLL_VIEW_OWN,
  ],
  [ROLE_NAMES.ADMIN_FINANCE]: [
    PERMISSION_CODES.DASHBOARD_ADMIN_FINANCE_VIEW,
    PERMISSION_CODES.PEOPLE_VIEW,
    // Filter laporan per kelompok (read-only).
    PERMISSION_CODES.GROUP_VIEW,
    PERMISSION_CODES.PEOPLE_STUDENT_MANAGE,
    PERMISSION_CODES.PEOPLE_PARENT_MANAGE,
    PERMISSION_CODES.PEOPLE_TUTOR_MANAGE,
    PERMISSION_CODES.INVOICE_VIEW,
    PERMISSION_CODES.INVOICE_MANAGE,
    // Set harga paket (tanpa program.manage) — halaman Harga & Program.
    PERMISSION_CODES.PRICE_MANAGE,
    PERMISSION_CODES.PAYMENT_VIEW,
    PERMISSION_CODES.PAYMENT_CREATE,
    PERMISSION_CODES.PAYMENT_VERIFY,
    PERMISSION_CODES.AR_VIEW,
    PERMISSION_CODES.REFUND_MANAGE,
    PERMISSION_CODES.LEDGER_VIEW,
    PERMISSION_CODES.BUDGET_VIEW,
    PERMISSION_CODES.BUDGET_MANAGE,
    PERMISSION_CODES.EXPENSE_VIEW,
    PERMISSION_CODES.EXPENSE_MANAGE,
    PERMISSION_CODES.REPORT_EXPORT,
    PERMISSION_CODES.NOTIFICATION_VIEW,
    // Fase 5a: payroll tutor (tarif, work items, run, bayar).
    PERMISSION_CODES.PAYROLL_VIEW,
    PERMISSION_CODES.PAYROLL_MANAGE,
    // Fase 5b: pantau antrean WhatsApp keluar.
    PERMISSION_CODES.WHATSAPP_OUTBOX_VIEW,
    PERMISSION_CODES.WHATSAPP_OUTBOX_MANAGE,
    // Fase 6: halaman Pengaturan (identitas, default finance, WA admin).
    // SETTINGS_MANAGE juga membuka kategori media BRANDING (logo aplikasi).
    PERMISSION_CODES.SETTINGS_MANAGE,
    // Baca sesi — dipakai halaman detail siswa (sesi terdekat). Tanpa *_MANAGE.
    PERMISSION_CODES.SESSION_VIEW,
    // Pustaka media finance (kwitansi, bukti pembayaran, dokumen keuangan).
    PERMISSION_CODES.MEDIA_FINANCE_MANAGE,
    // Manajemen akun user (buat/reset password) — tugas admin, bukan owner.
    PERMISSION_CODES.USERS_MANAGE,
    PERMISSION_CODES.USERS_RESET_PASSWORD,
    // Verifikasi pendaftaran siswa baru setelah pembayaran.
    PERMISSION_CODES.ENROLLMENT_VIEW,
    PERMISSION_CODES.ENROLLMENT_REVIEW,
  ],
  [ROLE_NAMES.ADMIN_ACADEMIC]: [
    PERMISSION_CODES.DASHBOARD_ADMIN_ACADEMIC_VIEW,
    PERMISSION_CODES.PEOPLE_VIEW,
    PERMISSION_CODES.PEOPLE_STUDENT_MANAGE,
    PERMISSION_CODES.PEOPLE_PARENT_MANAGE,
    PERMISSION_CODES.PEOPLE_TUTOR_MANAGE,
    PERMISSION_CODES.PROGRAM_MANAGE,
    PERMISSION_CODES.GROUP_VIEW,
    PERMISSION_CODES.GROUP_MANAGE,
    PERMISSION_CODES.SCHEDULE_VIEW,
    PERMISSION_CODES.SCHEDULE_MANAGE,
    PERMISSION_CODES.SESSION_VIEW,
    PERMISSION_CODES.SESSION_MANAGE,
    PERMISSION_CODES.FACILITY_MANAGE,
    PERMISSION_CODES.ATTENDANCE_VIEW,
    PERMISSION_CODES.ATTENDANCE_MANAGE,
    PERMISSION_CODES.ATTENDANCE_CORRECT,
    PERMISSION_CODES.NOTIFICATION_VIEW,
    PERMISSION_CODES.MATERIAL_VIEW,
    PERMISSION_CODES.MATERIAL_MANAGE,
    PERMISSION_CODES.QUESTION_VIEW,
    PERMISSION_CODES.QUESTION_MANAGE,
    PERMISSION_CODES.LATSOL_VIEW,
    PERMISSION_CODES.LATSOL_MANAGE,
    PERMISSION_CODES.EXAM_VIEW,
    PERMISSION_CODES.EXAM_MANAGE,
    // Fase 3d: unlock proctoring lintas kelompok/program (permission-based).
    PERMISSION_CODES.EXAM_PROCTOR_UNLOCK,
    PERMISSION_CODES.ANALYTICS_QUESTION_VIEW,
    PERMISSION_CODES.ANALYTICS_EXAM_VIEW,
    PERMISSION_CODES.ANALYTICS_STUDENT_PERFORMANCE_VIEW,
    PERMISSION_CODES.ANALYTICS_ADMIN_ACADEMIC_VIEW,
    PERMISSION_CODES.SCORE_RULES_VIEW,
    PERMISSION_CODES.SCORE_RULES_CREATE,
    PERMISSION_CODES.SCORE_RULES_UPDATE,
    PERMISSION_CODES.SCORE_RULES_DELETE,
    PERMISSION_CODES.POINT_TRANSACTIONS_VIEW,
    PERMISSION_CODES.POINT_TRANSACTIONS_CREATE,
    PERMISSION_CODES.LEADERBOARD_VIEW,
    PERMISSION_CODES.MEDIA_MANAGE,
    // Manajemen akun user (buat/reset password) — tugas admin, bukan owner.
    PERMISSION_CODES.USERS_MANAGE,
    PERMISSION_CODES.USERS_RESET_PASSWORD,
    // Fase 6: halaman Laporan ada di ROLE_PAGES untuk admin academic.
    PERMISSION_CODES.REPORT_EXPORT,
    // Penempatan siswa baru ke kelompok setelah pendaftaran diverifikasi.
    PERMISSION_CODES.ENROLLMENT_VIEW,
    PERMISSION_CODES.ENROLLMENT_PLACE,
    // Pengaturan bersama — kedua admin bisa kontribusi (template reminder,
    // branding, akun kas, dsb).
    PERMISSION_CODES.SETTINGS_MANAGE,
  ],
  [ROLE_NAMES.OWNER]: [
    PERMISSION_CODES.DASHBOARD_OWNER_VIEW,
    PERMISSION_CODES.DASHBOARD_SISWA_VIEW,
    PERMISSION_CODES.DASHBOARD_ORANG_TUA_VIEW,
    PERMISSION_CODES.DASHBOARD_TUTOR_VIEW,
    PERMISSION_CODES.DASHBOARD_ADMIN_FINANCE_VIEW,
    PERMISSION_CODES.DASHBOARD_ADMIN_ACADEMIC_VIEW,
    PERMISSION_CODES.PEOPLE_VIEW,
    PERMISSION_CODES.PEOPLE_STUDENT_MANAGE,
    PERMISSION_CODES.PEOPLE_PARENT_MANAGE,
    PERMISSION_CODES.PEOPLE_TUTOR_MANAGE,
    PERMISSION_CODES.PROGRAM_MANAGE,
    PERMISSION_CODES.GROUP_VIEW,
    PERMISSION_CODES.GROUP_MANAGE,
    PERMISSION_CODES.SCHEDULE_VIEW,
    PERMISSION_CODES.SCHEDULE_MANAGE,
    PERMISSION_CODES.SESSION_VIEW,
    PERMISSION_CODES.SESSION_MANAGE,
    PERMISSION_CODES.FACILITY_MANAGE,
    PERMISSION_CODES.ATTENDANCE_VIEW,
    PERMISSION_CODES.ATTENDANCE_MANAGE,
    PERMISSION_CODES.ATTENDANCE_CORRECT,
    PERMISSION_CODES.INVOICE_VIEW,
    PERMISSION_CODES.INVOICE_MANAGE,
    // Set harga paket (tanpa program.manage) — halaman Harga & Program.
    PERMISSION_CODES.PRICE_MANAGE,
    PERMISSION_CODES.PAYMENT_VIEW,
    PERMISSION_CODES.PAYMENT_CREATE,
    PERMISSION_CODES.PAYMENT_VERIFY,
    PERMISSION_CODES.AR_VIEW,
    PERMISSION_CODES.REFUND_MANAGE,
    PERMISSION_CODES.LEDGER_VIEW,
    PERMISSION_CODES.BUDGET_VIEW,
    PERMISSION_CODES.BUDGET_MANAGE,
    PERMISSION_CODES.EXPENSE_VIEW,
    PERMISSION_CODES.EXPENSE_MANAGE,
    PERMISSION_CODES.REPORT_EXPORT,
    PERMISSION_CODES.NOTIFICATION_VIEW,
    PERMISSION_CODES.MATERIAL_VIEW,
    PERMISSION_CODES.MATERIAL_MANAGE,
    PERMISSION_CODES.QUESTION_VIEW,
    PERMISSION_CODES.QUESTION_MANAGE,
    PERMISSION_CODES.LATSOL_VIEW,
    PERMISSION_CODES.LATSOL_MANAGE,
    PERMISSION_CODES.EXAM_VIEW,
    PERMISSION_CODES.EXAM_MANAGE,
    // Fase 3d: unlock proctoring lintas kelompok/program (permission-based).
    PERMISSION_CODES.EXAM_PROCTOR_UNLOCK,
    PERMISSION_CODES.ANALYTICS_QUESTION_VIEW,
    PERMISSION_CODES.ANALYTICS_EXAM_VIEW,
    PERMISSION_CODES.ANALYTICS_STUDENT_PERFORMANCE_VIEW,
    PERMISSION_CODES.ANALYTICS_ADMIN_ACADEMIC_VIEW,
    PERMISSION_CODES.SCORE_RULES_VIEW,
    PERMISSION_CODES.SCORE_RULES_CREATE,
    PERMISSION_CODES.SCORE_RULES_UPDATE,
    PERMISSION_CODES.SCORE_RULES_DELETE,
    PERMISSION_CODES.POINT_TRANSACTIONS_VIEW,
    PERMISSION_CODES.POINT_TRANSACTIONS_CREATE,
    PERMISSION_CODES.LEADERBOARD_VIEW,
    // Fase 5a: payroll tutor.
    PERMISSION_CODES.PAYROLL_VIEW,
    PERMISSION_CODES.PAYROLL_MANAGE,
    // Pendaftaran siswa — owner bisa melihat, verifikasi, dan menempatkan.
    PERMISSION_CODES.ENROLLMENT_VIEW,
    PERMISSION_CODES.ENROLLMENT_REVIEW,
    PERMISSION_CODES.ENROLLMENT_PLACE,
  ],
};

const SEED_USERS: Array<{
  email: string;
  name: string;
  password: string;
  role: string;
}> = [
  {
    email: 'siswa1@bimbel.test',
    name: 'Siswa Satu',
    password: 'Siswa123!',
    role: ROLE_NAMES.SISWA,
  },
  {
    email: 'siswa2@bimbel.test',
    name: 'Siswa Dua',
    password: 'Siswa123!',
    role: ROLE_NAMES.SISWA,
  },
  {
    email: 'siswa3@bimbel.test',
    name: 'Siswa Tiga',
    password: 'Siswa123!',
    role: ROLE_NAMES.SISWA,
  },
  {
    email: 'ortu1@bimbel.test',
    name: 'Orang Tua Satu',
    password: 'OrangTua123!',
    role: ROLE_NAMES.ORANG_TUA,
  },
  {
    email: 'tutor1@bimbel.test',
    name: 'Tutor Satu',
    password: 'Tutor123!',
    role: ROLE_NAMES.TUTOR,
  },
  {
    email: 'adminfinance1@bimbel.test',
    name: 'Admin Finance Satu',
    password: 'AdminFinance123!',
    role: ROLE_NAMES.ADMIN_FINANCE,
  },
  {
    email: 'adminacademic1@bimbel.test',
    name: 'Admin Academic Satu',
    password: 'AdminAcademic123!',
    role: ROLE_NAMES.ADMIN_ACADEMIC,
  },
  {
    email: 'owner1@bimbel.test',
    name: 'Owner Satu',
    password: 'Owner123!',
    role: ROLE_NAMES.OWNER,
  },
];

/**
 * Buat opsi soal seed HANYA kalau soal belum punya opsi sama sekali.
 * Kalau admin sudah mengedit soal via UI (opsi dihapus+dibuat ulang dengan
 * UUID baru), pakai opsi yang ada — jangan buat ulang opsi seed, supaya
 * tidak dobel setiap `db seed` jalan ulang saat container restart.
 */
async function ensureQuestionOptions(
  questionId: string,
  seedPrefix: string,
  defs: { content: string; isCorrect: boolean }[],
) {
  let options = await prisma.questionOption.findMany({
    where: { questionId },
    orderBy: { sortOrder: 'asc' },
  });
  if (options.length === 0) {
    await prisma.questionOption.createMany({
      data: defs.map((d, i) => ({
        id: `${seedPrefix}-opt-${'abc'[i]}`,
        questionId,
        sortOrder: i,
        ...d,
      })),
    });
    options = await prisma.questionOption.findMany({
      where: { questionId },
      orderBy: { sortOrder: 'asc' },
    });
  }
  return options;
}

/** Ambil 3 opsi pertama (fallback ke opsi pertama bila jumlahnya kurang). */
function pickOptions<T>(options: T[]): [T, T, T] {
  return [options[0], options[1] ?? options[0], options[2] ?? options[0]];
}

async function main() {
  const permissionCodes = Object.values(PERMISSION_CODES) as string[];
  const permissionsByCode = new Map<string, { id: string }>();
  for (const code of permissionCodes) {
    const permission = await prisma.permission.upsert({
      where: { code },
      create: { code },
      update: {},
    });
    permissionsByCode.set(code, permission);
  }

  const rolesByName = new Map<string, { id: string }>();
  for (const roleName of Object.values(ROLE_NAMES) as string[]) {
    const role = await prisma.role.upsert({
      where: { name: roleName },
      create: { name: roleName },
      update: {},
    });
    rolesByName.set(roleName, role);

    const codes = ROLE_PERMISSION_MAP[roleName] ?? [];
    // Sinkron penuh: grant di luar map dicabut agar seed authoritative.
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    for (const code of codes) {
      const permission = permissionsByCode.get(code)!;
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId: permission.id },
        },
        create: { roleId: role.id, permissionId: permission.id },
        update: {},
      });
    }
  }

  for (const seedUser of SEED_USERS) {
    const passwordHash = await bcrypt.hash(
      seedUser.password,
      SEED_PASSWORD_SALT_ROUNDS,
    );
    const user = await prisma.user.upsert({
      where: { email: seedUser.email },
      create: { email: seedUser.email, name: seedUser.name, passwordHash },
      update: { name: seedUser.name, passwordHash },
    });

    const role = rolesByName.get(seedUser.role)!;
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      create: { userId: user.id, roleId: role.id },
      update: {},
    });

    // Fase 1a: profil pendamping 1:1 supaya halaman Siswa/Anak/Tutor ada datanya.
    if (seedUser.role === ROLE_NAMES.SISWA) {
      await prisma.student.upsert({
        where: { userId: user.id },
        create: { userId: user.id, address: 'Jl. Contoh No. 1' },
        update: {},
      });
    }
    if (seedUser.role === ROLE_NAMES.ORANG_TUA) {
      await prisma.parent.upsert({
        where: { userId: user.id },
        create: { userId: user.id },
        update: {},
      });
    }
    if (seedUser.role === ROLE_NAMES.TUTOR) {
      await prisma.tutor.upsert({
        where: { userId: user.id },
        create: { userId: user.id, specialization: 'Matematika' },
        update: {},
      });
    }
  }

  // No. WA ortu wajib untuk reminder — isi default bila kosong (tanpa menimpa
  // nomor yang sudah diatur manual).
  await prisma.user.updateMany({
    where: { email: 'ortu1@bimbel.test', OR: [{ phone: null }, { phone: '' }] },
    data: { phone: '081200002001' },
  });

  // Fase 1a: hubungkan ortu seed <-> siswa seed (1 ortu -> 1 anak awal).
  const [seedParent, seedStudent] = await Promise.all([
    prisma.parent.findFirst({
      where: { user: { email: 'ortu1@bimbel.test' } },
    }),
    prisma.student.findFirst({
      where: { user: { email: 'siswa1@bimbel.test' } },
    }),
  ]);
  if (seedParent && seedStudent) {
    await prisma.parentStudent.upsert({
      where: {
        parentId_studentId: { parentId: seedParent.id, studentId: seedStudent.id },
      },
      create: { parentId: seedParent.id, studentId: seedStudent.id },
      update: {},
    });
  }

  // Master data: Mapel (kode mapel) & Level Kelas — dipakai dropdown Program/Level.
  const subjectSeeds = [
    { code: 'MTK', name: 'Matematika' },
    { code: 'BIN', name: 'Bahasa Indonesia' },
    { code: 'BIG', name: 'Bahasa Inggris' },
    { code: 'IPA', name: 'IPA Terpadu' },
  ];
  const subjects = new Map<string, string>();
  for (const s of subjectSeeds) {
    const row = await prisma.subject.upsert({
      where: { code: s.code },
      create: s,
      update: { name: s.name },
    });
    subjects.set(s.code, row.id);
  }
  const gradeLevelSeeds = [
    { code: 'TK', name: 'TK / Pra SD', sortOrder: 0 },
    { code: 'SD-1', name: 'SD Kelas 1', sortOrder: 1 },
    { code: 'SD-2', name: 'SD Kelas 2', sortOrder: 2 },
    { code: 'SD-3', name: 'SD Kelas 3', sortOrder: 3 },
    { code: 'SD-4', name: 'SD Kelas 4', sortOrder: 4 },
    { code: 'SD-5', name: 'SD Kelas 5', sortOrder: 5 },
    { code: 'SD-6', name: 'SD Kelas 6', sortOrder: 6 },
    { code: 'SMP-7', name: 'SMP Kelas 7', sortOrder: 7 },
    { code: 'SMP-8', name: 'SMP Kelas 8', sortOrder: 8 },
    { code: 'SMP-9', name: 'SMP Kelas 9', sortOrder: 9 },
    { code: 'SMA-10', name: 'SMA Kelas 10', sortOrder: 10 },
    { code: 'SMA-11', name: 'SMA Kelas 11', sortOrder: 11 },
    { code: 'SMA-12', name: 'SMA Kelas 12', sortOrder: 12 },
  ];
  const gradeLevels = new Map<string, string>();
  for (const g of gradeLevelSeeds) {
    const row = await prisma.gradeLevel.upsert({
      where: { code: g.code },
      create: g,
      update: { name: g.name, sortOrder: g.sortOrder },
    });
    gradeLevels.set(g.code, row.id);
  }

  // Kategori konten bawaan — bisa ditambah dari UI (Kelola Tipe) tanpa ubah kode.
  const categorySeeds = [
    { code: 'HARIAN', name: 'Latihan / Ujian Harian', sortOrder: 10 },
    { code: 'UTS', name: 'UTS', sortOrder: 20 },
    { code: 'TO', name: 'Try Out (TO)', sortOrder: 30 },
    { code: 'UAS', name: 'UAS', sortOrder: 40 },
    { code: 'BAB', name: 'Ujian Bab / Materi', sortOrder: 50 },
  ];
  for (const c of categorySeeds) {
    await prisma.contentCategoryDef.upsert({
      where: { code: c.code },
      create: c,
      update: { name: c.name, sortOrder: c.sortOrder },
    });
  }

  // Katalog brosur GFS Sept 2026 — angka persis price list:
  // - Reguler: biaya 1 tahun ajaran + opsi lunas di awal / angsur 2x / bulanan.
  // - Extra: per bulan + harga promo (diskon bila ikut kelas reguler).
  // - Privat: per pertemuan dibayar di awal, harga menurut jumlah siswa.
  const ALL_SUBJECTS = ['MTK', 'BIN', 'BIG', 'IPA']
    .map((c) => subjects.get(c))
    .filter((id): id is string => Boolean(id));

  const regProgram = await prisma.program.upsert({
    where: { code: 'REG' },
    create: {
      name: 'Kelas Reguler',
      code: 'REG',
      category: 'REGULER',
      registrationFee: 250000,
      description:
        'Kelas berkelompok per jenjang kelas — mencakup Matematika, B. Indonesia, B. Inggris, dan IPA. Bayar lunas di awal, 2x angsuran, atau bulanan.',
    },
    update: { category: 'REGULER', registrationFee: 250000 },
  });
  // [jenjangGradeLevel[], hargaTahunan, lunasAwal, angsuran2x, cicilanBulanan, jumlahBulan, biayaDaftar]
  const regRows: [string[], number, number, number, number, number, number | null][] = [
    [['TK'], 3300000, 2000000, 1000000, 200000, 10, 300000],
    [['SD-1', 'SD-2', 'SD-3'], 3300000, 2000000, 1000000, 200000, 10, null],
    [['SD-4'], 4400000, 2500000, 1250000, 250000, 10, null],
    [['SD-5'], 4400000, 2750000, 1375000, 275000, 10, null],
    [['SD-6'], 5000000, 2700000, 1350000, 270000, 10, null],
    [['SMP-7', 'SMP-8'], 5600000, 3000000, 1500000, 300000, 10, null],
    [['SMP-9'], 6000000, 3150000, 1575000, 350000, 9, null],
    [['SMA-10', 'SMA-11'], 6600000, 3500000, 1750000, 350000, 10, null],
    [['SMA-12'], 8000000, 4050000, 2025000, 450000, 9, null],
  ];
  const regLevelByCode = new Map<string, string>();
  for (const [codes, annual, fullPay, inst2x, monthly, monthlyCount, regOverride] of regRows) {
    for (const glCode of codes) {
      const glId = gradeLevels.get(glCode);
      if (!glId) continue;
      const gl = gradeLevelSeeds.find((g) => g.code === glCode)!;
      const pricing = {
        price: annual,
        priceUnit: 'YEAR' as const,
        fullPayPrice: fullPay,
        installment2x: inst2x,
        monthlyAmount: monthly,
        monthlyCount,
        registrationFee: regOverride,
      };
      const lvl = await prisma.level.upsert({
        where: {
          programId_name: { programId: regProgram.id, name: gl.name },
        },
        create: {
          programId: regProgram.id,
          gradeLevelId: glId,
          name: gl.name,
          code: gl.code,
          sortOrder: gl.sortOrder,
          ...pricing,
        },
        update: { gradeLevelId: glId, ...pricing },
      });
      regLevelByCode.set(glCode, lvl.id);
      await prisma.levelSubject.createMany({
        data: ALL_SUBJECTS.map((subjectId) => ({
          levelId: lvl.id,
          subjectId,
        })),
        skipDuplicates: true,
      });
    }
  }

  const extProgram = await prisma.program.upsert({
    where: { code: 'EXT' },
    create: {
      name: 'Kelas Extra',
      code: 'EXT',
      category: 'EXTRA',
      registrationFee: 200000,
      description:
        'Kelas tambahan di luar paket reguler — diskon 25-50% untuk satu program extra bila ikut kelas reguler.',
    },
    update: { category: 'EXTRA', registrationFee: 200000 },
  });
  const extraLevels = [
    { name: 'Berhitung (Kelas 2-9)', subs: ['MTK'], price: 150000, promo: 75000, sort: 1 },
    { name: 'Deeniyat / Ngaji', subs: [] as string[], price: 200000, promo: 150000, sort: 2 },
    { name: 'B. Inggris — Basic 1', subs: ['BIG'], price: 200000, promo: 100000, sort: 3 },
    { name: 'B. Inggris — Basic 2', subs: ['BIG'], price: 200000, promo: 100000, sort: 4 },
    { name: 'B. Inggris — Basic 3-4', subs: ['BIG'], price: 250000, promo: 125000, sort: 5 },
    { name: 'B. Inggris — Elementari 1', subs: ['BIG'], price: 250000, promo: 125000, sort: 6 },
    { name: 'B. Inggris — Elementari 2', subs: ['BIG'], price: 250000, promo: 125000, sort: 7 },
    { name: 'B. Inggris — Elementari 3', subs: ['BIG'], price: 300000, promo: 150000, sort: 8 },
  ];
  for (const e of extraLevels) {
    const lvl = await prisma.level.upsert({
      where: { programId_name: { programId: extProgram.id, name: e.name } },
      create: {
        programId: extProgram.id,
        name: e.name,
        sortOrder: e.sort,
        price: e.price,
        priceUnit: 'MONTH',
        promoPrice: e.promo,
      },
      update: { price: e.price, priceUnit: 'MONTH', promoPrice: e.promo },
    });
    await prisma.levelSubject.createMany({
      data: e.subs
        .map((c) => subjects.get(c))
        .filter((id): id is string => Boolean(id))
        .map((subjectId) => ({ levelId: lvl.id, subjectId })),
      skipDuplicates: true,
    });
  }

  const prvProgram = await prisma.program.upsert({
    where: { code: 'PRV' },
    create: {
      name: 'Kelas Privat di Rumah',
      code: 'PRV',
      category: 'PRIVAT',
      registrationFee: 200000,
      description:
        'Bimbingan privat di rumah — dibayar di awal per pertemuan, harga menurun untuk kelompok 2-5 siswa. Jarak >5 km kena cas transport.',
    },
    update: { category: 'PRIVAT', registrationFee: 200000 },
  });
  const privateLevels = [
    { name: 'Pra Sekolah (TK)', price: 100000, tiers: { '2': 75000, '3': 65000, '4': 55000, '5': 45000 }, dur: 60, sort: 1 },
    { name: 'Kelas 1-3 SD', price: 100000, tiers: { '2': 75000, '3': 65000, '4': 55000, '5': 45000 }, dur: 60, sort: 2 },
    { name: 'Kelas 4-6 SD', price: 120000, tiers: { '2': 90000, '3': 78000, '4': 66000, '5': 54000 }, dur: 60, sort: 3 },
    { name: 'Kelas 7-8 SMP', price: 120000, tiers: { '2': 90000, '3': 78000, '4': 66000, '5': 54000 }, dur: 90, sort: 4 },
    { name: 'Kelas 9 SMP', price: 140000, tiers: { '2': 90000, '3': 78000, '4': 66000, '5': 54000 }, dur: 90, sort: 5 },
    { name: 'Kelas 10-11 SMA', price: 130000, tiers: { '2': 97500, '3': 84500, '4': 71500, '5': 58500 }, dur: 90, sort: 6 },
    { name: 'Kelas 12 SMA', price: 130000, tiers: { '2': 97500, '3': 84500, '4': 71500, '5': 58500 }, dur: 90, sort: 7 },
    { name: 'Kursus B. Inggris', price: 120000, tiers: { '2': 90000, '3': 78000, '4': 66000, '5': 54000 }, dur: 90, sort: 8 },
  ];
  for (const p of privateLevels) {
    const lvl = await prisma.level.upsert({
      where: { programId_name: { programId: prvProgram.id, name: p.name } },
      create: {
        programId: prvProgram.id,
        name: p.name,
        sortOrder: p.sort,
        price: p.price,
        priceUnit: 'SESSION',
        sessionPrices: p.tiers,
        sessionDurationMin: p.dur,
      },
      update: {
        price: p.price,
        priceUnit: 'SESSION',
        sessionPrices: p.tiers,
        sessionDurationMin: p.dur,
      },
    });
    await prisma.levelSubject.createMany({
      data: ALL_SUBJECTS.map((subjectId) => ({ levelId: lvl.id, subjectId })),
      skipDuplicates: true,
    });
  }

  // Fase 2a: minimal 2 akun kas/bank (Kas & Bank) + contoh invoice dari paket
  // untuk siswa seed pertama (item auto-generate dari harga paket).
  await prisma.financialAccount.upsert({
    where: { code: 'KAS' },
    create: { name: 'Kas Kantor', code: 'KAS', type: 'CASH' },
    update: { name: 'Kas Kantor' },
  });
  await prisma.financialAccount.upsert({
    where: { code: 'BANK' },
    create: { name: 'Bank Operasional', code: 'BANK', type: 'BANK' },
    update: { name: 'Bank Operasional' },
  });

  // Fase 6: default pengaturan aplikasi (identitas, finance, notifikasi WA).
  // Struktur value harus sama dengan SETTING_DEFS di settings.service.ts.
  const defaultSettings: Array<{ key: string; value: object }> = [
    {
      key: 'company',
      value: {
        name: 'BimbelGFS',
        address: 'Jl. Contoh No. 1',
        phone: '+62 812-3456-7890',
        email: 'info@bimbelgfs.com',
      },
    },
    {
      key: 'finance',
      value: { invoiceDueDays: 14 },
    },
    {
      key: 'whatsapp',
      value: {
        adminPhone: '',
        notifyInvoiceIssued: true,
        notifyPaymentVerified: true,
        notifyPaymentRejected: true,
        notifyPaymentProof: true,
        notifyPayrollPaid: true,
      },
    },
  ];
  for (const s of defaultSettings) {
    await prisma.appSetting.upsert({
      where: { key: s.key },
      create: { key: s.key, value: s.value },
      update: {},
    });
  }

  // Fase 1b: contoh kelompok + 2 tutor + 5 siswa supaya DoD bisa diverifikasi
  // langsung dari data seed (tanpa input manual dulu).
  const seedTutors: Array<{ email: string; name: string; specialization: string; phone: string }> = [
    { email: 'tutor1@bimbel.test', name: 'Tutor Satu', specialization: 'Matematika', phone: '081200001001' },
    { email: 'tutor2@bimbel.test', name: 'Tutor Dua', specialization: 'Matematika SMP', phone: '081200001002' },
  ];
  const tutorProfiles: Array<{ id: string }> = [];
  for (const t of seedTutors) {
    const passwordHash = await bcrypt.hash('Tutor123!', SEED_PASSWORD_SALT_ROUNDS);
    const user = await prisma.user.upsert({
      where: { email: t.email },
      create: { email: t.email, name: t.name, passwordHash, phone: t.phone },
      update: { name: t.name },
    });
    // Isi phone bila masih kosong — tidak menimpa nomor yang sudah diatur manual.
    if (!user.phone) {
      await prisma.user.update({ where: { id: user.id }, data: { phone: t.phone } });
    }
    const roleTutor = rolesByName.get(ROLE_NAMES.TUTOR)!;
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: roleTutor.id } },
      create: { userId: user.id, roleId: roleTutor.id },
      update: {},
    });
    const profile = await prisma.tutor.upsert({
      where: { userId: user.id },
      create: { userId: user.id, specialization: t.specialization },
      update: {},
    });
    tutorProfiles.push(profile);
  }

  const demoStudents: Array<{ email: string; name: string }> = [
    { email: 'siswa1@bimbel.test', name: 'Siswa Satu' },
    { email: 'siswa2@bimbel.test', name: 'Siswa Dua' },
    { email: 'siswa3@bimbel.test', name: 'Siswa Tiga' },
    { email: 'siswa4@bimbel.test', name: 'Siswa Empat' },
    { email: 'siswa5@bimbel.test', name: 'Siswa Lima' },
  ];
  const studentProfiles: Array<{ id: string }> = [];
  for (const s of demoStudents) {
    const existing = await prisma.user.findUnique({ where: { email: s.email } });
    const passwordHash = await bcrypt.hash('Siswa123!', SEED_PASSWORD_SALT_ROUNDS);
    const user =
      existing ??
      (await prisma.user.create({ data: { email: s.email, name: s.name, passwordHash } }));
    const roleSiswa = rolesByName.get(ROLE_NAMES.SISWA)!;
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: roleSiswa.id } },
      create: { userId: user.id, roleId: roleSiswa.id },
      update: {},
    });
    const profile = await prisma.student.upsert({
      where: { userId: user.id },
      create: { userId: user.id, address: 'Jl. Contoh No. 1' },
      update: {},
    });
    studentProfiles.push(profile);
  }

  // Kelompok demo menempel ke katalog brosur (Kelas Reguler, jenjang SD Kelas 5).
  const sd5LevelId = regLevelByCode.get('SD-5');
  const demoGroup = await prisma.learningGroup.upsert({
    where: { code: 'REG-SD5-A' },
    create: {
      name: 'Reguler SD 5 - Kelas A',
      code: 'REG-SD5-A',
      programId: regProgram.id,
      levelId: sd5LevelId,
      capacity: 20,
    },
    update: { programId: regProgram.id, levelId: sd5LevelId },
  });
  for (const tutor of tutorProfiles) {
    await prisma.groupTutor.upsert({
      where: { groupId_tutorId: { groupId: demoGroup.id, tutorId: tutor.id } },
      create: { groupId: demoGroup.id, tutorId: tutor.id },
      update: {},
    });
  }
  for (const student of studentProfiles) {
    await prisma.groupMember.upsert({
      where: { groupId_studentId: { groupId: demoGroup.id, studentId: student.id } },
      create: { groupId: demoGroup.id, studentId: student.id },
      update: {},
    });
  }

  // Konsistensi data demo: setiap siswa di kelompok punya pendaftaran PLACED
  // (semua menempel ke ortu1) supaya halaman Jadwal vs Anak & Daftar selaras.
  if (seedParent) {
    const ym = `${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    for (const [i, s] of demoStudents.entries()) {
      const student = studentProfiles[i];
      await prisma.parentStudent.upsert({
        where: {
          parentId_studentId: {
            parentId: seedParent.id,
            studentId: student.id,
          },
        },
        create: { parentId: seedParent.id, studentId: student.id },
        update: {},
      });
      const existingEnr = await prisma.enrollment.findFirst({
        where: { studentId: student.id, programId: regProgram.id },
      });
      if (existingEnr) {
        await prisma.enrollment.update({
          where: { id: existingEnr.id },
          data: { status: 'PLACED', groupId: demoGroup.id, levelId: sd5LevelId },
        });
        continue;
      }
      // Upsert by nomor (unik) — seed harus idempotent: bila invoice sudah
      // ada (mis. enrollment pernah dihapus), pakai ulang, jangan create ulang.
      const invoice = await prisma.invoice.upsert({
        where: { number: `INV-${ym}-SEED-${i + 1}` },
        update: {},
        create: {
          number: `INV-${ym}-SEED-${i + 1}`,
          studentId: student.id,
          status: 'ISSUED',
          totalAmount: 525_000,
          amountPaid: 525_000,
          issuedAt: new Date(),
          items: {
            create: [
              {
                description: 'Biaya pendaftaran — Kelas Reguler',
                quantity: 1,
                unitPrice: 250_000,
                amount: 250_000,
              },
              {
                description: 'Angsuran pertama — Reguler SD Kelas 5',
                quantity: 1,
                unitPrice: 275_000,
                amount: 275_000,
              },
            ],
          },
        },
      });
      // Invoice lama bisa sudah menempel ke enrollment lain (invoiceId unik) —
      // perbarui yang ada daripada create ulang agar seed tetap idempotent.
      const linkedEnr = await prisma.enrollment.findUnique({
        where: { invoiceId: invoice.id },
      });
      if (linkedEnr) {
        await prisma.enrollment.update({
          where: { id: linkedEnr.id },
          data: { status: 'PLACED', groupId: demoGroup.id, levelId: sd5LevelId },
        });
        continue;
      }
      await prisma.enrollment.create({
        data: {
          parentId: seedParent.id,
          studentId: student.id,
          programId: regProgram.id,
          levelId: sd5LevelId!,
          invoiceId: invoice.id,
          groupId: demoGroup.id,
          status: 'PLACED',
          paymentPlan: 'MONTHLY',
          childName: s.name,
        },
      });
    }

    // Pembayaran seed: invoice yang ditandai lunas mendapat jejak payment +
    // allocation + receipt + ledger supaya halaman Bukti/Kwitansi/Transaksi/
    // Kas-Bank langsung berisi data nyata (bukan invoice lunas tanpa bayar).
    const kasForSeed = await prisma.financialAccount.findFirst({
      where: { code: 'KAS' },
    });
    const bankForSeed = await prisma.financialAccount.findFirst({
      where: { code: 'BANK' },
    });
    const financeAdmin = await prisma.user.findFirst({
      where: { email: 'adminfinance1@bimbel.test' },
    });
    if (kasForSeed && bankForSeed && financeAdmin) {
      const paidNoTrace = await prisma.invoice.findMany({
        where: { amountPaid: { gt: 0 }, allocations: { none: {} } },
        select: {
          id: true,
          number: true,
          studentId: true,
          amountPaid: true,
        },
        take: 10,
      });
      let seedPaySeq = 0;
      for (const inv of paidNoTrace) {
        seedPaySeq += 1;
        const paid = Number(inv.amountPaid);
        const isCash = seedPaySeq % 2 === 1;
        const account = isCash ? kasForSeed : bankForSeed;
        const method = isCash ? 'CASH' : 'TRANSFER_MANUAL';
        const payment = await prisma.payment.create({
          data: {
            invoiceId: inv.id,
            studentId: inv.studentId,
            accountId: account.id,
            amount: paid,
            method,
            channel: isCash ? 'CASH' : 'MANUAL',
            status: 'VERIFIED',
            verifiedBy: financeAdmin.id,
            verifiedAt: new Date(),
            paidAt: new Date(),
            createdBy: financeAdmin.id,
            proofNote: isCash
              ? 'Pembayaran tunai di kantor (seed)'
              : 'Transfer bank (seed)',
          },
        });
        await prisma.paymentAllocation.create({
          data: { paymentId: payment.id, invoiceId: inv.id, amount: paid },
        });
        await prisma.receipt.create({
          data: {
            number: `KWT-${ym}-SEED-${seedPaySeq}`,
            paymentId: payment.id,
            invoiceId: inv.id,
            studentId: inv.studentId,
            amount: paid,
            method,
            status: 'VERIFIED',
            verifierId: financeAdmin.id,
          },
        });
        await prisma.ledgerEntry.create({
          data: {
            accountId: account.id,
            direction: 'IN',
            amount: paid,
            sourceType: 'PAYMENT',
            sourceId: payment.id,
            paymentId: payment.id,
            description: `Pembayaran ${method} invoice ${inv.number}`,
            occurredAt: new Date(),
          },
        });
      }

      // Satu invoice outstanding "angsuran berikutnya" supaya halaman Piutang,
      // pembayaran ortu, dan reminder jatuh tempo punya contoh nyata.
      const placedEnrollment = await prisma.enrollment.findFirst({
        where: { status: 'PLACED', parentId: seedParent.id },
        select: { id: true, studentId: true },
      });
      const existingDue = await prisma.invoice.findFirst({
        where: { number: `INV-${ym}-SEED-DUE` },
      });
      if (placedEnrollment && !existingDue) {
        const due = new Date();
        due.setDate(due.getDate() + 7);
        await prisma.invoice.create({
          data: {
            number: `INV-${ym}-SEED-DUE`,
            studentId: placedEnrollment.studentId,
            enrollmentId: placedEnrollment.id,
            status: 'ISSUED',
            totalAmount: 275_000,
            amountPaid: 0,
            issuedAt: new Date(),
            dueDate: due,
            items: {
              create: [
                {
                  description: 'Angsuran bulan berikutnya — Reguler SD Kelas 5',
                  quantity: 1,
                  unitPrice: 275_000,
                  amount: 275_000,
                },
              ],
            },
          },
        });
      }
    }
  }

  // Fase 1c: 1 gedung + 2 ruangan + 1 schedule mingguan (Senin 16:00-17:30)
  // untuk kelompok demo + 4 session konkret ke depan (untuk DoD manual).
  const demoBuilding = await prisma.building.upsert({
    where: { id: '00000000-0000-4000-8000-0000000001c1' },
    create: { id: '00000000-0000-4000-8000-0000000001c1', name: 'Gedung Utama', address: 'Jl. Contoh No. 1' },
    update: {},
  });
  const roomA = await prisma.room.upsert({
    where: { id: '00000000-0000-4000-8000-0000000001c2' },
    create: { id: '00000000-0000-4000-8000-0000000001c2', buildingId: demoBuilding.id, name: 'Ruang A', capacity: 20 },
    update: {},
  });
  await prisma.room.upsert({
    where: { id: '00000000-0000-4000-8000-0000000001c3' },
    create: { id: '00000000-0000-4000-8000-0000000001c3', buildingId: demoBuilding.id, name: 'Ruang B', capacity: 15 },
    update: {},
  });
  // Template sesi baru: konkret per tanggal dengan tutor & mapel berganti
  // tiap minggu (bukan jadwal tetap per kelompok). Hari/jam bervariasi supaya
  // mencerminkan pemakaian nyata — tutor bisa beda tiap sesi & >1 sesi sehari.
  const roomB = await prisma.room.findUnique({
    where: { id: '00000000-0000-4000-8000-0000000001c3' },
  });
  const monday = nextWeekday(new Date(), 1);
  const sessionSeeds: Array<{
    dayOffset: number;
    startHour: number;
    tutorIdx: number;
    subjectCode: string;
    roomId: string;
  }> = [
    // Minggu 1
    { dayOffset: 0, startHour: 16, tutorIdx: 0, subjectCode: 'MTK', roomId: roomA.id },
    { dayOffset: 2, startHour: 16, tutorIdx: 1, subjectCode: 'BIN', roomId: roomB?.id ?? roomA.id },
    // Minggu 2 — tutor tertukar + hari berbeda
    { dayOffset: 7, startHour: 16, tutorIdx: 1, subjectCode: 'IPA', roomId: roomA.id },
    { dayOffset: 9, startHour: 9, tutorIdx: 0, subjectCode: 'BIG', roomId: roomA.id },
    { dayOffset: 9, startHour: 16, tutorIdx: 1, subjectCode: 'MTK', roomId: roomB?.id ?? roomA.id },
    // Minggu 3
    { dayOffset: 14, startHour: 16, tutorIdx: 0, subjectCode: 'BIN', roomId: roomA.id },
    // Minggu 4
    { dayOffset: 21, startHour: 16, tutorIdx: 1, subjectCode: 'BIG', roomId: roomB?.id ?? roomA.id },
    { dayOffset: 23, startHour: 10, tutorIdx: 0, subjectCode: 'IPA', roomId: roomA.id },
  ];
  for (const s of sessionSeeds) {
    const startsAt = new Date(monday);
    startsAt.setDate(startsAt.getDate() + s.dayOffset);
    startsAt.setHours(s.startHour, 0, 0, 0);
    const endsAt = new Date(startsAt);
    endsAt.setMinutes(endsAt.getMinutes() + 90);
    const tutorId = tutorProfiles[s.tutorIdx]?.id;
    const subjectId = subjects.get(s.subjectCode);
    const existing = await prisma.session.findFirst({
      where: { groupId: demoGroup.id, startsAt },
      select: { id: true },
    });
    if (!existing) {
      await prisma.session.create({
        data: {
          groupId: demoGroup.id,
          tutorId,
          roomId: s.roomId,
          subjectId: subjectId ?? null,
          startsAt,
          endsAt,
        },
      });
    } else {
      // Sinkronisasi template saat re-seed (aman: tidak menimpa absensi karena
      // hanya memperbarui kolom penugasan).
      await prisma.session.update({
        where: { id: existing.id },
        data: { tutorId, roomId: s.roomId, subjectId: subjectId ?? null },
      });
    }
  }
  // Bersihkan template lama: sesi sisa pola mingguan (scheduleId terisi) di
  // luar daftar template baru dihapus bila belum punya absensi.
  const templateStarts = new Set(
    sessionSeeds.map((s) => {
      const d = new Date(monday);
      d.setDate(d.getDate() + s.dayOffset);
      d.setHours(s.startHour, 0, 0, 0);
      return d.getTime();
    }),
  );
  const staleSessions = await prisma.session.findMany({
    where: { groupId: demoGroup.id },
    select: { id: true, startsAt: true, attendances: { select: { id: true }, take: 1 } },
  });
  for (const stale of staleSessions) {
    if (templateStarts.has(stale.startsAt.getTime())) continue;
    if (stale.attendances.length > 0) continue;
    await prisma.session.delete({ where: { id: stale.id } });
  }
  // Template jadwal mingguan lama tidak dipakai lagi.
  await prisma.schedule.deleteMany({
    where: { id: '00000000-0000-4000-8000-0000000001c4' },
  });

  // Fase 5a: tarif honor untuk tutor seed supaya payroll bisa langsung
  // diverifikasi tanpa input manual. Tarif dibuat sekali (guard via findFirst).
  const now = new Date();
  const seedRateStart = new Date(now.getFullYear(), 0, 1);
  const seedRateDefs: Array<{ tutorIdx: number; workType: 'REGULAR_SESSION' | 'PRIVATE_SESSION' | 'EXTRA_CLASS' | 'SPECIAL_TASK'; amount: number; unit: 'SESSION' | 'HOUR' }> = [
    { tutorIdx: 0, workType: 'REGULAR_SESSION', amount: 75000, unit: 'SESSION' },
    { tutorIdx: 0, workType: 'PRIVATE_SESSION', amount: 100000, unit: 'SESSION' },
    { tutorIdx: 0, workType: 'EXTRA_CLASS', amount: 90000, unit: 'SESSION' },
    { tutorIdx: 0, workType: 'SPECIAL_TASK', amount: 50000, unit: 'SESSION' },
    { tutorIdx: 1, workType: 'REGULAR_SESSION', amount: 70000, unit: 'SESSION' },
  ];
  for (const def of seedRateDefs) {
    const tutor = tutorProfiles[def.tutorIdx];
    if (!tutor) continue;
    const existingRate = await prisma.tutorRate.findFirst({
      where: { tutorId: tutor.id, workType: def.workType, isActive: true },
      select: { id: true },
    });
    if (!existingRate) {
      await prisma.tutorRate.create({
        data: {
          tutorId: tutor.id,
          workType: def.workType,
          amount: def.amount,
          unit: def.unit,
          effectiveFrom: seedRateStart,
        },
      });
    }
  }

  // Fase 2d: 1 budget + 1 expense nyata per periode berjalan supaya
  // RAB vs Actual langsung menampilkan variance (DoD 2d) tanpa input manual.
  const seedPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const kasAccount = await prisma.financialAccount.findFirst({ where: { code: 'KAS' } });

  if (kasAccount) {
    const seedBudget = await prisma.budget.upsert({
      where: { category_period: { category: 'AKADEMIK', period: seedPeriod } },
      create: { category: 'AKADEMIK', period: seedPeriod, amount: 5000000, description: 'RAB seed Fase 2d' },
      update: {},
    });
    const seedDay = new Date(now.getFullYear(), now.getMonth(), Math.min(15, 28), 10, 0, 0, 0);
    const hasSeedExpense = await prisma.expense.findFirst({
      where: { budgetId: seedBudget.id, description: 'Belanja ATK seed Fase 2d' },
    });
    if (!hasSeedExpense) {
      const seedExpense = await prisma.expense.create({
        data: {
          budgetId: seedBudget.id,
          accountId: kasAccount.id,
          amount: 1500000,
          description: 'Belanja ATK seed Fase 2d',
          category: 'AKADEMIK',
          occurredAt: seedDay,
          createdBy: 'seed',
        },
      });
      const hasLedger = await prisma.ledgerEntry.findFirst({
        where: { sourceType: 'EXPENSE', sourceId: seedExpense.id },
      });
      if (!hasLedger) {
        await prisma.ledgerEntry.create({
          data: {
            accountId: kasAccount.id,
            direction: 'OUT',
            amount: 1500000,
            sourceType: 'EXPENSE',
            sourceId: seedExpense.id,
            description: 'Pengeluaran: Belanja ATK seed Fase 2d',
            occurredAt: seedDay,
          },
        });
      }
    }
  }

  // ===== Seed konten demo lengkap =====
  // Tujuan: semua halaman/fungsi punya data nyata — landing (paket),
  // bank soal per bab, materi, latsol + attempt, ujian + attempt multi-siswa,
  // sesi lampau + absensi, feedback mingguan. Semuanya idempotent.
  const seedAdminUser = await prisma.user.findFirst({
    where: { email: 'adminacademic1@bimbel.test' },
  });
  const seededBy = seedAdminUser?.id || 'seed';

  // a) Paket belajar per jenjang — mengisi slider "Paket Program" di landing.
  const allActiveLevels = await prisma.level.findMany({
    where: { isActive: true },
    include: { program: { select: { name: true } } },
  });
  for (const lvl of allActiveLevels) {
    const pkgName = `Paket ${lvl.name}`;
    const exists = await prisma.package.findFirst({
      where: { levelId: lvl.id, name: pkgName },
      select: { id: true },
    });
    if (exists) continue;
    const [totalSessions, durationWeeks] =
      lvl.priceUnit === 'YEAR'
        ? [40, 40]
        : lvl.priceUnit === 'SESSION'
          ? [8, 4]
          : [4, 4];
    await prisma.package.create({
      data: {
        levelId: lvl.id,
        name: pkgName,
        code: `PKG-${lvl.id.slice(0, 8).toUpperCase()}`,
        totalSessions,
        durationWeeks,
        price: lvl.price ?? null,
        description: `Paket ${lvl.program.name} — ${lvl.name}.`,
      },
    });
  }

  // a2) Tautkan kelompok demo ke paket — landing mengurutkan "paket
  // terpopuler" dari jumlah anggota kelompok yang memakai paket itu.
  // Ext/privat pakai subset siswa supaya urutan populer terlihat.
  const pkgByLevel = async (levelId?: string | null) =>
    levelId
      ? prisma.package.findFirst({
          where: { levelId, name: { startsWith: 'Paket ' } },
          select: { id: true },
        })
      : null;
  const sd5Pkg = await pkgByLevel(sd5LevelId);
  if (sd5Pkg) {
    await prisma.learningGroup.update({
      where: { id: demoGroup.id },
      data: { packageId: sd5Pkg.id },
    });
  }
  // extProgram & prvProgram sudah dideklarasikan di bagian katalog di atas.
  const extLevel = extProgram
    ? await prisma.level.findFirst({
        where: { programId: extProgram.id, isActive: true },
        orderBy: { name: 'asc' },
      })
    : null;
  const prvLevel = prvProgram
    ? await prisma.level.findFirst({
        where: { programId: prvProgram.id, isActive: true },
        orderBy: { name: 'asc' },
      })
    : null;
  const extPkg = await pkgByLevel(extLevel?.id);
  const prvPkg = await pkgByLevel(prvLevel?.id);
  const demoGroupSeeds = [
    {
      code: 'EXT-DEMO-A',
      name: 'Extra Demo - Kelas A',
      programId: extProgram?.id,
      levelId: extLevel?.id,
      packageId: extPkg?.id,
      members: studentProfiles.slice(0, 3),
    },
    {
      code: 'PRV-DEMO-A',
      name: 'Privat Demo - Kelas A',
      programId: prvProgram?.id,
      levelId: prvLevel?.id,
      packageId: prvPkg?.id,
      members: studentProfiles.slice(0, 1),
    },
  ];
  for (const g of demoGroupSeeds) {
    if (!g.programId) continue;
    const grp = await prisma.learningGroup.upsert({
      where: { code: g.code },
      create: {
        name: g.name,
        code: g.code,
        programId: g.programId,
        levelId: g.levelId,
        packageId: g.packageId,
        capacity: 10,
      },
      update: { programId: g.programId, levelId: g.levelId, packageId: g.packageId },
    });
    for (const student of g.members) {
      await prisma.groupMember.upsert({
        where: { groupId_studentId: { groupId: grp.id, studentId: student.id } },
        create: { groupId: grp.id, studentId: student.id },
        update: {},
      });
    }
  }

  // b) Kategori "Bab" untuk drill-down & grafik perkembangan per bab.
  const babSeeds = [
    { code: 'BAB-1', name: 'Bab 1', sortOrder: 51 },
    { code: 'BAB-2', name: 'Bab 2', sortOrder: 52 },
    { code: 'BAB-3', name: 'Bab 3', sortOrder: 53 },
  ];
  for (const c of babSeeds) {
    await prisma.contentCategoryDef.upsert({
      where: { code: c.code },
      create: c,
      update: { name: c.name, sortOrder: c.sortOrder },
    });
  }

  // c) Bank soal SD Kelas 5 lintas mapel & bab — cukup untuk ujian, latsol,
  // rekap jawaban, dan grafik perkembangan.
  type SeedQ = {
    id: string;
    subject: string;
    category: string;
    content: string;
    difficulty: 'EASY' | 'MEDIUM' | 'HARD';
    points: number;
    explanation?: string;
    options: Array<{ content: string; isCorrect: boolean }>;
  };
  const seedQuestionDefs: SeedQ[] = [
    { id: 'seed-qm-b1-1', subject: 'MTK', category: 'BAB-1', content: 'Hasil dari 3/4 + 1/2 adalah…', difficulty: 'EASY', points: 1, explanation: 'Samakan penyebut: 3/4 + 2/4 = 5/4 = 1¼.', options: [{ content: '1¼', isCorrect: true }, { content: '4/6', isCorrect: false }, { content: '1⅛', isCorrect: false }, { content: '5/8', isCorrect: false }] },
    { id: 'seed-qm-b1-2', subject: 'MTK', category: 'BAB-1', content: 'Bentuk desimal dari 7/8 adalah…', difficulty: 'MEDIUM', points: 1, explanation: '7 ÷ 8 = 0,875.', options: [{ content: '0,875', isCorrect: true }, { content: '0,78', isCorrect: false }, { content: '0,785', isCorrect: false }, { content: '0,87', isCorrect: false }] },
    { id: 'seed-qm-b2-1', subject: 'MTK', category: 'BAB-2', content: 'Luas persegi panjang dengan panjang 12 cm dan lebar 7 cm adalah…', difficulty: 'EASY', points: 1, explanation: 'L = p × l = 12 × 7 = 84 cm².', options: [{ content: '84 cm²', isCorrect: true }, { content: '38 cm²', isCorrect: false }, { content: '96 cm²', isCorrect: false }, { content: '74 cm²', isCorrect: false }] },
    { id: 'seed-qm-b2-2', subject: 'MTK', category: 'BAB-2', content: 'Keliling persegi dengan sisi 9 cm adalah…', difficulty: 'EASY', points: 1, explanation: 'K = 4 × s = 36 cm.', options: [{ content: '36 cm', isCorrect: true }, { content: '18 cm', isCorrect: false }, { content: '81 cm', isCorrect: false }, { content: '27 cm', isCorrect: false }] },
    { id: 'seed-qb-b1-1', subject: 'BIN', category: 'BAB-1', content: 'Kalimat yang menggunakan huruf kapital dengan benar adalah…', difficulty: 'MEDIUM', points: 1, explanation: 'Nama orang dan awal kalimat memakai huruf kapital.', options: [{ content: 'Adik pergi ke Sekolah Dasar Negeri 1', isCorrect: false }, { content: 'Siti belajar di kelas lima', isCorrect: true }, { content: 'ibu Membeli Sayur di pasar', isCorrect: false }, { content: 'Kami Berlibur Ke Bandung', isCorrect: false }] },
    { id: 'seed-qb-b1-2', subject: 'BIN', category: 'BAB-1', content: 'Antonim dari kata "rajin" adalah…', difficulty: 'EASY', points: 1, explanation: 'Rajin ↔ malas.', options: [{ content: 'Malas', isCorrect: true }, { content: 'Pandai', isCorrect: false }, { content: 'Cerdas', isCorrect: false }, { content: 'Tekun', isCorrect: false }] },
    { id: 'seed-qe-b1-1', subject: 'BIG', category: 'BAB-1', content: '"She ___ to school every day."', difficulty: 'MEDIUM', points: 1, explanation: 'Subjek she → verb + s: goes.', options: [{ content: 'goes', isCorrect: true }, { content: 'go', isCorrect: false }, { content: 'going', isCorrect: false }, { content: 'gone', isCorrect: false }] },
    { id: 'seed-qe-b1-2', subject: 'BIG', category: 'BAB-1', content: 'The capital city of Indonesia is…', difficulty: 'EASY', points: 1, explanation: 'Jakarta adalah ibu kota Indonesia.', options: [{ content: 'Jakarta', isCorrect: true }, { content: 'Bandung', isCorrect: false }, { content: 'Surabaya', isCorrect: false }, { content: 'Medan', isCorrect: false }] },
    { id: 'seed-qi-b2-1', subject: 'IPA', category: 'BAB-2', content: 'Proses tumbuhan membuat makanan sendiri disebut…', difficulty: 'EASY', points: 1, explanation: 'Fotosintesis: CO2 + air + cahaya → glukosa + O2.', options: [{ content: 'Fotosintesis', isCorrect: true }, { content: 'Respirasi', isCorrect: false }, { content: 'Fermentasi', isCorrect: false }, { content: 'Transpirasi', isCorrect: false }] },
    { id: 'seed-qi-b2-2', subject: 'IPA', category: 'BAB-2', content: 'Planet terdekat dari Matahari adalah…', difficulty: 'EASY', points: 1, explanation: 'Urutan: Merkurius, Venus, Bumi, Mars, …', options: [{ content: 'Merkurius', isCorrect: true }, { content: 'Venus', isCorrect: false }, { content: 'Bumi', isCorrect: false }, { content: 'Mars', isCorrect: false }] },
  ];
  const seedQuestions = new Map<string, { id: string; points: number; correctOptionIds: string[] }>();
  for (const q of seedQuestionDefs) {
    const row = await prisma.question.upsert({
      where: { id: q.id },
      create: {
        id: q.id,
        programId: regProgram.id,
        levelId: sd5LevelId,
        subjectId: subjects.get(q.subject),
        category: q.category,
        type: 'SINGLE_CHOICE',
        content: q.content,
        difficulty: q.difficulty,
        points: q.points,
        explanation: q.explanation ?? null,
        createdBy: seededBy,
      },
      update: {
        programId: regProgram.id,
        levelId: sd5LevelId,
        subjectId: subjects.get(q.subject),
        category: q.category,
        explanation: q.explanation ?? null,
      },
    });
    const existingOpts = await prisma.questionOption.findMany({
      where: { questionId: row.id },
      orderBy: { sortOrder: 'asc' },
    });
    if (existingOpts.length === 0) {
      await prisma.questionOption.createMany({
        data: q.options.map((o, i) => ({
          id: `${q.id}-o${i}`,
          questionId: row.id,
          sortOrder: i,
          content: o.content,
          isCorrect: o.isCorrect,
        })),
      });
    }
    const opts = await prisma.questionOption.findMany({
      where: { questionId: row.id, isCorrect: true },
      select: { id: true },
    });
    seedQuestions.set(q.id, {
      id: row.id,
      points: q.points,
      correctOptionIds: opts.map((o) => o.id),
    });
  }

  // Tagging ujian seed lama supaya muncul di drill-down dan grafik
  // per bab (jenjang/mapel/tipe/kategori).
  const mtkSubjectId = subjects.get('MTK') ?? null;
  await prisma.exam.update({
    where: { id: 'seed-exam1' },
    data: { programId: regProgram.id, levelId: sd5LevelId, subjectId: mtkSubjectId, category: 'HARIAN' },
  }).catch(() => undefined);
  await prisma.exam.update({
    where: { id: 'seed-exam2' },
    data: { programId: regProgram.id, levelId: sd5LevelId, subjectId: mtkSubjectId, category: 'UTS' },
  }).catch(() => undefined);

  // d) Try Out campuran (lintas mapel) — untuk rekap nilai per mapel (PDF1)
  // dan rekap jawaban per nomor (PDF2).
  const exam3Start = new Date(now);
  exam3Start.setDate(exam3Start.getDate() - 3);
  const exam3End = new Date(exam3Start);
  exam3End.setHours(exam3End.getHours() + 2);
  const exam3 = await prisma.exam.upsert({
    where: { id: 'seed-exam3' },
    create: {
      id: 'seed-exam3',
      title: 'Try Out Campuran SD Kelas 5',
      description: 'Simulasi lintas mapel: MTK, BIN, BIG, IPA.',
      programId: regProgram.id,
      levelId: sd5LevelId,
      subjectId: mtkSubjectId,
      category: 'TO',
      scheduledStartAt: exam3Start,
      scheduledEndAt: exam3End,
      status: 'PUBLISHED',
      maxScore: 10,
      durationMinutes: 90,
      proctoringEnabled: true,
      createdBy: seededBy,
    },
    update: {
      programId: regProgram.id,
      levelId: sd5LevelId,
      subjectId: mtkSubjectId,
      category: 'TO',
      proctoringEnabled: true,
    },
  });
  const exam3QuestionIds = seedQuestionDefs.map((q) => q.id);
  for (const [i, qid] of exam3QuestionIds.entries()) {
    const qMeta = seedQuestions.get(qid);
    await prisma.examItem.upsert({
      where: { examId_questionId: { examId: exam3.id, questionId: qid } },
      create: { examId: exam3.id, questionId: qid, sortOrder: i, points: qMeta?.points ?? 1 },
      update: { sortOrder: i },
    });
  }

  // Attempt exam3 untuk 5 siswa — jawaban deterministik campur benar/salah
  // supaya rekap jawaban & rekap nilai punya variasi.
  for (const [si, student] of studentProfiles.entries()) {
    const attempt = await prisma.examAttempt.upsert({
      where: { id: `seed-attempt3-${student.id}` },
      create: {
        id: `seed-attempt3-${student.id}`,
        examId: exam3.id,
        studentId: student.id,
        status: 'SUBMITTED',
        score: 0,
        maxScore: exam3.maxScore,
        startedAt: exam3Start,
        submittedAt: exam3End,
      },
      update: {},
    });
    let score = 0;
    for (const [qi, qid] of exam3QuestionIds.entries()) {
      const qMeta = seedQuestions.get(qid);
      if (!qMeta) continue;
      // Siswa 0 selalu benar; siswa lain salah bila (si+qi) mod 3 === 0.
      const correct = si === 0 || (si + qi) % 3 !== 0;
      const correctOpt = qMeta.correctOptionIds[0];
      let wrongOpt: string | null = null;
      if (!correct) {
        const wrong = await prisma.questionOption.findFirst({
          where: { questionId: qid, isCorrect: false },
          orderBy: { sortOrder: 'asc' },
          select: { id: true },
        });
        wrongOpt = wrong?.id ?? null;
      }
      const sel = correct ? correctOpt : wrongOpt;
      if (!sel) continue;
      const earned = correct ? qMeta.points : 0;
      score += earned;
      await prisma.examAnswer.upsert({
        where: { attemptId_questionId: { attemptId: attempt.id, questionId: qid } },
        create: {
          attemptId: attempt.id,
          questionId: qid,
          selectedOptionIds: [sel],
          isCorrect: correct,
          score: earned,
        },
        update: {},
      });
    }
    await prisma.examAttempt.update({ where: { id: attempt.id }, data: { score } });
  }

  // e) Paket latsol MTK Bab 1 + attempt (1 selesai, 1 sedang berjalan —
  // mendemokan fitur simpan-lanjutkan).
  const latsol1 = await prisma.latsolPackage.upsert({
    where: { id: 'seed-latsol1' },
    create: {
      id: 'seed-latsol1',
      title: 'Latsol Matematika — Bab 1 (SD Kelas 5)',
      description: 'Latihan pecahan: penjumlahan, desimal, dan kawan-kawannya.',
      programId: regProgram.id,
      levelId: sd5LevelId,
      subjectId: mtkSubjectId,
      category: 'BAB-1',
      createdBy: seededBy,
    },
    update: { programId: regProgram.id, levelId: sd5LevelId, subjectId: mtkSubjectId, category: 'BAB-1' },
  });
  const latsolQuestionIds = ['seed-qm-b1-1', 'seed-qm-b1-2', 'seed-qm-b2-1', 'seed-qm-b2-2'];
  for (const [i, qid] of latsolQuestionIds.entries()) {
    await prisma.latsolPackageItem.upsert({
      where: { packageId_questionId: { packageId: latsol1.id, questionId: qid } },
      create: { packageId: latsol1.id, questionId: qid, sortOrder: i },
      update: { sortOrder: i },
    });
  }
  // Attempt selesai (siswa 0) — jawaban semua benar.
  if (studentProfiles[0]) {
    const att = await prisma.latsolAttempt.upsert({
      where: { id: `seed-latsol-att-${studentProfiles[0].id}` },
      create: {
        id: `seed-latsol-att-${studentProfiles[0].id}`,
        packageId: latsol1.id,
        studentId: studentProfiles[0].id,
        status: 'SUBMITTED',
        score: 4,
        maxScore: 4,
        submittedAt: new Date(now.getTime() - 2 * 86400000),
      },
      update: {},
    });
    for (const qid of latsolQuestionIds) {
      const qMeta = seedQuestions.get(qid);
      if (!qMeta?.correctOptionIds[0]) continue;
      await prisma.latsolAnswer.upsert({
        where: { attemptId_questionId: { attemptId: att.id, questionId: qid } },
        create: {
          attemptId: att.id,
          questionId: qid,
          selectedOptionIds: [qMeta.correctOptionIds[0]],
          isCorrect: true,
          score: 1,
        },
        update: {},
      });
    }
  }
  // Attempt berjalan (siswa 1) — baru 2 soal terjawab (1 benar, 1 salah).
  if (studentProfiles[1]) {
    const att = await prisma.latsolAttempt.upsert({
      where: { id: `seed-latsol-att-${studentProfiles[1].id}` },
      create: {
        id: `seed-latsol-att-${studentProfiles[1].id}`,
        packageId: latsol1.id,
        studentId: studentProfiles[1].id,
        status: 'IN_PROGRESS',
        score: 1,
        maxScore: 4,
      },
      update: {},
    });
    const partial = latsolQuestionIds.slice(0, 2);
    for (const [i, qid] of partial.entries()) {
      const qMeta = seedQuestions.get(qid);
      if (!qMeta) continue;
      const correct = i === 0;
      const sel = correct
        ? qMeta.correctOptionIds[0]
        : (await prisma.questionOption.findFirst({
            where: { questionId: qid, isCorrect: false },
            orderBy: { sortOrder: 'asc' },
            select: { id: true },
          }))?.id;
      if (!sel) continue;
      await prisma.latsolAnswer.upsert({
        where: { attemptId_questionId: { attemptId: att.id, questionId: qid } },
        create: {
          attemptId: att.id,
          questionId: qid,
          selectedOptionIds: [sel],
          isCorrect: correct,
          score: correct ? 1 : 0,
        },
        update: {},
      });
    }
  }

  // f) Materi pembelajaran SD5 — satu tertaut ke latsol & try out di atas.
  const materialSeeds = [
    {
      id: 'seed-mat-1',
      title: 'Ringkasan Bab 1 — Pecahan',
      subject: 'MTK',
      category: 'BAB-1',
      content: 'Pecahan adalah bagian dari keseluruhan. Materi mencakup pecahan senilai, penjumlahan pecahan, dan bentuk desimal.',
      latsolPackageId: latsol1.id,
      examId: exam3.id,
    },
    {
      id: 'seed-mat-2',
      title: 'Bangun Datar — Luas & Keliling',
      subject: 'MTK',
      category: 'BAB-2',
      content: 'Rumus luas dan keliling persegi, persegi panjang, dan segitiga beserta contoh soal.',
      latsolPackageId: null,
      examId: null,
    },
    {
      id: 'seed-mat-3',
      title: 'Tata Bahasa Dasar — Simple Present',
      subject: 'BIG',
      category: 'BAB-1',
      content: 'Pola kalimat Simple Present Tense: S + V1 (s/es untuk he/she/it). Contoh: She goes to school.',
      latsolPackageId: null,
      examId: null,
    },
  ];
  for (const m of materialSeeds) {
    await prisma.material.upsert({
      where: { id: m.id },
      create: {
        id: m.id,
        title: m.title,
        content: m.content,
        programId: regProgram.id,
        levelId: sd5LevelId,
        subjectId: subjects.get(m.subject),
        category: m.category,
        latsolPackageId: m.latsolPackageId,
        examId: m.examId,
      },
      update: {
        programId: regProgram.id,
        levelId: sd5LevelId,
        subjectId: subjects.get(m.subject),
        category: m.category,
        latsolPackageId: m.latsolPackageId,
        examId: m.examId,
      },
    });
  }

  // g) Sesi lampau + absensi — untuk laporan kehadiran, performa bulanan,
  // dan rekap WA. 8 sesi dalam 4 minggu terakhir (Senin & Rabu sore).
  const pastSubjects = ['MTK', 'BIN', 'IPA', 'BIG'];
  const pastSessions: Array<{ weekBack: number; dow: number; subjectIdx: number; tutorIdx: number }> = [
    { weekBack: 4, dow: 1, subjectIdx: 0, tutorIdx: 0 },
    { weekBack: 4, dow: 3, subjectIdx: 1, tutorIdx: 1 },
    { weekBack: 3, dow: 1, subjectIdx: 2, tutorIdx: 1 },
    { weekBack: 3, dow: 3, subjectIdx: 3, tutorIdx: 0 },
    { weekBack: 2, dow: 1, subjectIdx: 0, tutorIdx: 0 },
    { weekBack: 2, dow: 3, subjectIdx: 1, tutorIdx: 1 },
    { weekBack: 1, dow: 1, subjectIdx: 2, tutorIdx: 1 },
    { weekBack: 1, dow: 3, subjectIdx: 3, tutorIdx: 0 },
  ];
  const attPattern: Array<'HADIR' | 'TERLAMBAT' | 'IZIN' | 'SAKIT' | 'ALFA'> = [
    'HADIR', 'HADIR', 'HADIR', 'TERLAMBAT', 'HADIR', 'IZIN', 'HADIR', 'SAKIT',
  ];
  for (const [si2, ps] of pastSessions.entries()) {
    const refMonday = nextWeekday(new Date(now.getTime() - ps.weekBack * 7 * 86400000), 1);
    const startsAt = new Date(refMonday);
    startsAt.setDate(startsAt.getDate() + (ps.dow - 1));
    startsAt.setHours(16, 0, 0, 0);
    const endsAt = new Date(startsAt);
    endsAt.setMinutes(endsAt.getMinutes() + 90);
    let session = await prisma.session.findFirst({
      where: { groupId: demoGroup.id, startsAt },
    });
    if (!session) {
      session = await prisma.session.create({
        data: {
          groupId: demoGroup.id,
          tutorId: tutorProfiles[ps.tutorIdx]?.id,
          roomId: roomA.id,
          subjectId: subjects.get(pastSubjects[ps.subjectIdx]),
          startsAt,
          endsAt,
          status: 'COMPLETED',
        },
      });
    } else if (session.status !== 'COMPLETED') {
      session = await prisma.session.update({
        where: { id: session.id },
        data: { status: 'COMPLETED' },
      });
    }
    for (const [mi, student] of studentProfiles.entries()) {
      await prisma.attendance.upsert({
        where: { sessionId_studentId: { sessionId: session.id, studentId: student.id } },
        create: {
          sessionId: session.id,
          studentId: student.id,
          status: attPattern[(si2 + mi) % attPattern.length],
          markedBy: tutorProfiles[ps.tutorIdx]?.id,
        },
        update: {},
      });
    }
  }

  // h) Feedback mingguan — minggu ini & minggu lalu, diisi ortu & siswa.
  const ortuUser = await prisma.user.findFirst({ where: { email: 'ortu1@bimbel.test' } });
  const mondayThisWeek = nextWeekday(now, 1);
  const mondayLastWeek = new Date(mondayThisWeek.getTime() - 7 * 86400000);
  const feedbackSeeds: Array<{
    studentIdx: number;
    subjectCode: string;
    weekStart: Date;
    content: string;
    authorUserId?: string;
    authorRole: 'SISWA' | 'ORANG_TUA';
  }> = [
    { studentIdx: 0, subjectCode: 'MTK', weekStart: mondayThisWeek, content: 'Anak sudah mulai paham pecahan senilai, tapi masih lambat saat soal cerita. Mohon latihan tambahan.', authorUserId: ortuUser?.id, authorRole: 'ORANG_TUA' },
    { studentIdx: 0, subjectCode: 'BIN', weekStart: mondayThisWeek, content: 'Sudah rajin membaca 15 menit tiap malam.', authorUserId: ortuUser?.id, authorRole: 'ORANG_TUA' },
    { studentIdx: 1, subjectCode: 'MTK', weekStart: mondayThisWeek, content: 'Minggu ini saya bisa menyelesaikan soal luas bangun datar sendiri.', authorRole: 'SISWA' },
    { studentIdx: 0, subjectCode: 'MTK', weekStart: mondayLastWeek, content: 'Anak masih bingung membedakan pecahan biasa dan campuran.', authorUserId: ortuUser?.id, authorRole: 'ORANG_TUA' },
    { studentIdx: 2, subjectCode: 'IPA', weekStart: mondayLastWeek, content: 'Percobaan fotosintesis di kelas sangat menarik!', authorRole: 'SISWA' },
  ];
  for (const f of feedbackSeeds) {
    const student = studentProfiles[f.studentIdx];
    const subjectId = subjects.get(f.subjectCode);
    const studentUser = student
      ? await prisma.student.findUnique({
          where: { id: student.id },
          select: { userId: true },
        })
      : null;
    const authorUserId = f.authorUserId ?? studentUser?.userId;
    if (!student || !subjectId || !authorUserId) continue;
    await prisma.feedbackEntry.upsert({
      where: {
        groupId_studentId_subjectId_weekStart: {
          groupId: demoGroup.id,
          studentId: student.id,
          subjectId,
          weekStart: f.weekStart,
        },
      },
      create: {
        groupId: demoGroup.id,
        studentId: student.id,
        subjectId,
        weekStart: f.weekStart,
        content: f.content,
        authorUserId,
        authorRole: f.authorRole,
        parentId: f.authorRole === 'ORANG_TUA' ? seedParent?.id : null,
      },
      update: {},
    });
  }

  // i) Asal sekolah siswa demo — mengisi kolom "Asal Sekolah" di rekap cetak.
  const schoolByIdx = ['SDN 1 Merdeka', 'SDN 2 Pahlawan', 'SDIT Al-Ikhlas', 'SDN 5 Melati', 'SD Kristen Bina'];
  for (const [i, student] of studentProfiles.entries()) {
    await prisma.student.update({
      where: { id: student.id },
      data: { schoolOrigin: schoolByIdx[i] ?? 'SDN 1 Merdeka' },
    }).catch(() => undefined);
  }

  // Fase 4b: Create default score rules
  console.log('Creating score rules...');
  await prisma.scoreRule.upsert({
    where: { name: 'Exam Basic Points' },
    create: {
      name: 'Exam Basic Points',
      description: 'Basic points per score achieved in exams',
      entityType: 'EXAM',
      pointsPerUnit: 1, // 1 point per score
      bonusThreshold: 80, // Bonus if score >= 80%
      bonusPoints: 10, // 10 bonus points
      isActive: true,
      validFrom: now,
    },
    update: {},
  });

  await prisma.scoreRule.upsert({
    where: { name: 'Latsol Basic Points' },
    create: {
      name: 'Latsol Basic Points',
      description: 'Basic points per score achieved in latsol',
      entityType: 'LATSOL',
      pointsPerUnit: 1, // 1 point per score
      bonusThreshold: 80, // Bonus if score >= 80%
      bonusPoints: 5, // 5 bonus points
      isActive: true,
      validFrom: now,
    },
    update: {},
  });
  console.log('Score rules created successfully');

  // Fase 3a-3e: Seed data untuk analytics (DoD Fase 4a)
  // Buat soal contoh, paket latsol, ujian, dan attempt dengan jawaban
  const adminUser = await prisma.user.findFirst({ where: { email: 'adminacademic1@bimbel.test' } });

  // Buat 3 soal contoh dengan berbagai difficulty
  const question1 = await prisma.question.upsert({
    where: { id: 'seed-q1' },
    create: {
      id: 'seed-q1',
      programId: regProgram.id,
      levelId: sd5LevelId,
      type: 'SINGLE_CHOICE',
      content: 'Berapakah hasil dari 2 + 2?',
      difficulty: 'EASY',
      points: 1,
      createdBy: adminUser?.id || 'seed',
    },
    update: {
      subjectId: subjects.get('MTK'),
      category: 'BAB-1',
      levelId: sd5LevelId,
    },
  });

  const q1Options = await ensureQuestionOptions(question1.id, 'seed-q1', [
    { content: '3', isCorrect: false },
    { content: '4', isCorrect: true },
    { content: '5', isCorrect: false },
  ]);
  const [q1OptionA, q1OptionB, q1OptionC] = pickOptions(q1Options);

  const question2 = await prisma.question.upsert({
    where: { id: 'seed-q2' },
    create: {
      id: 'seed-q2',
      programId: regProgram.id,
      levelId: sd5LevelId,
      type: 'SINGLE_CHOICE',
      content: 'Berapakah hasil dari 5 × 6?',
      difficulty: 'MEDIUM',
      points: 2,
      createdBy: adminUser?.id || 'seed',
    },
    update: {
      subjectId: subjects.get('MTK'),
      category: 'BAB-1',
      levelId: sd5LevelId,
    },
  });

  const q2Options = await ensureQuestionOptions(question2.id, 'seed-q2', [
    { content: '28', isCorrect: false },
    { content: '30', isCorrect: true },
    { content: '32', isCorrect: false },
  ]);
  const [q2OptionA, q2OptionB, q2OptionC] = pickOptions(q2Options);

  const question3 = await prisma.question.upsert({
    where: { id: 'seed-q3' },
    create: {
      id: 'seed-q3',
      programId: regProgram.id,
      levelId: sd5LevelId,
      type: 'SINGLE_CHOICE',
      content: 'Berapakah akar kuadrat dari 144?',
      difficulty: 'HARD',
      points: 3,
      createdBy: adminUser?.id || 'seed',
    },
    update: {
      subjectId: subjects.get('MTK'),
      category: 'BAB-1',
      levelId: sd5LevelId,
    },
  });

  const q3Options = await ensureQuestionOptions(question3.id, 'seed-q3', [
    { content: '10', isCorrect: false },
    { content: '12', isCorrect: true },
    { content: '14', isCorrect: false },
  ]);
  const [q3OptionA, q3OptionB, q3OptionC] = pickOptions(q3Options);

  // Buat 2 ujian berbeda untuk tren nilai
  const exam1Start = new Date(now);
  exam1Start.setDate(exam1Start.getDate() - 10);
  const exam1End = new Date(exam1Start);
  exam1End.setHours(exam1End.getHours() + 2);

  const exam1 = await prisma.exam.upsert({
    where: { id: 'seed-exam1' },
    create: {
      id: 'seed-exam1',
      title: 'Ujian Matematika Dasar',
      description: 'Ujian latihan dasar',
      scheduledStartAt: exam1Start,
      scheduledEndAt: exam1End,
      status: 'PUBLISHED',
      maxScore: 6,
      durationMinutes: 120,
      createdBy: adminUser?.id || 'seed',
    },
    update: {},
  });

  // Tambahkan soal ke ujian 1
  await prisma.examItem.upsert({
    where: { examId_questionId: { examId: exam1.id, questionId: question1.id } },
    create: { examId: exam1.id, questionId: question1.id, sortOrder: 0, points: 1 },
    update: {},
  });
  await prisma.examItem.upsert({
    where: { examId_questionId: { examId: exam1.id, questionId: question2.id } },
    create: { examId: exam1.id, questionId: question2.id, sortOrder: 1, points: 2 },
    update: {},
  });
  await prisma.examItem.upsert({
    where: { examId_questionId: { examId: exam1.id, questionId: question3.id } },
    create: { examId: exam1.id, questionId: question3.id, sortOrder: 2, points: 3 },
    update: {},
  });

  const exam2Start = new Date(now);
  exam2Start.setDate(exam2Start.getDate() - 5);
  const exam2End = new Date(exam2Start);
  exam2End.setHours(exam2End.getHours() + 2);

  const exam2 = await prisma.exam.upsert({
    where: { id: 'seed-exam2' },
    create: {
      id: 'seed-exam2',
      title: 'Ujian Matematika Lanjutan',
      description: 'Ujian latihan lanjutan',
      scheduledStartAt: exam2Start,
      scheduledEndAt: exam2End,
      status: 'PUBLISHED',
      maxScore: 6,
      durationMinutes: 120,
      createdBy: adminUser?.id || 'seed',
    },
    update: {},
  });

  // Tambahkan soal ke ujian 2 (soal yang sama untuk demo)
  await prisma.examItem.upsert({
    where: { examId_questionId: { examId: exam2.id, questionId: question1.id } },
    create: { examId: exam2.id, questionId: question1.id, sortOrder: 0, points: 1 },
    update: {},
  });
  await prisma.examItem.upsert({
    where: { examId_questionId: { examId: exam2.id, questionId: question2.id } },
    create: { examId: exam2.id, questionId: question2.id, sortOrder: 1, points: 2 },
    update: {},
  });
  await prisma.examItem.upsert({
    where: { examId_questionId: { examId: exam2.id, questionId: question3.id } },
    create: { examId: exam2.id, questionId: question3.id, sortOrder: 2, points: 3 },
    update: {},
  });

  // Buat attempt untuk 3 siswa pertama (untuk DoD: ≥3 attempts per question)
  for (let i = 0; i < 3; i++) {
    const student = studentProfiles[i];
    if (!student) continue;

    // Attempt ujian 1
    const attempt1 = await prisma.examAttempt.upsert({
      where: { id: `seed-attempt1-${student.id}` },
      create: {
        id: `seed-attempt1-${student.id}`,
        examId: exam1.id,
        studentId: student.id,
        status: 'SUBMITTED',
        score: i === 0 ? 6 : i === 1 ? 4 : 2, // Berbeda-beda untuk demo
        maxScore: 6,
        startedAt: exam1Start,
        submittedAt: exam1End,
      },
      update: {},
    });

    // Jawaban untuk attempt 1
    await prisma.examAnswer.upsert({
      where: { attemptId_questionId: { attemptId: attempt1.id, questionId: question1.id } },
      create: {
        attemptId: attempt1.id,
        questionId: question1.id,
        selectedOptionIds: [q1OptionB.id], // Jawaban benar
        isCorrect: true,
        score: 1,
      },
      update: {},
    });

    await prisma.examAnswer.upsert({
      where: { attemptId_questionId: { attemptId: attempt1.id, questionId: question2.id } },
      create: {
        attemptId: attempt1.id,
        questionId: question2.id,
        selectedOptionIds: i === 0 ? [q2OptionB.id] : [q2OptionA.id], // Mix benar/salah
        isCorrect: i === 0,
        score: i === 0 ? 2 : 0,
      },
      update: {},
    });

    await prisma.examAnswer.upsert({
      where: { attemptId_questionId: { attemptId: attempt1.id, questionId: question3.id } },
      create: {
        attemptId: attempt1.id,
        questionId: question3.id,
        selectedOptionIds: i === 0 ? [q3OptionB.id] : [q3OptionA.id], // Mix benar/salah
        isCorrect: i === 0,
        score: i === 0 ? 3 : 0,
      },
      update: {},
    });

    // Attempt ujian 2
    const attempt2 = await prisma.examAttempt.upsert({
      where: { id: `seed-attempt2-${student.id}` },
      create: {
        id: `seed-attempt2-${student.id}`,
        examId: exam2.id,
        studentId: student.id,
        status: 'SUBMITTED',
        score: i === 0 ? 5 : i === 1 ? 3 : 1, // Berbeda-beda untuk demo tren
        maxScore: 6,
        startedAt: exam2Start,
        submittedAt: exam2End,
      },
      update: {},
    });

    // Jawaban untuk attempt 2
    await prisma.examAnswer.upsert({
      where: { attemptId_questionId: { attemptId: attempt2.id, questionId: question1.id } },
      create: {
        attemptId: attempt2.id,
        questionId: question1.id,
        selectedOptionIds: [q1OptionB.id], // Jawaban benar
        isCorrect: true,
        score: 1,
      },
      update: {},
    });

    await prisma.examAnswer.upsert({
      where: { attemptId_questionId: { attemptId: attempt2.id, questionId: question2.id } },
      create: {
        attemptId: attempt2.id,
        questionId: question2.id,
        selectedOptionIds: i === 0 ? [q2OptionB.id] : [q2OptionC.id], // Mix benar/salah
        isCorrect: i === 0,
        score: i === 0 ? 2 : 0,
      },
      update: {},
    });

    await prisma.examAnswer.upsert({
      where: { attemptId_questionId: { attemptId: attempt2.id, questionId: question3.id } },
      create: {
        attemptId: attempt2.id,
        questionId: question3.id,
        selectedOptionIds: i === 0 ? [q3OptionB.id] : [q3OptionC.id], // Mix benar/salah
        isCorrect: i === 0,
        score: i === 0 ? 3 : 0,
      },
      update: {},
    });
  }

  console.log('Creating point transactions for existing exam attempts...');
  const examAttempts = await prisma.examAttempt.findMany({
    where: { status: 'SUBMITTED' },
    include: { exam: true, student: true, answers: { include: { question: { select: { type: true } } } } },
  });

  console.log(`Found ${examAttempts.length} submitted exam attempts`);

  // Backfill dihitung dari score_rules di DB (data-driven — sama seperti
  // runtime PointTransactionsService), bukan formula hardcode.
  const activeRules = await prisma.scoreRule.findMany({
    where: {
      isActive: true,
      validFrom: { lte: now },
      OR: [{ validTo: null }, { validTo: { gte: now } }],
    },
  });
  const examRules = activeRules.filter((r) => r.entityType === 'EXAM');
  const questionTypeRules = activeRules.filter((r) => r.entityType === 'QUESTION_TYPE');

  for (const attempt of examAttempts) {
    // Check if transaction already exists for this attempt
    const existing = await prisma.pointTransaction.findFirst({
      where: {
        referenceId: attempt.id,
        referenceType: 'EXAM_ATTEMPT',
      },
    });

    if (existing) continue; // Skip if already exists

    const percentage = attempt.maxScore > 0 ? (attempt.score / attempt.maxScore) * 100 : 0;
    const pointPeriod = attempt.submittedAt
      ? `${attempt.submittedAt.getFullYear()}-${String(attempt.submittedAt.getMonth() + 1).padStart(2, '0')}`
      : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Satu transaksi per rule yang berlaku (umum entityValue=null + khusus exam ini)
    const applicable = [
      ...examRules.filter((r) => !r.entityValue || r.entityValue === attempt.examId),
      ...questionTypeRules,
    ];
    for (const rule of applicable) {
      let points = 0;
      const details: string[] = [];
      if (rule.entityType === 'QUESTION_TYPE') {
        const correctCount = attempt.answers.filter(
          (a) => a.isCorrect && (!rule.entityValue || a.question.type === rule.entityValue),
        ).length;
        points = correctCount * rule.pointsPerUnit;
        details.push(`${correctCount} jawaban benar ${rule.entityValue ?? '(semua tipe)'} × ${rule.pointsPerUnit}`);
      } else {
        if (rule.pointsPerUnit) {
          points += attempt.score * rule.pointsPerUnit;
          details.push(`Base: ${attempt.score} × ${rule.pointsPerUnit}`);
        }
        if (rule.bonusThreshold != null && rule.bonusPoints && percentage >= rule.bonusThreshold) {
          points += rule.bonusPoints;
          details.push(`Bonus: ${percentage.toFixed(1)}% ≥ ${rule.bonusThreshold}%`);
        }
      }
      if (!points) continue;
      await prisma.pointTransaction.create({
        data: {
          studentId: attempt.studentId,
          scoreRuleId: rule.id,
          eventType: 'EXAM_COMPLETED',
          points,
          referenceId: attempt.id,
          referenceType: 'EXAM_ATTEMPT',
          description: `${attempt.exam.title} — ${rule.name}: ${details.join('; ')}`,
          period: pointPeriod,
        },
      });
      console.log(`Created point transaction for attempt ${attempt.id}, rule ${rule.name}, points ${points}`);
    }
  }

  console.log('Point transactions created successfully');
  console.log(
    'Seed selesai: 6 role, permission dasar, 6 akun contoh, score rules, dan point transactions dibuat.',
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

/** Hari `weekday` (0=Minggu..6=Sabtu) berikutnya, termasuk hari ini bila cocok. */
function nextWeekday(from: Date, weekday: number): Date {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const delta = (weekday - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + delta);
  return d;
}
