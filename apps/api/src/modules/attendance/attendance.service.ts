// Service Fase 1d: absensi per sesi + rekap 4 dimensi.
// Absensi TIDAK memengaruhi nilai.
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationEventsService } from '../notifications/notification-events.service';
import {
  AttendanceStatusDto,
  MarkAttendanceBulkDto,
} from './dto/attendance.dto';

export const ATTENDANCE_INCLUDE = {
  student: { select: { id: true, user: { select: { id: true, name: true } } } },
  session: {
    select: {
      id: true,
      groupId: true,
      tutorId: true,
      startsAt: true,
      endsAt: true,
      status: true,
      group: { select: { id: true, name: true } },
      tutor: { select: { id: true, user: { select: { name: true } } } },
    },
  },
} as const;

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: NotificationEventsService,
  ) {}

  /** Roster: anggota kelompok + status absensi sesi (form tutor 1 sesi penuh). */
  async roster(sessionId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        group: {
          select: {
            id: true,
            name: true,
            members: {
              orderBy: { joinedAt: 'asc' },
              select: {
                student: {
                  select: { id: true, user: { select: { name: true } } },
                },
              },
            },
          },
        },
        attendances: true,
        tutorAttendances: true,
        tutor: {
          select: { id: true, user: { select: { name: true } } },
        },
      },
    });
    if (!session) throw new NotFoundException('Sesi tidak ditemukan.');
    const byStudent = new Map(session.attendances.map((a) => [a.studentId, a]));
    return {
      session: {
        id: session.id,
        groupId: session.groupId,
        tutorId: session.tutorId,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        status: session.status,
      },
      group: { id: session.group.id, name: session.group.name },
      tutor: session.tutor
        ? { id: session.tutor.id, name: session.tutor.user.name }
        : null,
      tutorAttendance: session.tutorAttendances[0] ?? null,
      members: session.group.members.map((m) => ({
        studentId: m.student.id,
        name: m.student.user.name,
        attendance: byStudent.get(m.student.id) ?? null,
      })),
    };
  }

  /** Tutor pengampu sesi ATAU admin/owner ber-permission manage boleh mengisi. */
  async assertCanMark(
    sessionId: string,
    actorId: string,
    permissions: string[],
    roles: string[] = [],
  ) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { id: true, groupId: true, tutorId: true, status: true },
    });
    if (!session) throw new NotFoundException('Sesi tidak ditemukan.');
    if (!permissions.includes('attendance.manage')) {
      throw new ForbiddenException(
        'Anda tidak memiliki akses ke halaman/aksi ini.',
      );
    }
    const tutor = await this.prisma.tutor.findUnique({
      where: { userId: actorId },
      select: { id: true },
    });
    const isAdmin =
      roles.includes('ADMIN_ACADEMIC') || roles.includes('OWNER');
    if (tutor && !isAdmin) {
      const assigned = await this.prisma.groupTutor.findUnique({
        where: {
          groupId_tutorId: { groupId: session.groupId, tutorId: tutor.id },
        },
      });
      if (!assigned && session.tutorId !== tutor.id) {
        throw new ForbiddenException('Anda tidak mengampu kelompok sesi ini.');
      }
      // Absensi hanya bisa dikumpulkan SEKALI oleh tutor — koreksi sesudahnya
      // adalah kewenangan Admin Academic (audit trail tetap utuh).
      const existing = await this.prisma.attendance.count({
        where: { sessionId },
      });
      if (existing > 0) {
        throw new ForbiddenException(
          'Absensi sesi ini sudah dikumpulkan. Koreksi hanya bisa dilakukan oleh Admin Academic.',
        );
      }
    }
    return session;
  }

  /** Bulk upsert 1 sesi penuh. Hanya anggota kelompok yang diterima. */
  async markBulk(
    sessionId: string,
    dto: MarkAttendanceBulkDto,
    markedBy: string | null,
  ) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { id: true, groupId: true, status: true, tutorId: true },
    });
    if (!session) throw new NotFoundException('Sesi tidak ditemukan.');
    if (session.status === 'CANCELLED')
      throw new BadRequestException(
        'Sesi dibatalkan — absensi tidak bisa diisi.',
      );
    const memberIds = new Set(
      (
        await this.prisma.groupMember.findMany({
          where: { groupId: session.groupId },
          select: { studentId: true },
        })
      ).map((m) => m.studentId),
    );
    const seen = new Set<string>();
    for (const item of dto.items) {
      if (seen.has(item.studentId))
        throw new BadRequestException('Ada studentId ganda di daftar absensi.');
      seen.add(item.studentId);
      if (!memberIds.has(item.studentId)) {
        throw new BadRequestException(
          'Ada siswa yang bukan anggota kelompok sesi ini.',
        );
      }
    }
    await this.prisma.$transaction(
      dto.items.map((item) =>
        this.prisma.attendance.upsert({
          where: {
            sessionId_studentId: { sessionId, studentId: item.studentId },
          },
          create: {
            sessionId,
            studentId: item.studentId,
            status: item.status as never,
            note: item.note ?? null,
            markedBy,
          },
          update: {
            status: item.status as never,
            note: item.note ?? null,
            markedBy,
          },
        }),
      ),
    );
    await this.prisma.session.updateMany({
      where: { id: sessionId, status: 'SCHEDULED' },
      data: { status: 'COMPLETED' },
    });
    // Mengisi absen siswa = tutor hadir mengajar — catat HADIR bila belum ada
    // catatan kehadiran tutor (create-only supaya tidak menimpa tanda manual
    // admin seperti IZIN/SAKIT yang mungkin diisi lebih dulu).
    if (session.tutorId) {
      await this.prisma.tutorAttendance.createMany({
        data: [
          {
            sessionId,
            tutorId: session.tutorId,
            status: 'HADIR',
            markedBy,
          },
        ],
        skipDuplicates: true,
      });
    }
    // Fase 5b: siswa ALFA -> notif ortu+siswa (attendanceAlert).
    await this.events.attendanceMarked(sessionId, dto.items);
    return this.prisma.attendance.findMany({
      where: { sessionId },
      include: ATTENDANCE_INCLUDE,
      orderBy: { student: { user: { name: 'asc' } } },
    });
  }

  /**
   * Absen kehadiran tutor per sesi (bukan absen siswa). Tutor boleh menandai
   * kehadirannya sendiri pada sesi yang dia ampu; admin ber-permission
   * attendance.manage boleh menandai sesi manapun (assertCanMark menegakkan).
   */
  async markTutorPresence(
    sessionId: string,
    status: AttendanceStatusDto,
    note: string | null | undefined,
    actor: { id: string; permissions: string[]; roles?: string[] },
  ) {
    const session = await this.assertCanMark(
      sessionId,
      actor.id,
      actor.permissions,
      actor.roles ?? [],
    );
    if (!session.tutorId) {
      throw new BadRequestException('Sesi ini belum punya tutor penanggung jawab.');
    }
    if (session.status === 'CANCELLED') {
      throw new BadRequestException('Sesi dibatalkan — absensi tidak bisa diisi.');
    }
    // Tutor hanya boleh menandai kehadirannya sendiri; admin (bukan tutor)
    // boleh menandai tutor penanggung jawab sesi manapun.
    const tutor = await this.prisma.tutor.findUnique({
      where: { userId: actor.id },
      select: { id: true },
    });
    if (tutor && tutor.id !== session.tutorId) {
      throw new ForbiddenException(
        'Anda hanya bisa menandai kehadiran sesi yang Anda ajar.',
      );
    }
    return this.prisma.tutorAttendance.upsert({
      where: {
        sessionId_tutorId: { sessionId, tutorId: session.tutorId },
      },
      create: {
        sessionId,
        tutorId: session.tutorId,
        status: status as never,
        note: note ?? null,
        markedBy: actor.id,
      },
      update: {
        status: status as never,
        note: note ?? null,
        markedBy: actor.id,
      },
      include: {
        tutor: { select: { id: true, user: { select: { name: true } } } },
        session: {
          select: {
            id: true,
            startsAt: true,
            group: { select: { id: true, name: true } },
          },
        },
      },
    });
  }

  /**
   * Rekap kehadiran tutor per rentang tanggal — dipakai admin untuk kontrol
   * dan payroll. Tutor hanya melihat miliknya sendiri.
   */
  async listTutorAttendance(
    actor: { id: string; roles: string[] },
    opts: { from?: string; to?: string; tutorId?: string },
  ) {
    let tutorId = opts.tutorId;
    if (actor.roles.includes('TUTOR')) {
      const tutor = await this.prisma.tutor.findUnique({
        where: { userId: actor.id },
        select: { id: true },
      });
      if (!tutor) return [];
      tutorId = tutor.id;
    }
    const where: Record<string, unknown> = {};
    if (tutorId) where.tutorId = tutorId;
    if (opts.from || opts.to) {
      where.session = {
        startsAt: {
          ...(opts.from ? { gte: new Date(opts.from) } : {}),
          ...(opts.to ? { lte: new Date(`${opts.to}T23:59:59.999Z`) } : {}),
        },
      };
    }
    return this.prisma.tutorAttendance.findMany({
      where,
      include: {
        tutor: { select: { id: true, user: { select: { name: true } } } },
        session: {
          select: {
            id: true,
            startsAt: true,
            endsAt: true,
            status: true,
            group: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { session: { startsAt: 'desc' } },
      take: 300,
    });
  }

  listBySession(sessionId: string) {
    return this.prisma.attendance.findMany({
      where: { sessionId },
      include: ATTENDANCE_INCLUDE,
      orderBy: { student: { user: { name: 'asc' } } },
    });
  }

  /** Koreksi 1 baris absensi (audit log dicatat di controller). */
  async correct(
    sessionId: string,
    studentId: string,
    status: string,
    note: string | null | undefined,
    markedBy: string | null,
  ) {
    const existing = await this.prisma.attendance.findUnique({
      where: { sessionId_studentId: { sessionId, studentId } },
    });
    if (!existing) throw new NotFoundException('Data absensi tidak ditemukan.');
    const updated = await this.prisma.attendance.update({
      where: { id: existing.id },
      data: {
        status: status as never,
        ...(note !== undefined ? { note } : {}),
        markedBy,
      },
      include: ATTENDANCE_INCLUDE,
    });
    return { before: existing, updated };
  }
}
