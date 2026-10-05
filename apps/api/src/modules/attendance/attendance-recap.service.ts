// Rekap 4 dimensi Fase 1d (siswa/kelompok/tutor/periode) + rekap milik sendiri.
import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ATTENDANCE_INCLUDE } from './attendance.service';
import { AttendanceRecapQueryDto } from './dto/attendance.dto';

const EMPTY_COUNT = { HADIR: 0, TERLAMBAT: 0, IZIN: 0, SAKIT: 0, ALFA: 0 };

@Injectable()
export class AttendanceRecapService {
  constructor(private readonly prisma: PrismaService) {}

  /** Rekap umum: filter studentId / groupId / tutorId / periode from-to. */
  async recap(q: AttendanceRecapQueryDto) {
    const where: Record<string, unknown> = {};
    if (q.studentId) where.studentId = q.studentId;
    if (q.groupId || q.tutorId || q.from || q.to) {
      const sessionWhere: Record<string, unknown> = {};
      if (q.groupId) sessionWhere.groupId = q.groupId;
      if (q.tutorId) sessionWhere.tutorId = q.tutorId;
      if (q.from || q.to) {
        sessionWhere.startsAt = { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) };
      }
      where.session = sessionWhere;
    }
    const rows = await this.prisma.attendance.findMany({ where, include: ATTENDANCE_INCLUDE, orderBy: { session: { startsAt: 'asc' } }, take: 1000 });
    const byStatus: Record<string, number> = { ...EMPTY_COUNT };
    for (const r of rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    return { total: rows.length, byStatus, rows };
  }

  /** Rekap milik siswa login. */
  async recapMineStudent(userId: string, q: { from?: string; to?: string }) {
    const student = await this.prisma.student.findUnique({ where: { userId } });
    if (!student) throw new ForbiddenException('Akun ini tidak terhubung ke data siswa.');
    return this.recap({ studentId: student.id, ...(q.from ? { from: q.from } : {}), ...(q.to ? { to: q.to } : {}) });
  }

  /** Rekap anak-anak milik orang tua login (halaman "Kehadiran"). */
  async recapMineChildren(userId: string, q: { from?: string; to?: string; studentId?: string }) {
    const parent = await this.prisma.parent.findUnique({ where: { userId }, include: { parentStudents: { select: { studentId: true } } } });
    if (!parent) throw new ForbiddenException('Akun ini tidak terhubung ke data orang tua.');
    const allowed = parent.parentStudents.map((p) => p.studentId);
    if (q.studentId && !allowed.includes(q.studentId)) {
      throw new ForbiddenException('Anak tersebut tidak terhubung ke akun ini.');
    }
    const targets = q.studentId ? [q.studentId] : allowed;
    const where: Record<string, unknown> = { studentId: { in: targets.length ? targets : ['__none__'] } };
    if (q.from || q.to) {
      where.session = { startsAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } };
    }
    const [rows, students] = await Promise.all([
      this.prisma.attendance.findMany({ where, include: ATTENDANCE_INCLUDE, orderBy: { session: { startsAt: 'desc' } }, take: 1000 }),
      // Anak yang belum punya absensi pun tetap tampil (kalender kosong).
      this.prisma.student.findMany({
        where: { id: { in: targets } },
        select: { id: true, user: { select: { name: true } } },
      }),
    ]);
    const perStudent = new Map<string, { student: unknown; total: number; byStatus: Record<string, number>; rows: typeof rows }>();
    for (const s of students) {
      perStudent.set(s.id, { student: s, total: 0, byStatus: { ...EMPTY_COUNT }, rows: [] });
    }
    for (const r of rows) {
      let bucket = perStudent.get(r.studentId);
      if (!bucket) {
        bucket = { student: r.student, total: 0, byStatus: { ...EMPTY_COUNT }, rows: [] };
        perStudent.set(r.studentId, bucket);
      }
      bucket.total += 1;
      bucket.byStatus[r.status] = (bucket.byStatus[r.status] ?? 0) + 1;
      bucket.rows.push(r);
    }
    return { children: [...perStudent.values()] };
  }
}
