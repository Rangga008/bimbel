// Service Fase 1d: Beranda tiap role berisi DATA NYATA Fase 1.
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

const SESSION_BRIEF = {
  id: true,
  startsAt: true,
  endsAt: true,
  status: true,
  group: { select: { id: true, name: true } },
  tutor: { select: { id: true, user: { select: { name: true } } } },
  room: { select: { id: true, name: true } },
} as const;

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
];

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  private weekRange() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start, end };
  }

  /** 6 bulan terakhir — key YYYY-MM + label pendek (grafik dashboard). */
  private last6Months() {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      return {
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: MONTH_SHORT[d.getMonth()],
        year: d.getFullYear(),
        month: d.getMonth(),
      };
    });
  }

  /** Timezone lokal app — dipakai agar bucketing bulan/minggu di SQL
   *  identik dengan new Date() server (DB session-nya UTC). */
  private appTz() {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  }

  /** Kas masuk/keluar per bulan (6 bulan terakhir) dari ledger — grafik finance. */
  private async cashTrend() {
    const months = this.last6Months();
    const from = new Date(`${months[0].key}-01T00:00:00`);
    const rows = await this.prisma.$queryRaw<
      { ym: string; direction: string; total: number }[]
    >`
      SELECT to_char("occurredAt" AT TIME ZONE ${this.appTz()}, 'YYYY-MM') AS ym,
             direction,
             SUM(amount)::float AS total
      FROM ledger_entries
      WHERE "occurredAt" >= ${from}
      GROUP BY ym, direction
    `;
    const sums = new Map(rows.map((r) => [`${r.ym}:${r.direction}`, r.total]));
    return months.map((m) => ({
      label: m.label,
      in: Math.round((sums.get(`${m.key}:IN`) ?? 0) * 100) / 100,
      out: Math.round((sums.get(`${m.key}:OUT`) ?? 0) * 100) / 100,
    }));
  }

  /** Persen kehadiran (HADIR+TERLAMBAT) per minggu — 6 minggu terakhir. */
  private async attendanceTrend() {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // mulai Senin
    const from = new Date(weekStart);
    from.setDate(from.getDate() - 35); // 5 minggu sebelumnya + minggu ini
    const rows = await this.prisma.$queryRaw<
      { wk: string; status: string; n: number }[]
    >`
      -- Bucket minggu mulai MINGGU (getDay(): 0=Minggu) sesuai label JS;
      -- date_trunc('week') Postgres mulai Senin, jadi geser +1 hari.
      SELECT to_char(date_trunc('week', (s."startsAt" AT TIME ZONE ${this.appTz()}) + interval '1 day') - interval '1 day', 'YYYY-MM-DD') AS wk,
             a.status,
             COUNT(*)::int AS n
      FROM attendances a
      JOIN sessions s ON s.id = a."sessionId"
      WHERE s."startsAt" >= ${from}
      GROUP BY wk, a.status
    `;
    return Array.from({ length: 6 }, (_, i) => {
      const ws = new Date(from);
      ws.setDate(ws.getDate() + i * 7);
      const key = `${ws.getFullYear()}-${String(ws.getMonth() + 1).padStart(2, '0')}-${String(ws.getDate()).padStart(2, '0')}`;
      const wk = rows.filter((r) => r.wk === key);
      const total = wk.reduce((s, r) => s + r.n, 0);
      const ok = wk
        .filter((r) => r.status === 'HADIR' || r.status === 'TERLAMBAT')
        .reduce((s, r) => s + r.n, 0);
      return {
        label: `${ws.getDate()}/${ws.getMonth() + 1}`,
        value: total ? Math.round((ok / total) * 100) : 0,
        count: total,
      };
    });
  }

  /** Siswa: jadwal terdekat + ringkasan kehadiran sendiri. */
  async siswaHome(userId: string) {
    const student = await this.prisma.student.findUnique({ where: { userId }, include: { user: { select: { name: true } } } });
    if (!student) return { role: 'SISWA', empty: true };
    const memberships = await this.prisma.groupMember.findMany({ where: { studentId: student.id }, select: { groupId: true } });
    const groupIds = memberships.map((m) => m.groupId);
    const { start } = this.weekRange();
    const [upcoming, attendances, groups, recentAttempts, pointsAgg, latsolDone, unread] = await Promise.all([
      this.prisma.session.findMany({
        where: { groupId: { in: groupIds.length ? groupIds : ['__none__'] }, startsAt: { gte: start }, status: { not: 'CANCELLED' } },
        select: SESSION_BRIEF, orderBy: { startsAt: 'asc' }, take: 5,
      }),
      this.prisma.attendance.groupBy({
        by: ['status'],
        where: { studentId: student.id },
        _count: { status: true },
      }),
      this.prisma.groupMember.findMany({ where: { studentId: student.id }, select: { group: { select: { id: true, name: true } } }, take: 10 }),
      // 8 ujian terakhir untuk grafik tren nilai siswa.
      this.prisma.examAttempt.findMany({
        where: { studentId: student.id, status: 'SUBMITTED' },
        orderBy: { submittedAt: 'desc' },
        take: 8,
        select: {
          score: true, maxScore: true, submittedAt: true,
          exam: { select: { title: true } },
        },
      }),
      this.prisma.pointTransaction.aggregate({
        _sum: { points: true },
        where: { studentId: student.id },
      }),
      this.prisma.latsolAttempt.count({ where: { studentId: student.id, status: 'SUBMITTED' } }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
    ]);
    const totalAtt = attendances.reduce((s, a) => s + a._count.status, 0);
    const hadir = attendances
      .filter((a) => a.status === 'HADIR' || a.status === 'TERLAMBAT')
      .reduce((s, a) => s + a._count.status, 0);
    const scoreTrend = recentAttempts.reverse().map((a) => ({
      label: a.exam.title.length > 12 ? `${a.exam.title.slice(0, 12)}…` : a.exam.title,
      value: a.maxScore > 0 ? Math.round((Number(a.score) / Number(a.maxScore)) * 100) : 0,
    }));
    return {
      role: 'SISWA', user: student.user.name,
      groups: groups.map((g) => g.group), upcomingSessions: upcoming,
      attendanceSummary: { total: totalAtt, hadir },
      scoreTrend,
      points: pointsAgg._sum.points ?? 0,
      examCount: recentAttempts.length,
      latsolDone,
      unreadNotifications: unread,
    };
  }

  /** Orang tua: anak + jadwal terdekat + kehadiran minggu ini. */
  async orangTuaHome(userId: string) {
    const parent = await this.prisma.parent.findUnique({
      where: { userId },
      include: { user: { select: { name: true } }, parentStudents: { select: { student: { select: { id: true, user: { select: { name: true } } } } } } },
    });
    if (!parent) return { role: 'ORANG_TUA', empty: true };
    const studentIds = parent.parentStudents.map((p) => p.student.id);
    const memberships = await this.prisma.groupMember.findMany({
      where: { studentId: { in: studentIds.length ? studentIds : ['__none__'] } },
      select: {
        groupId: true,
        student: { select: { id: true, user: { select: { name: true } } } },
      },
    });
    const groupIds = [...new Set(memberships.map((m) => m.groupId))];
    // Nama anak per kelompok — sesi ortu multi-anak bisa ditandai milik siapa.
    const namesByGroup = new Map<string, string[]>();
    for (const m of memberships) {
      const arr = namesByGroup.get(m.groupId) ?? [];
      if (!arr.includes(m.student.user.name)) arr.push(m.student.user.name);
      namesByGroup.set(m.groupId, arr);
    }
    const { start, end } = this.weekRange();
    const [upcoming, weekAttendance, dueInvoices, childAttempts, unread] = await Promise.all([
      this.prisma.session.findMany({
        where: { groupId: { in: groupIds.length ? groupIds : ['__none__'] }, startsAt: { gte: start, lte: end }, status: { not: 'CANCELLED' } },
        select: SESSION_BRIEF, orderBy: { startsAt: 'asc' }, take: 10,
      }),
      this.prisma.attendance.findMany({
        where: { studentId: { in: studentIds.length ? studentIds : ['__none__'] }, session: { startsAt: { gte: start, lte: end } } },
        select: { status: true, studentId: true },
      }),
      // Tagihan outstanding anak — urut jatuh tempo terdekat.
      this.prisma.invoice.findMany({
        where: { studentId: { in: studentIds.length ? studentIds : ['__none__'] }, status: 'ISSUED' },
        select: {
          id: true, number: true, studentId: true, dueDate: true,
          totalAmount: true, amountPaid: true,
          student: { select: { user: { select: { name: true } } } },
          enrollmentLink: { select: { program: { select: { name: true } } } },
          enrollment: { select: { program: { select: { name: true } } } },
        },
        orderBy: { dueDate: 'asc' },
        take: 10,
      }),
      // Attempt ujian terkini semua anak — ringkasan nilai per anak.
      this.prisma.examAttempt.findMany({
        where: { studentId: { in: studentIds.length ? studentIds : ['__none__'] }, status: 'SUBMITTED' },
        orderBy: { submittedAt: 'desc' },
        take: 60,
        select: { studentId: true, score: true, maxScore: true, exam: { select: { title: true } }, submittedAt: true },
      }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
    ]);
    const hadir = weekAttendance.filter((a) => a.status === 'HADIR' || a.status === 'TERLAMBAT').length;
    // Ringkasan nilai per anak: rata-rata % + ujian terakhir.
    const childrenScores = parent.parentStudents.map((p) => {
      const rows = childAttempts.filter((a) => a.studentId === p.student.id);
      const pcts = rows.map((a) =>
        Number(a.maxScore) > 0 ? (Number(a.score) / Number(a.maxScore)) * 100 : 0,
      );
      return {
        studentId: p.student.id,
        name: p.student.user.name,
        examCount: rows.length,
        avgPct: pcts.length
          ? Math.round((pcts.reduce((s, v) => s + v, 0) / pcts.length) * 10) / 10
          : null,
        lastPct: pcts.length ? Math.round(pcts[0] * 10) / 10 : null,
        lastExam: rows[0]?.exam.title ?? null,
      };
    });
    // Performa minggu ini per anak — hadir+terlambat / total catatan.
    const childPerformance = parent.parentStudents.map((p) => {
      const rows = weekAttendance.filter((a) => a.studentId === p.student.id);
      const ok = rows.filter((a) => a.status === 'HADIR' || a.status === 'TERLAMBAT').length;
      return {
        studentId: p.student.id,
        name: p.student.user.name,
        hadir: ok,
        total: rows.length,
        pct: rows.length ? Math.round((ok / rows.length) * 100) : null,
      };
    });
    const outstanding = dueInvoices
      .map((i) => ({
        id: i.id,
        number: i.number,
        studentName: i.student.user.name,
        program: (i.enrollmentLink ?? i.enrollment)?.program?.name ?? null,
        dueDate: i.dueDate,
        sisa: Number(i.totalAmount) - Number(i.amountPaid),
      }))
      .filter((i) => i.sisa > 0.009);
    return {
      role: 'ORANG_TUA',
      user: parent.user.name,
      children: parent.parentStudents.map((p) => p.student),
      upcomingSessions: upcoming.map((s) => ({ ...s, childNames: namesByGroup.get(s.group.id) ?? [] })),
      weekAttendance: { total: weekAttendance.length, hadir },
      childPerformance,
      childrenScores,
      dueInvoices: outstanding,
      unreadNotifications: unread,
    };
  }

  /** Tutor: sesi hari ini + kelompok diampu + absensi belum diisi. */
  async tutorHome(userId: string) {
    const tutor = await this.prisma.tutor.findUnique({ where: { userId }, include: { user: { select: { name: true } } } });
    if (!tutor) return { role: 'TUTOR', empty: true };
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
    const weekAhead = new Date(dayStart); weekAhead.setDate(weekAhead.getDate() + 7);
    const [todaySessions, groups, pendingAttendance, weekSessions, upcomingWeek, unread] = await Promise.all([
      this.prisma.session.findMany({ where: { tutorId: tutor.id, startsAt: { gte: dayStart, lte: dayEnd }, status: { not: 'CANCELLED' } }, select: SESSION_BRIEF, orderBy: { startsAt: 'asc' } }),
      this.prisma.learningGroup.findMany({ where: { tutors: { some: { tutorId: tutor.id } } }, select: { id: true, name: true, _count: { select: { members: true } } }, take: 20 }),
      this.prisma.session.findMany({ where: { tutorId: tutor.id, status: 'SCHEDULED', startsAt: { lt: new Date() }, attendances: { none: {} } }, select: { id: true, startsAt: true, group: { select: { id: true, name: true } } }, orderBy: { startsAt: 'desc' }, take: 5 }),
      // Beban mengajar minggu ini per status sesi.
      this.prisma.session.groupBy({
        by: ['status'],
        where: { tutorId: tutor.id, startsAt: { gte: dayStart, lte: weekAhead }, status: { not: 'CANCELLED' } },
        _count: { status: true },
      }),
      this.prisma.session.findMany({ where: { tutorId: tutor.id, startsAt: { gt: dayEnd, lte: weekAhead }, status: { not: 'CANCELLED' } }, select: SESSION_BRIEF, orderBy: { startsAt: 'asc' }, take: 5 }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
    ]);
    const sessionWeek: Record<string, number> = {};
    let weekTotal = 0;
    for (const g of weekSessions) { sessionWeek[g.status] = g._count.status; weekTotal += g._count.status; }
    const studentsTotal = groups.reduce((s, g) => s + g._count.members, 0);
    return {
      role: 'TUTOR', user: tutor.user.name, todaySessions, groups, pendingAttendance,
      upcomingSessions: upcomingWeek,
      sessionWeek: { ...sessionWeek, TOTAL: weekTotal },
      studentsTotal,
      unreadNotifications: unread,
    };
  }

  /** Admin finance: invoice + outstanding + kas/bank + RAB ringkas,
   *  plus info akademik (program, sesi terdekat, absensi 7 hari, paket). */
  async adminFinanceHome(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const weekAhead = new Date(dayStart); weekAhead.setDate(weekAhead.getDate() + 7);
    const weekAgo = new Date(dayStart); weekAgo.setDate(weekAgo.getDate() - 7);
    const [students, parents, tutors, groups, programs, upcomingSessions, weekAttendance, packageUsage, cashTrend, invoiceStatus, unread] = await Promise.all([
      this.prisma.student.count({ where: { isActive: true } }),
      this.prisma.parent.count({ where: { isActive: true } }),
      this.prisma.tutor.count({ where: { isActive: true } }),
      this.prisma.learningGroup.count({ where: { isActive: true } }),
      this.prisma.program.count({ where: { isActive: true } }),
      this.prisma.session.findMany({ where: { startsAt: { gte: dayStart, lte: weekAhead }, status: { not: 'CANCELLED' } }, select: SESSION_BRIEF, orderBy: { startsAt: 'asc' }, take: 8 }),
      this.prisma.attendance.groupBy({ by: ['status'], where: { session: { startsAt: { gte: weekAgo } } }, _count: { status: true } }),
      this.packageUsage(),
      this.cashTrend(),
      // Status invoice: gambaran tunggakan vs lunas.
      this.prisma.invoice.groupBy({ by: ['status'], _count: { id: true } }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
    ]);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [issuedAgg] = await this.prisma.$queryRaw<
      { outstanding: number | null; overdue: number }[]
    >`
      SELECT SUM(ROUND(GREATEST("totalAmount" - "amountPaid", 0)::numeric, 2))::float AS outstanding,
             COUNT(*) FILTER (WHERE "dueDate" IS NOT NULL AND "dueDate" < ${today})::int AS overdue
      FROM invoices
      WHERE status = 'ISSUED' AND "totalAmount" - "amountPaid" > 0.009
    `;
    const outstandingTotal = Math.round((issuedAgg?.outstanding ?? 0) * 100) / 100;
    const overdueCount = issuedAgg?.overdue ?? 0;
    const pendingProofs = await this.prisma.payment.count({ where: { status: 'PENDING' } });
    const accounts = await this.prisma.financialAccount.findMany({ select: { id: true } });
    const sums = await this.prisma.ledgerEntry.groupBy({
      by: ['direction'],
      _sum: { amount: true },
    });
    let cashIn = 0;
    let cashOut = 0;
    for (const s of sums) {
      if (s.direction === 'IN') cashIn = Number(s._sum.amount ?? 0);
      if (s.direction === 'OUT') cashOut = Number(s._sum.amount ?? 0);
    }
    const p = new Date();
    const period = `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, '0')}`;
    const budgets = await this.prisma.budget.findMany({ where: { period }, select: { amount: true } });
    const monthStart = new Date(p.getFullYear(), p.getMonth(), 1, 0, 0, 0, 0);
    const monthEnd = new Date(p.getFullYear(), p.getMonth() + 1, 0, 23, 59, 59, 999);
    const monthExpenses = await this.prisma.expense.findMany({
      where: { occurredAt: { gte: monthStart, lte: monthEnd } },
      select: { amount: true },
    });
    const totalBudget = budgets.reduce((s, b) => s + Number(b.amount), 0);
    const totalExpense = monthExpenses.reduce((s, e) => s + Number(e.amount), 0);
    const attendanceByStatus: Record<string, number> = {};
    for (const g of weekAttendance) attendanceByStatus[g.status] = g._count.status;
    const invoiceByStatus: Record<string, number> = {};
    for (const g of invoiceStatus) invoiceByStatus[g.status] = g._count.id;
    return {
      role: 'ADMIN_FINANCE',
      user: user?.name,
      counts: { students, parents, tutors, activeGroups: groups, programs },
      upcomingSessions,
      weekAttendance: attendanceByStatus,
      packageUsage,
      cashTrend,
      invoiceStatus: invoiceByStatus,
      unreadNotifications: unread,
      finance: {
        period,
        issuedCount: invoiceByStatus['ISSUED'] ?? 0,
        outstandingTotal: Math.round(outstandingTotal * 100) / 100,
        overdueCount,
        pendingProofs,
        cashIn: Math.round(cashIn * 100) / 100,
        cashOut: Math.round(cashOut * 100) / 100,
        cashBalance: Math.round((cashIn - cashOut) * 100) / 100,
        accountCount: accounts.length,
        rabBudget: Math.round(totalBudget * 100) / 100,
        rabActual: Math.round(totalExpense * 100) / 100,
        rabRemaining: Math.round((totalBudget - totalExpense) * 100) / 100,
      },
    };
  }

  /** Admin academic: ringkasan akademik — program, kelompok, sesi terdekat,
   *  absensi 7 hari, absensi belum diisi, dan pemakaian paket per kelompok. */
  async adminAcademicHome(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const weekAhead = new Date(dayStart); weekAhead.setDate(weekAhead.getDate() + 7);
    const weekAgo = new Date(dayStart); weekAgo.setDate(weekAgo.getDate() - 7);
    const monthStart = new Date(dayStart.getFullYear(), dayStart.getMonth(), 1, 0, 0, 0, 0);
    const monthEnd = new Date(dayStart.getFullYear(), dayStart.getMonth() + 1, 0, 23, 59, 59, 999);
    const [groups, tutors, students, programs, upcomingSessions, weekAttendance, pendingAttendance, packageUsage, attendanceTrend, enrollmentStatus, examsMonth, unread] = await Promise.all([
      this.prisma.learningGroup.count({ where: { isActive: true } }),
      this.prisma.tutor.count({ where: { isActive: true } }),
      this.prisma.student.count({ where: { isActive: true } }),
      this.prisma.program.count({ where: { isActive: true } }),
      this.prisma.session.findMany({ where: { startsAt: { gte: dayStart, lte: weekAhead }, status: { not: 'CANCELLED' } }, select: SESSION_BRIEF, orderBy: { startsAt: 'asc' }, take: 8 }),
      this.prisma.attendance.groupBy({ by: ['status'], where: { session: { startsAt: { gte: weekAgo } } }, _count: { status: true } }),
      this.prisma.session.findMany({ where: { status: 'SCHEDULED', startsAt: { lt: new Date() }, attendances: { none: {} } }, select: { id: true, startsAt: true, group: { select: { id: true, name: true } } }, orderBy: { startsAt: 'desc' }, take: 5 }),
      this.packageUsage(),
      this.attendanceTrend(),
      // Funnel pendaftaran: pending → paid → accepted → placed.
      this.prisma.enrollment.groupBy({ by: ['status'], _count: { id: true } }),
      this.prisma.exam.count({ where: { scheduledStartAt: { gte: monthStart, lte: monthEnd } } }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
    ]);
    const attendanceByStatus: Record<string, number> = {};
    for (const g of weekAttendance) attendanceByStatus[g.status] = g._count.status;
    const enrollmentByStatus: Record<string, number> = {};
    for (const g of enrollmentStatus) enrollmentByStatus[g.status] = g._count.id;
    return {
      role: 'ADMIN_ACADEMIC', user: user?.name,
      counts: { programs, groups, tutors, students },
      upcomingSessions, weekAttendance: attendanceByStatus, pendingAttendance, packageUsage,
      attendanceTrend, enrollmentStatus: enrollmentByStatus, examsMonth,
      unreadNotifications: unread,
    };
  }

  /** Pemakaian paket per kelompok aktif: sesi terpakai vs total sesi paket. */
  private async packageUsage() {
    const groups = await this.prisma.learningGroup.findMany({
      where: { isActive: true, packageId: { not: null } },
      select: { id: true, name: true, package: { select: { name: true, totalSessions: true } } },
      take: 20,
    });
    if (groups.length === 0) return [];
    const counts = await this.prisma.session.groupBy({
      by: ['groupId'],
      where: { groupId: { in: groups.map((g) => g.id) }, status: { not: 'CANCELLED' } },
      _count: { id: true },
    });
    const usedMap = new Map(counts.map((c) => [c.groupId, c._count.id]));
    return groups
      .map((g) => ({
        groupId: g.id,
        groupName: g.name,
        packageName: g.package!.name,
        total: g.package!.totalSessions,
        used: usedMap.get(g.id) ?? 0,
      }))
      .sort((a, b) => b.used / Math.max(1, b.total) - a.used / Math.max(1, a.total))
      .slice(0, 6);
  }

  /** Owner: hanya data laporan — KPI, ringkasan keuangan, statistik sesi
   *  bulan ini, absensi 7 hari, pemakaian paket. Tanpa daftar operasional
   *  (sesi hari ini / absensi pending) yang bukan ranah owner. */
  async ownerHome(userId: string) {
    const academic = await this.adminAcademicHome(userId);
    const financeHome = await this.adminFinanceHome(userId);
    const unread = await this.prisma.notification.count({ where: { userId, isRead: false } });
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const byStatus = await this.prisma.session.groupBy({
      by: ['status'],
      where: { startsAt: { gte: monthStart, lte: monthEnd } },
      _count: { status: true },
    });
    const sessionMonth: Record<string, number> = {};
    for (const s of byStatus) sessionMonth[s.status] = s._count.status;
    const { upcomingSessions: _u, pendingAttendance: _p, ...report } = academic;
    return { ...report, role: 'OWNER', unreadNotifications: unread, finance: financeHome.finance, cashTrend: financeHome.cashTrend, invoiceStatus: financeHome.invoiceStatus, sessionMonth };
  }

  /**
   * Analisis bisnis owner: perbandingan bulan ini vs bulan lalu (MoM),
   * tahun ini vs tahun lalu (YoY), dan seri 12 bulan terakhir untuk grafik.
   * Revenue dihitung dari payment VERIFIED menurut paidAt/verifiedAt/createdAt.
   */
  async ownerAnalytics() {
    const now = new Date();
    const monthStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
    const monthEnd = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
    const thisMonth = monthStart(now);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const lastYearStart = new Date(now.getFullYear() - 1, 0, 1);
    const lastYearEnd = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);

    // Agregasi per bulan (YYYY-MM) langsung di DB — sebelumnya endpoint ini
    // menarik puluhan ribu baris ke memori per request.
    const tz = this.appTz();
    const [payments, students, sessions, attendances, expenses, invoices] = await Promise.all([
      this.prisma.$queryRaw<{ ym: string; total: number }[]>`
        SELECT to_char(COALESCE("paidAt", "verifiedAt", "createdAt") AT TIME ZONE ${tz}, 'YYYY-MM') AS ym,
               SUM(amount)::float AS total
        FROM payments WHERE status = 'VERIFIED' GROUP BY ym`,
      this.prisma.$queryRaw<{ ym: string; n: number }[]>`
        SELECT to_char("createdAt" AT TIME ZONE ${tz}, 'YYYY-MM') AS ym, COUNT(*)::int AS n
        FROM students GROUP BY ym`,
      this.prisma.$queryRaw<{ ym: string; n: number }[]>`
        SELECT to_char("startsAt" AT TIME ZONE ${tz}, 'YYYY-MM') AS ym, COUNT(*)::int AS n
        FROM sessions WHERE "startsAt" >= ${lastYearStart} AND status = 'COMPLETED' GROUP BY ym`,
      this.prisma.$queryRaw<{ ym: string; total: number; hadir: number }[]>`
        SELECT to_char(s."startsAt" AT TIME ZONE ${tz}, 'YYYY-MM') AS ym,
               COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE a.status IN ('HADIR', 'TERLAMBAT'))::int AS hadir
        FROM attendances a JOIN sessions s ON s.id = a."sessionId"
        WHERE s."startsAt" >= ${lastYearStart} GROUP BY ym`,
      this.prisma.$queryRaw<{ ym: string; total: number }[]>`
        SELECT to_char("occurredAt" AT TIME ZONE ${tz}, 'YYYY-MM') AS ym, SUM(amount)::float AS total
        FROM expenses WHERE "occurredAt" >= ${lastYearStart} GROUP BY ym`,
      this.prisma.$queryRaw<{ ym: string; total: number }[]>`
        SELECT to_char(COALESCE("issuedAt", "createdAt") AT TIME ZONE ${tz}, 'YYYY-MM') AS ym,
               SUM("totalAmount")::float AS total
        FROM invoices WHERE status = 'ISSUED' GROUP BY ym`,
    ]);

    // Semua pemanggil memakai batas bulan-penuh, jadi lookup per YM
    // ekuivalen dengan filter tanggal versi sebelumnya.
    const ymRange = (from: Date, to: Date) => {
      const keys: string[] = [];
      const cur = new Date(from.getFullYear(), from.getMonth(), 1);
      const end = new Date(to.getFullYear(), to.getMonth(), 1);
      while (cur <= end) {
        keys.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`);
        cur.setMonth(cur.getMonth() + 1);
      }
      return keys;
    };
    const monthMaps = {
      payments: new Map(payments.map((r) => [r.ym, r.total])),
      students: new Map(students.map((r) => [r.ym, r.n])),
      sessions: new Map(sessions.map((r) => [r.ym, r.n])),
      expenses: new Map(expenses.map((r) => [r.ym, r.total])),
      invoices: new Map(invoices.map((r) => [r.ym, r.total])),
    };
    const sumMap = (map: Map<string, number>, from: Date, to: Date) =>
      ymRange(from, to).reduce((s, k) => s + (map.get(k) ?? 0), 0);
    const sumPayments = sumMap.bind(null, monthMaps.payments);
    const countNewStudents = sumMap.bind(null, monthMaps.students);
    const countSessions = sumMap.bind(null, monthMaps.sessions);
    const sumExpenses = sumMap.bind(null, monthMaps.expenses);
    const sumBilled = sumMap.bind(null, monthMaps.invoices);
    const attendanceRate = (from: Date, to: Date) => {
      const keys = new Set(ymRange(from, to));
      const rows = attendances.filter((a) => keys.has(a.ym));
      const total = rows.reduce((s, r) => s + r.total, 0);
      if (total === 0) return null;
      const hadir = rows.reduce((s, r) => s + r.hadir, 0);
      return Math.round((hadir / total) * 1000) / 10;
    };

    const delta = (current: number, previous: number) =>
      previous > 0 ? Math.round(((current - previous) / previous) * 1000) / 10 : null;
    const cmp = (current: number, previous: number) => ({
      current: Math.round(current * 100) / 100,
      previous: Math.round(previous * 100) / 100,
      pct: delta(current, previous),
    });
    const cmpRate = (current: number | null, previous: number | null) => ({
      current,
      previous,
      points: current !== null && previous !== null ? Math.round((current - previous) * 10) / 10 : null,
    });

    const mEnd = monthEnd(now);
    const lEnd = monthEnd(lastMonth);
    const comparison = {
      revenue: cmp(sumPayments(thisMonth, mEnd), sumPayments(lastMonth, lEnd)),
      billed: cmp(sumBilled(thisMonth, mEnd), sumBilled(lastMonth, lEnd)),
      newStudents: cmp(countNewStudents(thisMonth, mEnd), countNewStudents(lastMonth, lEnd)),
      sessionsCompleted: cmp(countSessions(thisMonth, mEnd), countSessions(lastMonth, lEnd)),
      attendanceRate: cmpRate(attendanceRate(thisMonth, mEnd), attendanceRate(lastMonth, lEnd)),
      expenses: cmp(sumExpenses(thisMonth, mEnd), sumExpenses(lastMonth, lEnd)),
    };
    const yearEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    const yearly = {
      revenue: cmp(sumPayments(yearStart, now), sumPayments(lastYearStart, lastYearEnd)),
      newStudents: cmp(countNewStudents(yearStart, now), countNewStudents(lastYearStart, lastYearEnd)),
      sessionsCompleted: cmp(countSessions(yearStart, now), countSessions(lastYearStart, lastYearEnd)),
      attendanceRate: cmpRate(attendanceRate(yearStart, now), attendanceRate(lastYearStart, lastYearEnd)),
    };

    // Seri 12 bulan terakhir (termasuk bulan ini) untuk grafik.
    const monthly: Array<{
      month: string;
      label: string;
      revenue: number;
      expenses: number;
      newStudents: number;
      sessionsCompleted: number;
      attendanceRate: number | null;
    }> = [];
    for (let i = 11; i >= 0; i--) {
      const from = new Date(now.getFullYear(), now.getMonth() - i, 1, 0, 0, 0, 0);
      const to = monthEnd(from);
      monthly.push({
        month: `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}`,
        label: from.toLocaleDateString('id-ID', { month: 'short', year: '2-digit' }),
        revenue: Math.round(sumPayments(from, to) * 100) / 100,
        expenses: Math.round(sumExpenses(from, to) * 100) / 100,
        newStudents: countNewStudents(from, to),
        sessionsCompleted: countSessions(from, to),
        attendanceRate: attendanceRate(from, to),
      });
    }
    return { comparison, yearly, monthly };
  }
}
