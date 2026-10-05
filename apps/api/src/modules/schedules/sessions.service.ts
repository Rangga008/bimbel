// CRUD Session konkret + query jadwal per role.
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TutorScopeService } from '../../common/tutor-scope/tutor-scope.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { NotificationEventsService } from '../notifications/notification-events.service';
import { ConflictService } from './conflict.service';
import { SettingsService } from '../settings/settings.service';
import { WhatsAppOutboxService } from '../whatsapp/whatsapp-outbox.service';
import { sessionDetailInclude, sessionListInclude } from './schedules.includes';
import { renderReminderTemplate } from '../feedback/feedback.service';
import type { CreateDayNoteDto } from './dto/day-note.dto';
import {
  CreateSessionDto,
  SessionsQueryDto,
  UpdateSessionDto,
} from './dto/schedule-session.dto';

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conflicts: ConflictService,
    private readonly events: NotificationEventsService,
    private readonly tutorScope: TutorScopeService,
    private readonly settings: SettingsService,
    private readonly waOutbox: WhatsAppOutboxService,
  ) {}

  async list(actor: AuthenticatedUser, q: SessionsQueryDto) {
    // Tutor hanya melihat sesi kelompok yang dia ampu / yang dia ajar.
    const scope = await this.tutorScope.for(actor);
    return this.prisma.session.findMany({
      where: {
        ...(q.groupId ? { groupId: q.groupId } : {}),
        ...(q.tutorId ? { tutorId: q.tutorId } : {}),
        ...(q.roomId ? { roomId: q.roomId } : {}),
        // Detail siswa: semua sesi kelompok tempat siswa ini jadi anggota.
        ...(q.studentId
          ? { group: { members: { some: { studentId: q.studentId } } } }
          : {}),
        ...(scope
          ? {
              OR: [
                { groupId: { in: scope.groupIds } },
                { tutorId: scope.tutorId },
              ],
            }
          : {}),
        ...(q.from || q.to
          ? {
              startsAt: {
                ...(q.from ? { gte: new Date(q.from) } : {}),
                ...(q.to ? { lte: new Date(q.to) } : {}),
              },
            }
          : {}),
      },
      include: sessionListInclude,
      orderBy: { startsAt: 'asc' },
      take: q.take ?? 200,
    });
  }

  async get(id: string, actor?: AuthenticatedUser) {
    const s = await this.prisma.session.findUnique({
      where: { id },
      include: sessionDetailInclude,
    });
    if (!s) throw new NotFoundException('Sesi tidak ditemukan.');
    if (actor) {
      const scope = await this.tutorScope.for(actor);
      if (scope) {
        const inGroup = scope.groupIds.includes(s.groupId);
        const isTeacher = s.tutorId === scope.tutorId;
        if (!inGroup && !isTeacher)
          throw new NotFoundException('Sesi tidak ditemukan.');
      }
    }
    return s;
  }

  async create(dto: CreateSessionDto) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      throw new BadRequestException('Format waktu tidak valid.');
    }
    const group = await this.prisma.learningGroup.findUnique({
      where: { id: dto.groupId },
    });
    if (!group) throw new BadRequestException('Kelompok tidak ditemukan.');
    await this.assertTutor(dto.tutorId, dto.groupId);
    await this.assertRoom(dto.roomId);
    await this.assertSubject(dto.subjectId);
    await this.conflicts.assertNoSessionConflict({
      groupId: dto.groupId,
      tutorId: dto.tutorId ?? null,
      roomId: dto.roomId ?? null,
      startsAt,
      endsAt,
    });
    return this.prisma.session.create({
      data: {
        groupId: dto.groupId,
        scheduleId: dto.scheduleId ?? null,
        tutorId: dto.tutorId ?? null,
        roomId: dto.roomId ?? null,
        subjectId: dto.subjectId ?? null,
        startsAt,
        endsAt,
        notes: dto.notes,
      },
      include: sessionListInclude,
    });
  }

  async update(id: string, dto: UpdateSessionDto) {
    const existing = await this.get(id);
    if (dto.status && !['SCHEDULED', 'CANCELLED'].includes(dto.status)) {
      throw new BadRequestException('Status sesi tidak valid untuk fase ini.');
    }
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : existing.startsAt;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : existing.endsAt;
    const tutorId = dto.tutorId !== undefined ? dto.tutorId : existing.tutorId;
    const roomId = dto.roomId !== undefined ? dto.roomId : existing.roomId;
    const subjectId =
      dto.subjectId !== undefined ? dto.subjectId : existing.subjectId;
    await this.assertTutor(tutorId, existing.groupId);
    await this.assertRoom(roomId);
    await this.assertSubject(subjectId);
    const cancelling = dto.status === 'CANCELLED';
    if (!cancelling) {
      await this.conflicts.assertNoSessionConflict({
        excludeSessionId: id,
        groupId: existing.groupId,
        tutorId,
        roomId,
        startsAt,
        endsAt,
      });
    }
    const updated = await this.prisma.session.update({
      where: { id },
      data: {
        ...(dto.tutorId !== undefined ? { tutorId: dto.tutorId } : {}),
        ...(dto.roomId !== undefined ? { roomId: dto.roomId } : {}),
        ...(dto.subjectId !== undefined ? { subjectId: dto.subjectId } : {}),
        ...(dto.startsAt !== undefined ? { startsAt } : {}),
        ...(dto.endsAt !== undefined ? { endsAt } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
      include: sessionListInclude,
    });
    // Fase 5b: event "jadwal berubah" — hanya bila waktu/ruang/tutor/status
    // benar-benar berubah (patch notes saja tidak memicu notif).
    const changed =
      cancelling ||
      updated.startsAt.getTime() !== existing.startsAt.getTime() ||
      updated.endsAt.getTime() !== existing.endsAt.getTime() ||
      updated.roomId !== existing.roomId ||
      updated.tutorId !== existing.tutorId;
    if (changed)
      await this.events.sessionChanged(id, { cancelled: cancelling });
    return updated;
  }

  /**
   * Hapus sesi. Ditolak bila sesi sudah berisi absensi siswa/tutor atau item
   * kerja — histori tidak boleh hilang; dalam kasus itu sesi cukup dibatalkan.
   * Override per-siswa ikut terhapus (FK cascade).
   */
  async remove(id: string) {
    const existing = await this.get(id);
    const [att, tutAtt, work] = await Promise.all([
      this.prisma.attendance.count({ where: { sessionId: id } }),
      this.prisma.tutorAttendance.count({ where: { sessionId: id } }),
      this.prisma.tutorWorkItem.count({ where: { sessionId: id } }),
    ]);
    if (att + tutAtt + work > 0) {
      throw new BadRequestException(
        'Sesi ini sudah berisi absensi/data kerja — batalkan sesi sebagai gantinya.',
      );
    }
    await this.prisma.session.delete({ where: { id } });
    return { id, groupId: existing.groupId, startsAt: existing.startsAt };
  }

  async assertTutor(tutorId: string | null | undefined, groupId: string) {
    if (!tutorId) return;
    const tutor = await this.prisma.tutor.findUnique({
      where: { id: tutorId },
    });
    if (!tutor) throw new BadRequestException('Tutor tidak ditemukan.');
    if (!tutor.isActive) throw new BadRequestException('Tutor nonaktif.');
    const assigned = await this.prisma.groupTutor.findUnique({
      where: { groupId_tutorId: { groupId, tutorId } },
    });
    if (!assigned)
      throw new BadRequestException(
        'Tutor tersebut belum ditugaskan ke kelompok ini.',
      );
  }

  async assertRoom(roomId: string | null | undefined) {
    if (!roomId) return;
    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw new BadRequestException('Ruangan tidak ditemukan.');
    if (!room.isActive) throw new BadRequestException('Ruangan nonaktif.');
  }

  async assertSubject(subjectId: string | null | undefined) {
    if (!subjectId) return;
    const subject = await this.prisma.subject.findUnique({
      where: { id: subjectId },
    });
    if (!subject) throw new BadRequestException('Mapel tidak ditemukan.');
    if (!subject.isActive) throw new BadRequestException('Mapel nonaktif.');
  }

  // ===== Catatan tanggal (libur/rapat/darurat) =====

  listDayNotes(from?: string, to?: string) {
    const where: { date?: { gte?: Date; lte?: Date } } = {};
    if (from || to) {
      where.date = {};
      if (from) {
        const d = new Date(from);
        if (Number.isNaN(d.getTime()))
          throw new BadRequestException('Format tanggal "from" tidak valid.');
        where.date.gte = d;
      }
      if (to) {
        const d = new Date(to);
        if (Number.isNaN(d.getTime()))
          throw new BadRequestException('Format tanggal "to" tidak valid.');
        where.date.lte = d;
      }
    }
    return this.prisma.dayNote.findMany({
      where,
      orderBy: { date: 'asc' },
      take: 200,
    });
  }

  createDayNote(dto: CreateDayNoteDto, actorId: string) {
    const date = new Date(dto.date);
    if (Number.isNaN(date.getTime()))
      throw new BadRequestException('Format tanggal tidak valid.');
    // Normalisasi ke UTC-midnight supaya @db.Date menyimpan tanggal yang benar
    // di timezone server mana pun (pola sama seperti FeedbackEntry.weekStart).
    const utcDate = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
    return this.prisma.dayNote.create({
      data: {
        date: utcDate,
        type: dto.type ?? 'INFO',
        title: dto.title.trim(),
        note: dto.note?.trim() || null,
        createdBy: actorId,
      },
    });
  }

  async removeDayNote(id: string) {
    const existing = await this.prisma.dayNote.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Catatan tanggal tidak ditemukan.');
    await this.prisma.dayNote.delete({ where: { id } });
    return { id, title: existing.title };
  }

  /**
   * Tutor melaporkan berhalangan hadir di sesi yang dia ajar — menandai sesi
   * (tutorId asli dipertahankan sbg jejak) + WA ke orang tua seluruh anggota
   * kelompok atas nama tutor tersebut. Pengganti ditunjuk admin via PATCH sesi
   * (tetap lolos validasi roster + konflik).
   */
  async reportTutorAbsence(id: string, actor: AuthenticatedUser, reason: string) {
    const tutor = await this.prisma.tutor.findUnique({
      where: { userId: actor.id },
      include: { user: { select: { name: true } } },
    });
    if (!tutor)
      throw new ForbiddenException('Akun ini tidak terhubung ke data tutor.');
    const session = await this.prisma.session.findUnique({
      where: { id },
      include: sessionListInclude,
    });
    if (!session) throw new NotFoundException('Sesi tidak ditemukan.');
    if (session.tutorId !== tutor.id) {
      throw new ForbiddenException(
        'Hanya tutor yang dijadwalkan mengajar sesi ini yang bisa melapor berhalangan.',
      );
    }
    if (session.status === 'CANCELLED') {
      throw new BadRequestException('Sesi ini sudah dibatalkan.');
    }
    const updated = await this.prisma.session.update({
      where: { id },
      data: { tutorAbsenceNote: reason.trim(), tutorAbsenceAt: new Date() },
      include: sessionListInclude,
    });

    // WA ke ortu anggota kelompok — satu pesan per ortu (anak digabung).
    const members = await this.prisma.groupMember.findMany({
      where: { groupId: session.groupId },
      select: {
        student: {
          select: {
            user: { select: { name: true } },
            parentStudents: {
              select: {
                parent: {
                  select: {
                    isActive: true,
                    user: {
                      select: {
                        id: true,
                        name: true,
                        phone: true,
                        isActive: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    const tpl = (await this.settings.get('reminders')).tutorAbsence;
    const parents = new Map<
      string,
      { name: string; phone: string | null; children: string[] }
    >();
    for (const m of members) {
      for (const ps of m.student.parentStudents) {
        const u = ps.parent.user;
        if (!ps.parent.isActive || !u.isActive) continue;
        const cur = parents.get(u.id) ?? {
          name: u.name,
          phone: u.phone,
          children: [],
        };
        cur.children.push(m.student.user.name);
        parents.set(u.id, cur);
      }
    }
    const mapel =
      session.subject?.name ??
      session.schedule?.subject?.name ??
      session.group.level?.subject?.name ??
      '';
    const datetime = `${fmtIdDate(session.startsAt)} ${fmtIdTime(session.startsAt)}–${fmtIdTime(session.endsAt)}`;
    let notified = 0;
    for (const [userId, p] of parents) {
      const message = renderReminderTemplate(tpl, {
        children: p.children.join(' & '),
        tutor: tutor.user.name,
        datetime,
        subject: mapel || 'sesi',
        group: session.group.name,
        reason: reason.trim(),
      });
      const row = await this.waOutbox.enqueue({
        phone: p.phone,
        name: p.name,
        userId,
        eventType: 'TUTOR_ABSENCE',
        referenceType: 'Session',
        referenceId: `absence:${id}`,
        message,
      });
      if (row) notified += 1;
    }
    return { session: updated, notified, recipients: parents.size };
  }
}

const ID_DAYS = [
  'Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu',
];
const ID_MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];
function fmtIdDate(d: Date) {
  return `${ID_DAYS[d.getDay()]}, ${d.getDate()} ${ID_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
function fmtIdTime(d: Date) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
