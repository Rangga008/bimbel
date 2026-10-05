// Override jadwal per-siswa + query jadwal milik sendiri per role.
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationEventsService } from '../notifications/notification-events.service';
import { ConflictService } from './conflict.service';
import { sessionListInclude } from './schedules.includes';
import {
  SessionsQueryDto,
  UpsertSessionOverrideDto,
} from './dto/schedule-session.dto';

@Injectable()
export class SessionOverridesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conflicts: ConflictService,
    private readonly events: NotificationEventsService,
  ) {}

  async upsertOverride(sessionId: string, dto: UpsertSessionOverrideDto) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new BadRequestException('Sesi tidak ditemukan.');
    const member = await this.prisma.groupMember.findUnique({
      where: {
        groupId_studentId: {
          groupId: session.groupId,
          studentId: dto.studentId,
        },
      },
    });
    if (!member)
      throw new BadRequestException(
        'Siswa tersebut bukan anggota kelompok sesi ini.',
      );
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : session.startsAt;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : session.endsAt;
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      throw new BadRequestException('Format waktu tidak valid.');
    }
    if (startsAt >= endsAt)
      throw new BadRequestException('Waktu selesai harus setelah waktu mulai.');
    if (dto.roomId) {
      const room = await this.prisma.room.findUnique({
        where: { id: dto.roomId },
      });
      if (!room) throw new BadRequestException('Ruangan tidak ditemukan.');
    }
    await this.conflicts.assertNoOverrideConflict({
      excludeSessionId: sessionId,
      studentId: dto.studentId,
      roomId: dto.roomId ?? null,
      startsAt,
      endsAt,
    });
    const override = await this.prisma.sessionStudentOverride.upsert({
      where: { sessionId_studentId: { sessionId, studentId: dto.studentId } },
      create: {
        sessionId,
        studentId: dto.studentId,
        startsAt: dto.startsAt ? startsAt : null,
        endsAt: dto.endsAt ? endsAt : null,
        roomId: dto.roomId ?? null,
        note: dto.note ?? null,
      },
      update: {
        ...(dto.startsAt !== undefined
          ? { startsAt: dto.startsAt ? startsAt : null }
          : {}),
        ...(dto.endsAt !== undefined
          ? { endsAt: dto.endsAt ? endsAt : null }
          : {}),
        ...(dto.roomId !== undefined ? { roomId: dto.roomId } : {}),
        ...(dto.note !== undefined ? { note: dto.note } : {}),
      },
      include: {
        student: { select: { id: true, user: { select: { name: true } } } },
      },
    });
    // Fase 5b: override jadwal per-siswa -> notif siswa tsb + ortunya.
    await this.events.sessionOverrideChanged(sessionId, dto.studentId);
    return override;
  }

  async deleteOverride(sessionId: string, studentId: string) {
    await this.prisma.sessionStudentOverride.deleteMany({
      where: { sessionId, studentId },
    });
    return { success: true };
  }

  async mineForStudent(userId: string, q: SessionsQueryDto) {
    const student = await this.prisma.student.findUnique({ where: { userId } });
    if (!student)
      throw new ForbiddenException('Akun ini tidak terhubung ke data siswa.');
    const memberships = await this.prisma.groupMember.findMany({
      where: { studentId: student.id },
      select: { groupId: true },
    });
    const groupIds = memberships.map((m) => m.groupId);
    return this.prisma.session.findMany({
      where: {
        groupId: { in: groupIds.length ? groupIds : ['__none__'] },
        ...dateRange(q),
      },
      include: {
        ...sessionListInclude,
        overrides: { where: { studentId: student.id } },
      },
      orderBy: { startsAt: 'asc' },
      take: q.take ?? 200,
    });
  }

  async mineForTutor(userId: string, q: SessionsQueryDto) {
    const tutor = await this.prisma.tutor.findUnique({ where: { userId } });
    if (!tutor)
      throw new ForbiddenException('Akun ini tidak terhubung ke data tutor.');
    return this.prisma.session.findMany({
      where: { tutorId: tutor.id, ...dateRange(q) },
      include: sessionListInclude,
      orderBy: { startsAt: 'asc' },
      take: q.take ?? 200,
    });
  }

  async mineForParent(userId: string, q: SessionsQueryDto) {
    const parent = await this.prisma.parent.findUnique({
      where: { userId },
      include: { parentStudents: { select: { studentId: true } } },
    });
    if (!parent)
      throw new ForbiddenException(
        'Akun ini tidak terhubung ke data orang tua.',
      );
    const studentIds = parent.parentStudents.map((p) => p.studentId);
    const memberships = await this.prisma.groupMember.findMany({
      where: {
        studentId: { in: studentIds.length ? studentIds : ['__none__'] },
      },
      select: {
        groupId: true,
        student: { select: { id: true, user: { select: { name: true } } } },
      },
    });
    const groupIds = [...new Set(memberships.map((m) => m.groupId))];
    // Anak ortu per kelompok — ortu multi-anak bisa bedakan sesi milik siapa.
    const namesByGroup = new Map<string, string[]>();
    for (const m of memberships) {
      const arr = namesByGroup.get(m.groupId) ?? [];
      if (!arr.includes(m.student.user.name)) arr.push(m.student.user.name);
      namesByGroup.set(m.groupId, arr);
    }
    const sessions = await this.prisma.session.findMany({
      where: {
        groupId: { in: groupIds.length ? groupIds : ['__none__'] },
        ...dateRange(q),
      },
      include: sessionListInclude,
      orderBy: { startsAt: 'asc' },
      take: q.take ?? 200,
    });
    return sessions.map((s) => ({
      ...s,
      childNames: namesByGroup.get(s.groupId) ?? [],
    }));
  }
}

function dateRange(q: SessionsQueryDto) {
  if (!q.from && !q.to) return {};
  return {
    startsAt: {
      ...(q.from ? { gte: new Date(q.from) } : {}),
      ...(q.to ? { lte: new Date(q.to) } : {}),
    },
  };
}
