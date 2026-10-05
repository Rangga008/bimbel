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

  /** Siswa: jadwal terdekat + ringkasan kehadiran sendiri. */
  async siswaHome(userId: string) {
    const student = await this.prisma.student.findUnique({ where: { userId }, include: { user: { select: { name: true } } } });
    if (!student) return { role: 'SISWA', empty: true };
    const memberships = await this.prisma.groupMember.findMany({ where: { studentId: student.id }, select: { groupId: true } });
    const groupIds = memberships.map((m) => m.groupId);
    const { start } = this.weekRange();
    const [upcoming, attendances, groups] = await Promise.all([
      this.prisma.session.findMany({
        where: { groupId: { in: groupIds.length ? groupIds : ['__none__'] }, startsAt: { gte: start }, status: { not: 'CANCELLED' } },
        select: SESSION_BRIEF, orderBy: { startsAt: 'asc' }, take: 5,
      }),
      this.prisma.attendance.findMany({ where: { studentId: student.id }, select: { status: true } }),
      this.prisma.groupMember.findMany({ where: { studentId: student.id }, select: { group: { select: { id: true, name: true } } }, take: 10 }),
    ]);
    const hadir = attendances.filter((a) => a.status === 'HADIR' || a.status === 'TERLAMBAT').length;
    return { role: 'SISWA', user: student.user.name, groups: groups.map((g) => g.group), upcomingSessions: upcoming, attendanceSummary: { total: attendances.length, hadir } };
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
    const [upcoming, weekAttendance, dueInvoices] = await Promise.all([
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
    ]);
    const hadir = weekAttendance.filter((a) => a.status === 'HADIR' || a.status === 'TERLAMBAT').length;
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
      dueInvoices: outstanding,
    };
  }

  /** Tutor: sesi hari ini + kelompok diampu + absensi belum diisi. */
  async tutorHome(userId: string) {
    const tutor = await this.prisma.tutor.findUnique({ where: { userId }, include: { user: { select: { name: true } } } });
    if (!tutor) return { role: 'TUTOR', empty: true };
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
    const [todaySessions, groups, pendingAttendance] = await Promise.all([
      this.prisma.session.findMany({ where: { tutorId: tutor.id, startsAt: { gte: dayStart, lte: dayEnd }, status: { not: 'CANCELLED' } }, select: SESSION_BRIEF, orderBy: { startsAt: 'asc' } }),
      this.prisma.learningGroup.findMany({ where: { tutors: { some: { tutorId: tutor.id } } }, select: { id: true, name: true, _count: { select: { members: true } } }, take: 20 }),
      this.prisma.session.findMany({ where: { tutorId: tutor.id, status: 'SCHEDULED', startsAt: { lt: new Date() }, attendances: { none: {} } }, select: { id: true, startsAt: true, group: { select: { id: true, name: true } } }, orderBy: { startsAt: 'desc' }, take: 5 }),
    ]);
    return { role: 'TUTOR', user: tutor.user.name, todaySessions, groups, pendingAttendance };
  }

  /** Admin finance: invoice + outstanding + kas/bank + RAB ringkas,
   *  plus info akademik (program, sesi terdekat, absensi 7 hari, paket). */
  async adminFinanceHome(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const weekAhead = new Date(dayStart); weekAhead.setDate(weekAhead.getDate() + 7);
    const weekAgo = new Date(dayStart); weekAgo.setDate(weekAgo.getDate() - 7);
    const [students, parents, tutors, groups, programs, upcomingSessions, weekAttendance, packageUsage] = await Promise.all([
      this.prisma.student.count({ where: { isActive: true } }),
      this.prisma.parent.count({ where: { isActive: true } }),
      this.prisma.tutor.count({ where: { isActive: true } }),
      this.prisma.learningGroup.count({ where: { isActive: true } }),
      this.prisma.program.count({ where: { isActive: true } }),
      this.prisma.session.findMany({ where: { startsAt: { gte: dayStart, lte: weekAhead }, status: { not: 'CANCELLED' } }, select: SESSION_BRIEF, orderBy: { startsAt: 'asc' }, take: 8 }),
      this.prisma.attendance.groupBy({ by: ['status'], where: { session: { startsAt: { gte: weekAgo } } }, _count: { status: true } }),
      this.packageUsage(),
    ]);
    const issued = await this.prisma.invoice.findMany({
      where: { status: 'ISSUED' },
      select: { totalAmount: true, amountPaid: true, dueDate: true },
      take: 1000,
    });
    let outstandingTotal = 0;
    let overdueCount = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (const inv of issued) {
      const outstanding = Math.max(0, Math.round((Number(inv.totalAmount) - Number(inv.amountPaid)) * 100) / 100);
      if (outstanding > 0.009) {
        outstandingTotal = Math.round((outstandingTotal + outstanding) * 100) / 100;
        if (inv.dueDate && new Date(inv.dueDate) < today) overdueCount += 1;
      }
    }
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
    return {
      role: 'ADMIN_FINANCE',
      user: user?.name,
      counts: { students, parents, tutors, activeGroups: groups, programs },
      upcomingSessions,
      weekAttendance: attendanceByStatus,
      packageUsage,
      finance: {
        period,
        issuedCount: issued.length,
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
    const [groups, tutors, students, programs, upcomingSessions, weekAttendance, pendingAttendance, packageUsage] = await Promise.all([
      this.prisma.learningGroup.count({ where: { isActive: true } }),
      this.prisma.tutor.count({ where: { isActive: true } }),
      this.prisma.student.count({ where: { isActive: true } }),
      this.prisma.program.count({ where: { isActive: true } }),
      this.prisma.session.findMany({ where: { startsAt: { gte: dayStart, lte: weekAhead }, status: { not: 'CANCELLED' } }, select: SESSION_BRIEF, orderBy: { startsAt: 'asc' }, take: 8 }),
      this.prisma.attendance.groupBy({ by: ['status'], where: { session: { startsAt: { gte: weekAgo } } }, _count: { status: true } }),
      this.prisma.session.findMany({ where: { status: 'SCHEDULED', startsAt: { lt: new Date() }, attendances: { none: {} } }, select: { id: true, startsAt: true, group: { select: { id: true, name: true } } }, orderBy: { startsAt: 'desc' }, take: 5 }),
      this.packageUsage(),
    ]);
    const attendanceByStatus: Record<string, number> = {};
    for (const g of weekAttendance) attendanceByStatus[g.status] = g._count.status;
    return { role: 'ADMIN_ACADEMIC', user: user?.name, counts: { programs, groups, tutors, students }, upcomingSessions, weekAttendance: attendanceByStatus, pendingAttendance, packageUsage };
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
    return { ...report, role: 'OWNER', unreadNotifications: unread, finance: financeHome.finance, sessionMonth };
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

    const payments = await this.prisma.payment.findMany({
      where: { status: 'VERIFIED' },
      select: { amount: true, paidAt: true, verifiedAt: true, createdAt: true },
      take: 5000,
    });
    const revenueAt = (p: { paidAt: Date | null; verifiedAt: Date | null; createdAt: Date }) =>
      p.paidAt ?? p.verifiedAt ?? p.createdAt;

    const [students, sessions, attendances, expenses, invoices] = await Promise.all([
      this.prisma.student.findMany({ select: { createdAt: true }, take: 5000 }),
      this.prisma.session.findMany({
        where: { startsAt: { gte: lastYearStart } },
        select: { startsAt: true, status: true },
        take: 10000,
      }),
      this.prisma.attendance.findMany({
        where: { session: { startsAt: { gte: lastYearStart } } },
        select: { status: true, session: { select: { startsAt: true } } },
        take: 20000,
      }),
      this.prisma.expense.findMany({
        where: { occurredAt: { gte: lastYearStart } },
        select: { amount: true, occurredAt: true },
        take: 5000,
      }),
      this.prisma.invoice.findMany({
        where: { status: { in: ['ISSUED', 'VOID'] } },
        select: { totalAmount: true, status: true, issuedAt: true, createdAt: true },
        take: 5000,
      }),
    ]);

    const sumPayments = (from: Date, to: Date) =>
      payments.reduce((s, p) => (revenueAt(p) >= from && revenueAt(p) <= to ? s + Number(p.amount) : s), 0);
    const countNewStudents = (from: Date, to: Date) =>
      students.filter((s) => s.createdAt >= from && s.createdAt <= to).length;
    const countSessions = (from: Date, to: Date) =>
      sessions.filter((s) => s.startsAt >= from && s.startsAt <= to && s.status === 'COMPLETED').length;
    const sumExpenses = (from: Date, to: Date) =>
      expenses.reduce((s, e) => (e.occurredAt >= from && e.occurredAt <= to ? s + Number(e.amount) : s), 0);
    const sumBilled = (from: Date, to: Date) =>
      invoices.reduce(
        (s, i) =>
          i.status === 'ISSUED' && (i.issuedAt ?? i.createdAt) >= from && (i.issuedAt ?? i.createdAt) <= to
            ? s + Number(i.totalAmount)
            : s,
        0,
      );
    const attendanceRate = (from: Date, to: Date) => {
      const rows = attendances.filter((a) => a.session.startsAt >= from && a.session.startsAt <= to);
      if (rows.length === 0) return null;
      const hadir = rows.filter((a) => a.status === 'HADIR' || a.status === 'TERLAMBAT').length;
      return Math.round((hadir / rows.length) * 1000) / 10;
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
