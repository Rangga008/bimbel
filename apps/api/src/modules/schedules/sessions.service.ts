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
import { MoveSessionStudentDto } from './dto/schedule-session.dto';

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

  /**
   * Scope kelompok untuk SISWA/ORANG_TUA — mereka hanya boleh melihat sesi
   * kelompok yang (anak-anaknya) ikuti. `null` = tidak dibatasi (staff/tutor
   * ditangani terpisah), `[]` = tak punya kelompok → tak lihat sesi apa pun.
   */
  private async familyScope(
    actor: AuthenticatedUser,
  ): Promise<{ groupIds: string[]; studentIds: string[] } | null> {
    if (actor.roles.includes('ORANG_TUA')) {
      const parent = await this.prisma.parent.findUnique({
        where: { userId: actor.id },
        select: { parentStudents: { select: { studentId: true } } },
      });
      if (!parent) return { groupIds: [], studentIds: [] };
      const studentIds = parent.parentStudents.map((p) => p.studentId);
      if (!studentIds.length) return { groupIds: [], studentIds: [] };
      const members = await this.prisma.groupMember.findMany({
        where: { studentId: { in: studentIds } },
        select: { groupId: true },
      });
      return {
        groupIds: [...new Set(members.map((m) => m.groupId))],
        studentIds,
      };
    }
    if (actor.roles.includes('SISWA')) {
      const student = await this.prisma.student.findUnique({
        where: { userId: actor.id },
        select: { id: true },
      });
      const scope = await this.tutorScope.forStudent(actor);
      return {
        groupIds: scope ? scope.groupIds : [],
        studentIds: student ? [student.id] : [],
      };
    }
    return null;
  }

  async list(actor: AuthenticatedUser, q: SessionsQueryDto) {
    // Tutor hanya melihat sesi kelompok yang dia ampu / yang dia ajar.
    const scope = await this.tutorScope.for(actor);
    // Siswa/ortu hanya melihat sesi kelompoknya sendiri — jangan bocorkan
    // roster & nomor HP tutor kelompok lain ke semua akun self-register.
    const family = await this.familyScope(actor);
    if (
      family !== null &&
      q.groupId &&
      !family.groupIds.includes(q.groupId)
    ) {
      return [];
    }
    return this.prisma.session.findMany({
      where: {
        ...(q.groupId ? { groupId: q.groupId } : {}),
        ...(family !== null ? { groupId: { in: family.groupIds } } : {}),
        ...(q.tutorId ? { tutorId: q.tutorId } : {}),
        ...(q.roomId ? { roomId: q.roomId } : {}),
        // Siswa/ortu hanya melihat sesi yang memang menjadwalkan anaknya
        // (roster per-sesi — bukan sekadar anggota kelompok).
        ...(family !== null
          ? { students: { some: { studentId: { in: family.studentIds } } } }
          : {}),
        // Detail siswa: sesi yang memasukkan siswa ini ke roster.
        ...(q.studentId
          ? { students: { some: { studentId: q.studentId } } }
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
      const family = await this.familyScope(actor);
      if (
        family !== null &&
        (!family.groupIds.includes(s.groupId) ||
          !(s as { students?: { studentId: string }[] }).students?.some((st) =>
            family.studentIds.includes(st.studentId),
          ))
      ) {
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
      studentIds: dto.studentIds,
    });
    const memberIds = await this.groupMemberIds(dto.groupId);
    const rosterIds =
      dto.studentIds !== undefined
        ? this.assertRosterSubset(dto.studentIds, memberIds)
        : memberIds;
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
        students: {
          create: rosterIds.map((studentId) => ({ studentId })),
        },
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
      // Roster efektif untuk cek bentrok = roster baru bila dikirim, kalau
      // tidak roster sesi saat ini (fallback anggota kelompok utk data lama).
      const rosterIds =
        dto.studentIds !== undefined
          ? dto.studentIds
          : (
              await this.prisma.sessionStudent.findMany({
                where: { sessionId: id },
                select: { studentId: true },
              })
            ).map((r) => r.studentId);
      await this.conflicts.assertNoSessionConflict({
        excludeSessionId: id,
        groupId: existing.groupId,
        tutorId,
        roomId,
        startsAt,
        endsAt,
        studentIds: rosterIds.length ? rosterIds : undefined,
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
    if (dto.studentIds !== undefined) {
      await this.applyRoster(id, existing.groupId, dto.studentIds, null);
    }
    return updated;
  }

  // ===== Roster per-sesi =====

  private async groupMemberIds(groupId: string) {
    const rows = await this.prisma.groupMember.findMany({
      where: { groupId },
      select: { studentId: true },
    });
    return rows.map((r) => r.studentId);
  }

  /** Pastikan semua studentId anggota kelompok; dedupe; tolak duplikat/asing. */
  private assertRosterSubset(studentIds: string[], memberIds: string[]) {
    const allowed = new Set(memberIds);
    const out: string[] = [];
    for (const id of new Set(studentIds)) {
      if (!allowed.has(id)) {
        throw new BadRequestException(
          'Ada siswa yang bukan anggota kelompok sesi ini.',
        );
      }
      out.push(id);
    }
    return out;
  }

  /**
   * Ganti roster sesi. Siswa yang sudah punya baris absensi di sesi ini tidak
   * boleh dicoret — koreksi absensinya dulu supaya histori tidak menggantung.
   */
  private async applyRoster(
    sessionId: string,
    groupId: string,
    studentIds: string[],
    createdBy: string | null,
  ) {
    const memberIds = await this.groupMemberIds(groupId);
    const next = new Set(this.assertRosterSubset(studentIds, memberIds));
    const [current, attended] = await Promise.all([
      this.prisma.sessionStudent.findMany({
        where: { sessionId },
        select: { studentId: true },
      }),
      this.prisma.attendance.findMany({
        where: { sessionId },
        select: { studentId: true },
      }),
    ]);
    const cur = new Set(current.map((r) => r.studentId));
    const marked = new Set(attended.map((a) => a.studentId));
    const removingMarked = [...marked].filter((id) => !next.has(id));
    if (removingMarked.length) {
      throw new BadRequestException(
        'Ada siswa yang sudah diabsen di sesi ini — koreksi absensinya dulu atau pindahkan lewat fitur "Pindah sesi".',
      );
    }
    const toAdd = [...next].filter((id) => !cur.has(id));
    const toRemove = [...cur].filter((id) => !next.has(id));
    await this.prisma.$transaction([
      ...(toRemove.length
        ? [
            this.prisma.sessionStudent.deleteMany({
              where: { sessionId, studentId: { in: toRemove } },
            }),
          ]
        : []),
      ...(toAdd.length
        ? [
            this.prisma.sessionStudent.createMany({
              data: toAdd.map((studentId) => ({
                sessionId,
                studentId,
                createdBy,
              })),
            }),
          ]
        : []),
    ]);
    return { added: toAdd.length, removed: toRemove.length, total: next.size };
  }

  /**
   * Aktor boleh mengelola roster/pindah sesi: punya `session.manage`, atau
   * tutor yang mengampu sesi ini (dijadwalkan sebagai pengajar ATAU terdaftar
   * di kelompoknya).
   */
  async assertSessionManager(sessionId: string, actor: AuthenticatedUser) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { id: true, groupId: true, tutorId: true, status: true },
    });
    if (!session) throw new NotFoundException('Sesi tidak ditemukan.');
    if (actor.permissions.includes('session.manage')) return session;
    const tutor = await this.prisma.tutor.findUnique({
      where: { userId: actor.id },
      select: { id: true },
    });
    if (tutor) {
      if (session.tutorId === tutor.id) return session;
      const assigned = await this.prisma.groupTutor.findUnique({
        where: {
          groupId_tutorId: { groupId: session.groupId, tutorId: tutor.id },
        },
      });
      if (assigned) return session;
    }
    throw new ForbiddenException(
      'Anda tidak berwenang mengatur peserta sesi ini.',
    );
  }

  async setRoster(
    sessionId: string,
    studentIds: string[],
    actor: AuthenticatedUser,
  ) {
    const session = await this.assertSessionManager(sessionId, actor);
    if (session.status === 'CANCELLED') {
      throw new BadRequestException('Sesi dibatalkan — roster tidak diubah.');
    }
    const res = await this.applyRoster(
      sessionId,
      session.groupId,
      studentIds,
      actor.id,
    );
    if (res.added > 0 || res.removed > 0) {
      await this.events.sessionChanged(sessionId, { cancelled: false });
    }
    return { sessionId, ...res };
  }

  /**
   * Pindahkan 1 siswa ke sesi lain dalam kelompok yang sama — untuk siswa yang
   * berhalangan di sesi awal. Absensi (bila sudah ada) ikut dipindahkan
   * supaya histori mengikuti siswa, bukan sesi lama.
   */
  async moveStudent(
    fromSessionId: string,
    studentId: string,
    dto: MoveSessionStudentDto,
    actor: AuthenticatedUser,
  ) {
    const from = await this.assertSessionManager(fromSessionId, actor);
    if (fromSessionId === dto.toSessionId) {
      throw new BadRequestException('Sesi tujuan sama dengan sesi asal.');
    }
    const to = await this.prisma.session.findUnique({
      where: { id: dto.toSessionId },
      select: { id: true, groupId: true, status: true },
    });
    if (!to || to.groupId !== from.groupId) {
      throw new BadRequestException(
        'Sesi tujuan harus dalam kelompok yang sama.',
      );
    }
    if (to.status !== 'SCHEDULED') {
      throw new BadRequestException(
        'Sesi tujuan harus berstatus terjadwal dan belum dibatalkan.',
      );
    }
    // Otorisasi cukup di sesi asal: pemindahan antar-sesi dalam satu kelompok
    // adalah kelanjutan dari pengelolaan roster sesi asal (mis. tutor jam 8
    // memindahkan siswa berhalangan ke sesi jam 11 yang diampu tutor lain
    // dalam kelompok yang sama).
    const memberIds = await this.groupMemberIds(from.groupId);
    if (!memberIds.includes(studentId)) {
      throw new BadRequestException('Siswa bukan anggota kelompok ini.');
    }
    const rosterRow = await this.prisma.sessionStudent.findUnique({
      where: {
        sessionId_studentId: { sessionId: fromSessionId, studentId },
      },
    });
    if (!rosterRow) {
      throw new BadRequestException(
        'Siswa tidak terdaftar di roster sesi asal.',
      );
    }
    await this.prisma.$transaction([
      this.prisma.sessionStudent.delete({ where: { id: rosterRow.id } }),
      this.prisma.sessionStudent.upsert({
        where: {
          sessionId_studentId: {
            sessionId: dto.toSessionId,
            studentId,
          },
        },
        create: {
          sessionId: dto.toSessionId,
          studentId,
          createdBy: actor.id,
        },
        update: {},
      }),
      // Absensi yang sudah tercatat ikut pindah (histori melekat ke siswa).
      this.prisma.attendance.updateMany({
        where: { sessionId: fromSessionId, studentId },
        data: { sessionId: dto.toSessionId },
      }),
    ]);
    await this.events.sessionChanged(fromSessionId, { cancelled: false });
    await this.events.sessionChanged(dto.toSessionId, { cancelled: false });
    return { moved: true, fromSessionId, toSessionId: dto.toSessionId, studentId };
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

    // WA ke ortu siswa yang dijadwalkan di sesi ini (roster) — fallback ke
    // anggota kelompok untuk sesi lama tanpa baris roster.
    const roster = await this.prisma.sessionStudent.findMany({
      where: { sessionId: id },
      select: { studentId: true },
    });
    const members = await this.prisma.groupMember.findMany({
      where: {
        groupId: session.groupId,
        ...(roster.length
          ? { studentId: { in: roster.map((r) => r.studentId) } }
          : {}),
      },
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
