// CRUD Schedule (template mingguan per kelompok).
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TutorScopeService } from '../../common/tutor-scope/tutor-scope.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { scheduleDetailInclude, scheduleListInclude } from './schedules.includes';
import { CreateScheduleDto, UpdateScheduleDto } from './dto/schedule-session.dto';

@Injectable()
export class SchedulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tutorScope: TutorScopeService,
  ) {}

  async list(
    actor: AuthenticatedUser,
    query: { groupId?: string; isActive?: string },
  ) {
    const scope = await this.tutorScope.for(actor);
    return this.prisma.schedule.findMany({
      where: {
        ...(query.isActive === 'true' ? { isActive: true } : {}),
        ...(query.isActive === 'false' ? { isActive: false } : {}),
        // Tutor hanya melihat jadwal kelompok yang dia ampu — filter groupId
        // tetap berlaku, tapi dibatasi ke kelompok dalam scope-nya.
        groupId: scope
          ? query.groupId
            ? { equals: query.groupId, in: scope.groupIds }
            : { in: scope.groupIds }
          : query.groupId
            ? query.groupId
            : undefined,
      },
      include: scheduleListInclude,
      orderBy: [{ dayOfWeek: 'asc' }, { startMin: 'asc' }],
      take: 200,
    });
  }

  async get(id: string, actor?: AuthenticatedUser) {
    const s = await this.prisma.schedule.findUnique({ where: { id }, include: scheduleDetailInclude });
    if (!s) throw new NotFoundException('Jadwal tidak ditemukan.');
    if (actor) {
      const scope = await this.tutorScope.for(actor);
      if (scope && !scope.groupIds.includes(s.groupId)) {
        throw new NotFoundException('Jadwal tidak ditemukan.');
      }
    }
    return s;
  }

  async create(dto: CreateScheduleDto) {
    this.assertTimeRange(dto.startMin, dto.endMin);
    const group = await this.prisma.learningGroup.findUnique({
      where: { id: dto.groupId },
      include: { tutors: { where: { isLead: true }, take: 1 } },
    });
    if (!group) throw new BadRequestException('Kelompok tidak ditemukan.');
    // Tutor kosong -> auto pakai tutor lead kelompok (sinkronisasi otomatis).
    const tutorId = dto.tutorId ?? group.tutors[0]?.tutorId ?? null;
    await this.assertTutorRoom(tutorId, dto.roomId, dto.groupId);
    if (dto.subjectId) {
      const subject = await this.prisma.subject.findUnique({ where: { id: dto.subjectId } });
      if (!subject) throw new BadRequestException('Mapel tidak ditemukan.');
    }
    const validFrom = parseDateOnly(dto.validFrom);
    const validTo = dto.validTo ? parseDateOnly(dto.validTo) : null;
    if (validTo && validTo < validFrom) throw new BadRequestException('validTo harus setelah validFrom.');
    await this.assertNoScheduleConflict({
      tutorId, roomId: dto.roomId ?? null, dayOfWeek: dto.dayOfWeek,
      startMin: dto.startMin, endMin: dto.endMin, validFrom, validTo,
    });
    return this.prisma.schedule.create({
      data: {
        groupId: dto.groupId,
        tutorId,
        roomId: dto.roomId ?? null,
        subjectId: dto.subjectId ?? null,
        dayOfWeek: dto.dayOfWeek,
        startMin: dto.startMin,
        endMin: dto.endMin,
        validFrom,
        validTo,
        isActive: dto.isActive ?? true,
      },
      include: scheduleListInclude,
    });
  }

  async update(id: string, dto: UpdateScheduleDto) {
    const existing = await this.get(id);
    const startMin = dto.startMin ?? existing.startMin;
    const endMin = dto.endMin ?? existing.endMin;
    this.assertTimeRange(startMin, endMin);
    await this.assertTutorRoom(dto.tutorId ?? existing.tutorId, dto.roomId ?? existing.roomId, existing.groupId);
    if (dto.subjectId) {
      const subject = await this.prisma.subject.findUnique({ where: { id: dto.subjectId } });
      if (!subject) throw new BadRequestException('Mapel tidak ditemukan.');
    }
    const nextDay = dto.dayOfWeek ?? existing.dayOfWeek;
    const nextValidFrom = dto.validFrom !== undefined ? parseDateOnly(dto.validFrom) : existing.validFrom;
    const nextValidTo = dto.validTo !== undefined ? (dto.validTo ? parseDateOnly(dto.validTo) : null) : existing.validTo;
    if (nextValidTo && nextValidTo < nextValidFrom) throw new BadRequestException('validTo harus setelah validFrom.');
    await this.assertNoScheduleConflict({
      excludeId: id,
      tutorId: dto.tutorId !== undefined ? dto.tutorId : existing.tutorId,
      roomId: dto.roomId !== undefined ? dto.roomId : existing.roomId,
      dayOfWeek: nextDay, startMin, endMin, validFrom: nextValidFrom, validTo: nextValidTo,
    });
    const updated = await this.prisma.schedule.update({
      where: { id },
      data: {
        ...(dto.tutorId !== undefined ? { tutorId: dto.tutorId } : {}),
        ...(dto.roomId !== undefined ? { roomId: dto.roomId } : {}),
        ...(dto.subjectId !== undefined ? { subjectId: dto.subjectId } : {}),
        ...(dto.dayOfWeek !== undefined ? { dayOfWeek: dto.dayOfWeek } : {}),
        ...(dto.startMin !== undefined ? { startMin: dto.startMin } : {}),
        ...(dto.endMin !== undefined ? { endMin: dto.endMin } : {}),
        ...(dto.validFrom !== undefined ? { validFrom: parseDateOnly(dto.validFrom) } : {}),
        ...(dto.validTo !== undefined ? { validTo: dto.validTo ? parseDateOnly(dto.validTo) : null } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      include: scheduleListInclude,
    });
    // Jadwal dinonaktifkan → sesi SCHEDULED mendatang miliknya ikut dibatalkan
    // supaya tidak tampil lagi di kalender (sesi berisi absensi tetap aman —
    // hanya statusnya yang berubah, datanya tidak dihapus).
    if (dto.isActive === false) {
      await this.prisma.session.updateMany({
        where: {
          scheduleId: id,
          status: 'SCHEDULED',
          startsAt: { gt: new Date() },
        },
        data: { status: 'CANCELLED' },
      });
    }
    // Jadwal diaktifkan kembali → hidupkan sesi CANCELLED mendatang yang
    // dibatalkan saat nonaktif (yang tanpa absensi — absensi tidak pernah
    // dibatalkan). Status disinkronkan ke tutor/ruangan/jam jadwal terkini.
    if (dto.isActive === true && existing.isActive === false) {
      await this.prisma.session.updateMany({
        where: {
          scheduleId: id,
          status: 'CANCELLED',
          startsAt: { gt: new Date() },
          attendances: { none: {} },
        },
        data: {
          status: 'SCHEDULED',
          ...(dto.tutorId !== undefined ? { tutorId: dto.tutorId } : {}),
          ...(dto.roomId !== undefined ? { roomId: dto.roomId } : {}),
        },
      });
    }
    return updated;
  }

  /**
   * Hapus jadwal beserta seluruh sesinya. Ditolak bila ada sesi yang sudah
   * berisi absensi siswa/tutor atau item kerja — histori tidak boleh hilang;
   * dalam kasus itu jadwal cukup dinonaktifkan.
   */
  async remove(id: string) {
    const existing = await this.get(id);
    const used = await this.prisma.session.count({
      where: {
        scheduleId: id,
        OR: [
          { attendances: { some: {} } },
          { tutorAttendances: { some: {} } },
          { workItems: { some: {} } },
        ],
      },
    });
    if (used > 0) {
      throw new BadRequestException(
        `${used} sesi jadwal ini sudah berisi absensi/data kerja — nonaktifkan jadwal sebagai gantinya.`,
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.session.deleteMany({ where: { scheduleId: id } });
      await tx.schedule.delete({ where: { id } });
      return { id, groupId: existing.groupId, deletedSessions: deleted.count };
    });
  }

  assertTimeRange(startMin: number, endMin: number) {
    if (endMin <= startMin) throw new BadRequestException('Jam selesai harus setelah jam mulai.');
  }

  /**
   * Konflik antar-template jadwal mingguan: tutor/ruangan yang sama tidak boleh
   * punya dua jadwal aktif di hari yang sama dengan jam yang tumpang-tindih dan
   * rentang berlaku yang bersinggungan — supaya generate tidak menghasilkan
   * sesi bentrok.
   */
  async assertNoScheduleConflict(c: {
    excludeId?: string;
    tutorId?: string | null;
    roomId?: string | null;
    dayOfWeek: number;
    startMin: number;
    endMin: number;
    validFrom: Date;
    validTo: Date | null;
  }) {
    if (!c.tutorId && !c.roomId) return;
    const others = await this.prisma.schedule.findMany({
      where: {
        isActive: true,
        dayOfWeek: c.dayOfWeek,
        startMin: { lt: c.endMin },
        endMin: { gt: c.startMin },
        ...(c.excludeId ? { id: { not: c.excludeId } } : {}),
        OR: [
          ...(c.tutorId ? [{ tutorId: c.tutorId }] : []),
          ...(c.roomId ? [{ roomId: c.roomId }] : []),
        ],
      },
      include: {
        group: { select: { name: true } },
        tutor: { select: { user: { select: { name: true } } } },
        room: { select: { name: true } },
      },
      take: 100,
    });
    const hm = (m: number) =>
      `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    for (const o of others) {
      // Rentang berlaku harus bersinggungan agar dianggap konflik.
      const oTo = o.validTo ?? new Date('9999-12-31');
      const cTo = c.validTo ?? new Date('9999-12-31');
      if (o.validFrom > cTo || oTo < c.validFrom) continue;
      if (c.tutorId && o.tutorId === c.tutorId) {
        const name = o.tutor?.user.name ?? 'Tutor tersebut';
        throw new ConflictException(
          `${name} sudah punya jadwal "${o.group.name}" di hari yang sama jam ${hm(o.startMin)}–${hm(o.endMin)}.`,
        );
      }
      if (c.roomId && o.roomId === c.roomId) {
        throw new ConflictException(
          `Ruangan ${o.room?.name ?? 'tersebut'} sudah dipakai "${o.group.name}" di hari yang sama jam ${hm(o.startMin)}–${hm(o.endMin)}.`,
        );
      }
    }
  }

  async assertTutorRoom(tutorId: string | null | undefined, roomId: string | null | undefined, groupId: string) {
    if (tutorId) {
      const tutor = await this.prisma.tutor.findUnique({ where: { id: tutorId } });
      if (!tutor) throw new BadRequestException('Tutor tidak ditemukan.');
      if (!tutor.isActive) throw new BadRequestException('Tutor nonaktif.');
      const assigned = await this.prisma.groupTutor.findUnique({ where: { groupId_tutorId: { groupId, tutorId } } });
      if (!assigned) throw new BadRequestException('Tutor tersebut belum ditugaskan ke kelompok ini.');
    }
    if (roomId) {
      const room = await this.prisma.room.findUnique({ where: { id: roomId } });
      if (!room) throw new BadRequestException('Ruangan tidak ditemukan.');
      if (!room.isActive) throw new BadRequestException('Ruangan nonaktif.');
    }
  }
}

/**
 * Kolom `@db.Date` disimpan sebagai tanggal murni — parse "YYYY-MM-DD" sebagai
 * tengah malam UTC supaya tanggal tidak bergeser 1 hari saat server ber-TZ
 * non-UTC (Asia/Jakarta). Jam sesi tetap dihitung lokal via minutesToDate.
 */
export function parseDateOnly(s: string): Date {
  return new Date(`${s.slice(0, 10)}T00:00:00.000Z`);
}

export function parseDateOnlyEnd(s: string): Date {
  return new Date(`${s.slice(0, 10)}T23:59:59.999Z`);
}

export function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

export function endOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(23, 59, 59, 999);
  return c;
}

export function addWeeks(d: Date, weeks: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + weeks * 7);
  return c;
}

export function minutesToDate(day: Date, minutes: number): Date {
  const c = new Date(day);
  c.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return c;
}
