// Conflict detection: tutor / siswa / ruangan bentrok waktu.
// Dipakai SchedulesService & SessionsService sebelum create/update/generate.
// Semua cek mengabaikan sesi CANCELLED.
import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface TimeRange {
  startsAt: Date;
  endsAt: Date;
}

export interface SessionCandidate extends TimeRange {
  excludeSessionId?: string;
  tutorId?: string | null;
  roomId?: string | null;
  groupId: string;
}

export interface OverrideCandidate extends TimeRange {
  excludeSessionId: string;
  studentId: string;
  roomId?: string | null;
}

export function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
  return a.startsAt.getTime() < b.endsAt.getTime() && b.startsAt.getTime() < a.endsAt.getTime();
}

export function fmtRange(start: Date, end: Date): string {
  const d = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const t = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' });
  return `${d.format(start)}-${t.format(end)}`;
}

@Injectable()
export class ConflictService {
  constructor(private readonly prisma: PrismaService) {}

  async assertNoSessionConflict(c: SessionCandidate): Promise<void> {
    if (c.startsAt.getTime() >= c.endsAt.getTime()) {
      throw new ConflictException('Waktu selesai harus setelah waktu mulai.');
    }
    const overlapping = await this.prisma.session.findMany({
      where: {
        status: { not: 'CANCELLED' },
        startsAt: { lt: c.endsAt },
        endsAt: { gt: c.startsAt },
        ...(c.excludeSessionId ? { id: { not: c.excludeSessionId } } : {}),
      },
      select: {
        id: true,
        groupId: true,
        tutorId: true,
        roomId: true,
        startsAt: true,
        endsAt: true,
        group: { select: { name: true, members: { select: { studentId: true } } } },
        tutor: { select: { user: { select: { name: true } } } },
        room: { select: { name: true } },
      },
      take: 200,
    });
    const clashes = overlapping.filter((s) => rangesOverlap(s, c));
    if (c.tutorId) {
      const hit = clashes.find((s) => s.tutorId === c.tutorId);
      if (hit) {
        const name = hit.tutor?.user.name ?? 'Tutor tersebut';
        throw new ConflictException(`${name} sudah mengajar "${hit.group.name}" pada ${fmtRange(hit.startsAt, hit.endsAt)}.`);
      }
    }
    const memberIds = await this.memberIdsOf(c.groupId);
    if (memberIds.length > 0) {
      const other = clashes.find(
        (s) => s.groupId !== c.groupId && s.group.members.some((m) => memberIds.includes(m.studentId)),
      );
      if (other) {
        throw new ConflictException(`Ada siswa kelompok ini yang terjadwal di "${other.group.name}" pada ${fmtRange(other.startsAt, other.endsAt)}.`);
      }
      const same = clashes.find((s) => s.groupId === c.groupId);
      if (same && !c.excludeSessionId) {
        throw new ConflictException(`Kelompok ini sudah punya sesi pada ${fmtRange(same.startsAt, same.endsAt)}.`);
      }
    }
    if (c.roomId) {
      const hit = clashes.find((s) => s.roomId === c.roomId);
      if (hit) {
        const name = hit.room?.name ?? 'Ruangan tersebut';
        throw new ConflictException(`${name} sudah dipakai "${hit.group.name}" pada ${fmtRange(hit.startsAt, hit.endsAt)}.`);
      }
    }
  }

  async assertNoOverrideConflict(c: OverrideCandidate): Promise<void> {
    const overlapping = await this.prisma.session.findMany({
      where: {
        status: { not: 'CANCELLED' },
        startsAt: { lt: c.endsAt },
        endsAt: { gt: c.startsAt },
        id: { not: c.excludeSessionId },
      },
      select: {
        id: true,
        roomId: true,
        startsAt: true,
        endsAt: true,
        group: { select: { name: true, members: { select: { studentId: true } } } },
        room: { select: { name: true } },
      },
      take: 200,
    });
    const clashes = overlapping.filter((s) => rangesOverlap(s, c));
    const studentClash = clashes.find((s) => s.group.members.some((m) => m.studentId === c.studentId));
    if (studentClash) {
      throw new ConflictException(`Siswa ini sudah terjadwal di "${studentClash.group.name}" pada ${fmtRange(studentClash.startsAt, studentClash.endsAt)}.`);
    }
    if (c.roomId) {
      const roomClash = clashes.find((s) => s.roomId === c.roomId);
      if (roomClash) {
        const name = roomClash.room?.name ?? 'Ruangan tersebut';
        throw new ConflictException(`${name} sudah dipakai "${roomClash.group.name}" pada ${fmtRange(roomClash.startsAt, roomClash.endsAt)}.`);
      }
    }
  }

  private async memberIdsOf(groupId: string): Promise<string[]> {
    const members = await this.prisma.groupMember.findMany({ where: { groupId }, select: { studentId: true } });
    return members.map((m) => m.studentId);
  }
}
