// Feedback/survei mingguan per siswa per mapel dalam kelompok.
// Ortu (atau siswa) mengisi "di sekolah anak belajar apa"; seluruh tutor
// anggota kelompok (GroupTutor maupun yang di-assign ke sesi kelompok itu)
// bisa melihat tabel gabungan: baris = siswa, kolom = mapel.
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import ExcelJS from 'exceljs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TutorScopeService } from '../../common/tutor-scope/tutor-scope.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PERMISSION_CODES } from '../rbac/permissions.constants';
import { WhatsAppOutboxService } from '../whatsapp/whatsapp-outbox.service';
import { SettingsService } from '../settings/settings.service';
import type { SubmitFeedbackDto } from './dto/feedback.dto';
import type { GroupReminderType } from './dto/feedback.dto';

const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_NAMES = [
  'Minggu',
  'Senin',
  'Selasa',
  'Rabu',
  'Kamis',
  'Jumat',
  'Sabtu',
];
const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

function fmtDate(d: Date) {
  return `${DAY_NAMES[d.getDay()]}, ${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}
function fmtTime(d: Date) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function fmtRp(n: number) {
  return `Rp${new Intl.NumberFormat('id-ID').format(Math.round(n))}`;
}

/** Ganti {{placeholder}} di template dengan nilai variabel. Token tak dikenal dibiarkan. */
export function renderReminderTemplate(
  tpl: string,
  vars: Record<string, string>,
) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (m, k) => vars[k] ?? m);
}

@Injectable()
export class FeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tutorScope: TutorScopeService,
    private readonly waOutbox: WhatsAppOutboxService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Senin dari tanggal input — default hari ini. Dikembalikan sebagai
   * UTC-midnight (bukan local-midnight) supaya kolom `@db.Date` menyimpan
   * tanggal Senin apa pun timezone server — kalau pakai local-midnight,
   * server UTC+7 menyimpan "hari Minggu".
   */
  weekStartOf(input?: string | Date): Date {
    const d = input ? new Date(input) : new Date();
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException('Format tanggal minggu tidak valid.');
    }
    const day = d.getDay(); // 0=Minggu … 6=Sabtu
    const diff = (day + 6) % 7; // jarak mundur ke Senin
    const mondayLocal = new Date(d.getFullYear(), d.getMonth(), d.getDate() - diff);
    return new Date(
      Date.UTC(
        mondayLocal.getFullYear(),
        mondayLocal.getMonth(),
        mondayLocal.getDate(),
      ),
    );
  }

  private weekEndOf(weekStart: Date) {
    return new Date(weekStart.getTime() + 7 * DAY_MS);
  }

  /**
   * Mapel yang relevan untuk sebuah kelompok = mapel jenjang (LevelSubject)
   * ∪ mapel tunggal level ∪ mapel program ∪ mapel yang dipakai jadwal kelompok.
   */
  private async groupSubjects(groupId: string) {
    const group = await this.prisma.learningGroup.findUnique({
      where: { id: groupId },
      select: {
        id: true,
        name: true,
        code: true,
        program: { select: { id: true, name: true, subjectId: true } },
        level: {
          select: {
            id: true,
            name: true,
            subjectId: true,
            levelSubjects: {
              select: {
                subject: { select: { id: true, code: true, name: true } },
              },
            },
          },
        },
        schedules: {
          where: { subjectId: { not: null } },
          select: { subject: { select: { id: true, code: true, name: true } } },
        },
      },
    });
    if (!group) throw new NotFoundException('Kelompok tidak ditemukan.');
    const map = new Map<string, { id: string; code: string; name: string }>();
    for (const ls of group.level?.levelSubjects ?? [])
      if (ls.subject) map.set(ls.subject.id, ls.subject);
    if (group.level?.subjectId) {
      const s = await this.prisma.subject.findUnique({
        where: { id: group.level.subjectId },
        select: { id: true, code: true, name: true },
      });
      if (s) map.set(s.id, s);
    }
    if (group.program?.subjectId) {
      const s = await this.prisma.subject.findUnique({
        where: { id: group.program.subjectId },
        select: { id: true, code: true, name: true },
      });
      if (s) map.set(s.id, s);
    }
    for (const sc of group.schedules) if (sc.subject) map.set(sc.subject.id, sc.subject);
    return { group, subjects: [...map.values()] };
  }

  /**
   * Konteks pengisian untuk pemanggil (ortu → semua anak; siswa → dirinya):
   * daftar siswa + kelompok aktifnya + mapel tiap kelompok.
   */
  async myContext(actor: AuthenticatedUser) {
    const isParent = actor.roles.includes('ORANG_TUA');
    const isStudent = actor.roles.includes('SISWA');
    if (!isParent && !isStudent) {
      throw new ForbiddenException('Hanya akun orang tua atau siswa.');
    }
    let students: Array<{ id: string; name: string; groups: any[] }> = [];
    if (isParent) {
      const parent = await this.prisma.parent.findUnique({
        where: { userId: actor.id },
        select: { id: true },
      });
      if (!parent) throw new NotFoundException('Profil orang tua tidak ditemukan.');
      const links = await this.prisma.parentStudent.findMany({
        where: { parentId: parent.id },
        select: {
          student: {
            select: {
              id: true,
              isActive: true,
              user: { select: { name: true } },
              groupMembers: {
                select: { group: { select: { id: true, name: true, code: true, isActive: true } } },
              },
            },
          },
        },
      });
      students = links.map((l) => ({
        id: l.student.id,
        name: l.student.user.name,
        groups: l.student.groupMembers.map((m) => m.group).filter((g) => g.isActive),
      }));
      return {
        authorRole: 'ORANG_TUA' as const,
        students: await this.attachSubjects(students),
      };
    }
    const student = await this.prisma.student.findUnique({
      where: { userId: actor.id },
      select: {
        id: true,
        user: { select: { name: true } },
        groupMembers: {
          select: { group: { select: { id: true, name: true, code: true, isActive: true } } },
        },
      },
    });
    if (!student) throw new NotFoundException('Profil siswa tidak ditemukan.');
    students = [
      {
        id: student.id,
        name: student.user.name,
        groups: student.groupMembers.map((m) => m.group).filter((g) => g.isActive),
      },
    ];
    return { authorRole: 'SISWA' as const, students: await this.attachSubjects(students) };
  }

  private async attachSubjects(
    students: Array<{ id: string; name: string; groups: any[] }>,
  ) {
    const out = [] as Array<{
      id: string;
      name: string;
      groups: Array<{
        id: string;
        name: string;
        code: string | null;
        subjects: Array<{ id: string; code: string; name: string }>;
      }>;
    }>;
    for (const s of students) {
      const groups = [] as Array<{
        id: string;
        name: string;
        code: string | null;
        subjects: Array<{ id: string; code: string; name: string }>;
      }>;
      for (const g of s.groups) {
        const { subjects } = await this.groupSubjects(g.id);
        groups.push({ id: g.id, name: g.name, code: g.code, subjects });
      }
      out.push({ id: s.id, name: s.name, groups });
    }
    return out;
  }

  /** Entri feedback milik pemanggil untuk 1 minggu (ortu → semua anaknya). */
  async listMine(actor: AuthenticatedUser, week?: string) {
    const weekStart = this.weekStartOf(week);
    const weekEnd = this.weekEndOf(weekStart);
    let studentIds: string[] = [];
    if (actor.roles.includes('ORANG_TUA')) {
      const parent = await this.prisma.parent.findUnique({
        where: { userId: actor.id },
        select: { id: true },
      });
      if (!parent) throw new NotFoundException('Profil orang tua tidak ditemukan.');
      const links = await this.prisma.parentStudent.findMany({
        where: { parentId: parent.id },
        select: { studentId: true },
      });
      studentIds = links.map((l) => l.studentId);
    } else {
      const student = await this.prisma.student.findUnique({
        where: { userId: actor.id },
        select: { id: true },
      });
      if (!student) throw new NotFoundException('Profil siswa tidak ditemukan.');
      studentIds = [student.id];
    }
    const entries = await this.prisma.feedbackEntry.findMany({
      where: { studentId: { in: studentIds }, weekStart },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        groupId: true,
        studentId: true,
        subjectId: true,
        weekStart: true,
        content: true,
        authorRole: true,
        author: { select: { name: true } },
        updatedAt: true,
      },
    });
    return { weekStart, weekEnd, entries };
  }

  /** Upsert satu sel feedback — ortu untuk anaknya, siswa untuk dirinya. */
  async submit(actor: AuthenticatedUser, dto: SubmitFeedbackDto) {
    const weekStart = this.weekStartOf(dto.weekStart);
    let authorRole: 'SISWA' | 'ORANG_TUA';
    let parentId: string | null = null;

    if (actor.roles.includes('ORANG_TUA')) {
      const parent = await this.prisma.parent.findUnique({
        where: { userId: actor.id },
        select: { id: true },
      });
      if (!parent) throw new NotFoundException('Profil orang tua tidak ditemukan.');
      const link = await this.prisma.parentStudent.findUnique({
        where: {
          parentId_studentId: { parentId: parent.id, studentId: dto.studentId },
        },
      });
      if (!link) throw new ForbiddenException('Siswa ini bukan anak Anda.');
      authorRole = 'ORANG_TUA';
      parentId = parent.id;
    } else if (actor.roles.includes('SISWA')) {
      const student = await this.prisma.student.findUnique({
        where: { userId: actor.id },
        select: { id: true },
      });
      if (!student || student.id !== dto.studentId) {
        throw new ForbiddenException('Anda hanya bisa mengisi feedback untuk diri sendiri.');
      }
      authorRole = 'SISWA';
    } else {
      throw new ForbiddenException('Hanya akun orang tua atau siswa.');
    }

    const member = await this.prisma.groupMember.findUnique({
      where: { groupId_studentId: { groupId: dto.groupId, studentId: dto.studentId } },
    });
    if (!member) {
      throw new BadRequestException('Siswa bukan anggota kelompok ini.');
    }
    const { subjects } = await this.groupSubjects(dto.groupId);
    if (!subjects.length) {
      throw new BadRequestException('Kelompok ini belum punya mapel yang dikonfigurasi.');
    }
    if (!subjects.some((s) => s.id === dto.subjectId)) {
      throw new BadRequestException('Mapel ini bukan bagian dari kelompok tersebut.');
    }

    return this.prisma.feedbackEntry.upsert({
      where: {
        groupId_studentId_subjectId_weekStart: {
          groupId: dto.groupId,
          studentId: dto.studentId,
          subjectId: dto.subjectId,
          weekStart,
        },
      },
      create: {
        groupId: dto.groupId,
        studentId: dto.studentId,
        subjectId: dto.subjectId,
        weekStart,
        content: dto.content.trim(),
        authorUserId: actor.id,
        authorRole,
        parentId,
      },
      update: {
        content: dto.content.trim(),
        authorUserId: actor.id,
        authorRole,
        parentId,
      },
      select: {
        id: true,
        studentId: true,
        subjectId: true,
        weekStart: true,
        content: true,
        authorRole: true,
        updatedAt: true,
      },
    });
  }

  /**
   * Staff (GROUP_VIEW tanpa scope tutor) bebas; tutor hanya untuk kelompok
   * dalam scope-nya (GroupTutor atau pernah di-assign ke sesi kelompok itu).
   */
  private async assertGroupAccess(actor: AuthenticatedUser, groupId: string) {
    if (!actor.permissions.includes(PERMISSION_CODES.GROUP_VIEW)) {
      throw new ForbiddenException('Anda tidak memiliki akses melihat feedback kelompok.');
    }
    const scope = await this.tutorScope.for(actor);
    if (scope && !scope.groupIds.includes(groupId)) {
      throw new ForbiddenException('Kelompok ini di luar kelompok yang Anda ampu.');
    }
  }

  /** Matriks kelompok: baris = siswa, kolom = mapel, sel = feedback minggu itu. */
  async groupMatrix(actor: AuthenticatedUser, groupId: string, week?: string) {
    await this.assertGroupAccess(actor, groupId);
    const weekStart = this.weekStartOf(week);
    const { group, subjects } = await this.groupSubjects(groupId);
    const [members, entries] = await Promise.all([
      this.prisma.groupMember.findMany({
        where: { groupId },
        orderBy: { joinedAt: 'asc' },
        select: {
          studentId: true,
          student: { select: { user: { select: { name: true } } } },
        },
      }),
      this.prisma.feedbackEntry.findMany({
        where: { groupId, weekStart },
        select: {
          studentId: true,
          subjectId: true,
          content: true,
          authorRole: true,
          author: { select: { name: true } },
          updatedAt: true,
        },
      }),
    ]);
    const cells = new Map<string, Map<string, (typeof entries)[number]>>();
    for (const e of entries) {
      if (!cells.has(e.studentId)) cells.set(e.studentId, new Map());
      cells.get(e.studentId)!.set(e.subjectId, e);
    }
    return {
      group: {
        id: group.id,
        name: group.name,
        code: group.code,
        programName: group.program?.name ?? null,
        levelName: group.level?.name ?? null,
      },
      weekStart,
      weekEnd: this.weekEndOf(weekStart),
      subjects,
      students: members.map((m) => ({
        studentId: m.studentId,
        name: m.student.user.name,
        cells: Object.fromEntries(cells.get(m.studentId) ?? new Map()),
      })),
    };
  }

  /** Export matriks feedback ke .xlsx (ExcelJS) — format tabel yang sama. */
  async exportXlsx(actor: AuthenticatedUser, groupId: string, week?: string) {
    const matrix = await this.groupMatrix(actor, groupId, week);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Feedback');
    ws.getCell('A1').value = 'Feedback Mingguan';
    ws.getCell('A2').value = `Kelompok: ${matrix.group.name}${matrix.group.code ? ` (${matrix.group.code})` : ''}`;
    ws.getCell('A3').value = `Minggu: ${fmtDate(matrix.weekStart)} – ${fmtDate(new Date(matrix.weekEnd.getTime() - DAY_MS))}`;
    ws.getRow(5).values = [
      'Nama Siswa',
      ...matrix.subjects.map((s) => s.name),
    ];
    ws.getRow(5).font = { bold: true };
    matrix.students.forEach((st, i) => {
      const row = ws.getRow(6 + i);
      row.values = [
        st.name,
        ...matrix.subjects.map((s) => {
          const c = st.cells[s.id] as { content: string } | undefined;
          return c?.content ?? '';
        }),
      ];
    });
    ws.getColumn(1).width = 28;
    matrix.subjects.forEach((_, i) => {
      ws.getColumn(2 + i).width = 40;
    });
    ws.eachRow((row) => {
      row.alignment = { wrapText: true, vertical: 'top' };
    });
    const buffer = await wb.xlsx.writeBuffer();
    const weekIso = matrix.weekStart.toISOString().slice(0, 10);
    const code = (matrix.group.code ?? matrix.group.name)
      .replace(/[^a-zA-Z0-9-_]+/g, '-')
      .toLowerCase();
    return {
      buffer: Buffer.from(buffer),
      filename: `feedback-${code}-${weekIso}.xlsx`,
      matrix,
    };
  }

  /**
   * Reminder WA per kelompok — 1 pesan per ortu (dedupe per tipe+periode+nomor
   * via unique index outbox). Mengembalikan ringkasan terkirim/dilewati.
   */
  async sendReminder(actor: AuthenticatedUser, groupId: string, type: GroupReminderType) {
    const group = await this.prisma.learningGroup.findUnique({
      where: { id: groupId },
      select: {
        id: true,
        name: true,
        code: true,
        program: { select: { name: true } },
        members: {
          select: {
            studentId: true,
            student: {
              select: {
                user: { select: { name: true } },
                parentStudents: {
                  select: {
                    parent: {
                      select: {
                        id: true,
                        isActive: true,
                        user: { select: { id: true, name: true, phone: true, isActive: true } },
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
    if (!group) throw new NotFoundException('Kelompok tidak ditemukan.');

    // Gabungkan anak-anak per ortu — satu ortu cukup 1 pesan.
    const parents = new Map<
      string,
      { userId: string; name: string; phone: string | null; children: string[] }
    >();
    const memberIds = new Set(group.members.map((m) => m.studentId));
    for (const m of group.members) {
      for (const ps of m.student.parentStudents) {
        const u = ps.parent.user;
        if (!ps.parent.isActive || !u.isActive) continue;
        const cur = parents.get(u.id) ?? {
          userId: u.id,
          name: u.name,
          phone: u.phone,
          children: [],
        };
        cur.children.push(m.student.user.name);
        parents.set(u.id, cur);
      }
    }

    const body = await this.composeReminderBody(group, memberIds, type);
    const periodKey = body.periodKey;
    const eventType = `GROUP_REMINDER_${type.toUpperCase().replace(/-/g, '_')}`;

    let queued = 0;
    let skippedNoPhone = 0;
    let skippedPref = 0;
    let skippedNothing = 0;
    for (const p of parents.values()) {
      const message = body.perParent
        ? body.render(p.children)
        : body.render();
      // Render boleh mengembalikan null (mis. reminder bayar saat ortu tsb
      // tidak punya tagihan) — jangan kirim pesan kosong/"sudah lunas".
      if (!message) {
        skippedNothing += 1;
        continue;
      }
      const row = await this.waOutbox.enqueue({
        phone: p.phone,
        name: p.name,
        userId: p.userId,
        eventType,
        referenceType: 'LearningGroup',
        referenceId: `${groupId}:${periodKey}`,
        message,
      });
      if (row) queued += 1;
      else if (!p.phone?.trim()) skippedNoPhone += 1;
      else skippedPref += 1;
    }
    return {
      type,
      group: { id: group.id, name: group.name },
      periodKey,
      recipients: parents.size,
      queued,
      skippedNoPhone,
      skippedPref,
      skippedNothing,
    };
  }

  private async composeReminderBody(
    group: { id: string; name: string; code: string | null },
    memberIds: Set<string>,
    type: GroupReminderType,
  ) {
    const now = new Date();
    const weekStart = this.weekStartOf(now);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const groupLabel = `${group.name}${group.code ? ` (${group.code})` : ''}`;

    const tpl = await this.settings.get('reminders');

    if (type === 'weekly-schedule') {
      const weekEnd = this.weekEndOf(weekStart);
      const sessions = await this.prisma.session.findMany({
        where: {
          groupId: group.id,
          startsAt: { gte: weekStart, lt: weekEnd },
        },
        orderBy: { startsAt: 'asc' },
        select: {
          startsAt: true,
          endsAt: true,
          status: true,
          subject: { select: { name: true } },
          schedule: { select: { subject: { select: { name: true } } } },
          tutor: { select: { user: { select: { name: true, phone: true } } } },
          room: { select: { name: true } },
        },
      });
      // Catatan tanggal (libur/rapat/darurat) ikut tampil di jadwal mingguan.
      const notes = await this.prisma.dayNote.findMany({
        where: { date: { gte: weekStart, lt: weekEnd } },
        orderBy: { date: 'asc' },
      });
      // Kelompokkan per indeks hari (0=Senin … 6=Minggu) relatif weekStart —
      // kebal timezone karena dihitung dari selisih timestamp, bukan getDay().
      const dayIndex = (t: Date) =>
        Math.floor((t.getTime() - weekStart.getTime()) / DAY_MS);
      const sessionsByDay = new Map<number, typeof sessions>();
      for (const s of sessions) {
        const key = dayIndex(s.startsAt);
        if (key < 0 || key > 6) continue;
        sessionsByDay.set(key, [...(sessionsByDay.get(key) ?? []), s]);
      }
      const notesByDay = new Map<number, typeof notes>();
      for (const n of notes) {
        const key = dayIndex(n.date);
        if (key < 0 || key > 6) continue;
        notesByDay.set(key, [...(notesByDay.get(key) ?? []), n]);
      }
      // Format per-hari Senin s.d. Minggu — jelas dibaca di WA.
      const dayBlocks: string[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(weekStart.getTime() + i * DAY_MS);
        const daySessions = sessionsByDay.get(i) ?? [];
        const dayNotes = notesByDay.get(i) ?? [];
        const lines: string[] = [];
        for (const s of daySessions) {
          const mapel = s.subject?.name ?? s.schedule?.subject?.name;
          lines.push(
            `  • ${fmtTime(s.startsAt)}–${fmtTime(s.endsAt)}` +
              `${mapel ? ` ${mapel}` : ''}` +
              `${s.tutor ? ` — ${s.tutor.user.name}${s.tutor.user.phone ? ` (${s.tutor.user.phone})` : ''}` : ' — tutor menyusul'}` +
              `${s.room ? ` · ${s.room.name}` : ''}` +
              `${s.status === 'CANCELLED' ? ' [DIBATALKAN]' : ''}`,
          );
        }
        for (const n of dayNotes) {
          lines.push(`  ⚑ ${n.type}: ${n.title}${n.note ? ` — ${n.note}` : ''}`);
        }
        if (!lines.length) lines.push('  — tidak ada sesi');
        dayBlocks.push(`*${fmtDate(d)}*\n${lines.join('\n')}`);
      }
      const days = dayBlocks.join('\n\n');
      const week = `${fmtDate(weekStart)} s.d. ${fmtDate(new Date(weekEnd.getTime() - DAY_MS))}`;
      return {
        periodKey: `week:${weekStart.toISOString().slice(0, 10)}`,
        perParent: true,
        render: (children: string[] = []) =>
          renderReminderTemplate(tpl.weeklySchedule, {
            children: children.join(' & '),
            group: groupLabel,
            week,
            days,
          }),
      };
    }

    if (type === 'payment-due') {
      const invoices = await this.prisma.invoice.findMany({
        where: {
          status: 'ISSUED',
          studentId: { in: [...memberIds] },
        },
        select: {
          studentId: true,
          number: true,
          totalAmount: true,
          amountPaid: true,
          dueDate: true,
          student: { select: { user: { select: { name: true } } } },
          // Keterangan program/kelas tagihannya.
          enrollmentLink: {
            select: {
              program: { select: { name: true } },
              level: { select: { name: true } },
              group: { select: { name: true } },
            },
          },
          package: { select: { name: true } },
          items: { select: { description: true }, take: 3 },
        },
      });
      // Kumpulkan tagihan belum lunas per nama anak — HANYA yang belum bayar.
      const byChild = new Map<string, Array<string>>();
      for (const inv of invoices) {
        const sisa = Number(inv.totalAmount) - Number(inv.amountPaid);
        if (sisa <= 0) continue;
        const enr = inv.enrollmentLink;
        const ket =
          inv.package?.name ??
          [enr?.program?.name, enr?.level?.name].filter(Boolean).join(' · ') ??
          inv.items.map((i) => i.description).filter(Boolean).join(', ');
        const due = inv.dueDate ? `, jt. tempo ${fmtDate(inv.dueDate)}` : '';
        const label = `${inv.number} — ${fmtRp(sisa)}${ket ? ` (${ket})` : ''}${due}`;
        byChild.set(inv.student.user.name, [...(byChild.get(inv.student.user.name) ?? []), label]);
      }
      return {
        periodKey: `due:${now.toISOString().slice(0, 7)}`,
        perParent: true,
        render: (children: string[] = []) => {
          const detail = children
            .flatMap((c) => {
              const rows = byChild.get(c) ?? [];
              return rows.map((r) => `• ${c}: ${r}`);
            })
            .join('\n');
          // Ortu yang anaknya tidak punya tagihan tidak dikirimi apa pun.
          if (!detail) return null;
          return renderReminderTemplate(tpl.paymentDue, {
            children: children.join(' & '),
            group: groupLabel,
            detail,
          });
        },
      };
    }

    if (type === 'monthly-performance') {
      const monthLabel = `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;
      const attendances = await this.prisma.attendance.findMany({
        where: {
          studentId: { in: [...memberIds] },
          session: {
            groupId: group.id,
            startsAt: { gte: monthStart, lt: monthEnd },
          },
        },
        select: {
          status: true,
          student: { select: { user: { select: { name: true } } } },
        },
      });
      const recap = new Map<string, Record<string, number>>();
      for (const a of attendances) {
        const name = a.student.user.name;
        const cur = recap.get(name) ?? { HADIR: 0, IZIN: 0, SAKIT: 0, ALPA: 0 };
        cur[a.status] = (cur[a.status] ?? 0) + 1;
        recap.set(name, cur);
      }
      // Hasil ujian bulan ini + ranking dalam kelompok (rata-rata nilai %).
      const attempts = await this.prisma.examAttempt.findMany({
        where: {
          studentId: { in: [...memberIds] },
          status: { in: ['SUBMITTED', 'LOCKED'] },
          submittedAt: { gte: monthStart, lt: monthEnd },
          maxScore: { gt: 0 },
        },
        select: {
          score: true,
          maxScore: true,
          student: { select: { user: { select: { name: true } } } },
          exam: { select: { title: true } },
        },
      });
      const examByChild = new Map<string, { count: number; sumPct: number; best: number }>();
      for (const at of attempts) {
        const name = at.student.user.name;
        const pct = Math.round((at.score / at.maxScore) * 100);
        const cur = examByChild.get(name) ?? { count: 0, sumPct: 0, best: 0 };
        cur.count += 1;
        cur.sumPct += pct;
        cur.best = Math.max(cur.best, pct);
        examByChild.set(name, cur);
      }
      // Ranking: urutkan member berdasarkan rata-rata nilai (yang ada ujiannya).
      const ranking = [...examByChild.entries()]
        .map(([name, e]) => ({ name, avg: Math.round(e.sumPct / e.count) }))
        .sort((a, b) => b.avg - a.avg);
      const rankOf = new Map(ranking.map((r, i) => [r.name, i + 1]));
      return {
        periodKey: `month:${now.toISOString().slice(0, 7)}`,
        perParent: true,
        render: (children: string[] = []) => {
          const detail = children
            .map((c) => {
              const r = recap.get(c);
              const total = r
                ? (r.HADIR ?? 0) + (r.IZIN ?? 0) + (r.SAKIT ?? 0) + (r.ALPA ?? 0)
                : 0;
              const pct = total ? Math.round(((r!.HADIR ?? 0) / total) * 100) : 0;
              const absen = r
                ? `Hadir ${r.HADIR ?? 0}/${total} sesi (${pct}%) — Izin ${r.IZIN ?? 0}, Sakit ${r.SAKIT ?? 0}, Alpa ${r.ALPA ?? 0}`
                : 'belum ada absensi';
              const e = examByChild.get(c);
              const ujian = e
                ? ` | Ujian ${e.count}x, rata² ${Math.round(e.sumPct / e.count)} (terbaik ${e.best})` +
                  ` | Peringkat ${rankOf.get(c)}/${ranking.length}`
                : '';
              return `• ${c}: ${absen}${ujian}`;
            })
            .join('\n');
          return renderReminderTemplate(tpl.monthlyPerformance, {
            children: children.join(' & '),
            group: groupLabel,
            month: monthLabel,
            detail,
          });
        },
      };
    }

    // type === 'feedback' — ajak ortu mengisi feedback mingguan.
    return {
      periodKey: `week:${weekStart.toISOString().slice(0, 10)}`,
      perParent: true,
      render: (children: string[] = []) =>
        renderReminderTemplate(tpl.feedback, {
          children: children.join(' & '),
          group: groupLabel,
        }),
    };
  }
}
