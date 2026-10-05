// Generate Session konkret dari 1 Schedule (template mingguan).
import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ConflictService } from './conflict.service';
import { SchedulesService, addWeeks, minutesToDate, parseDateOnlyEnd } from './schedules.service';
import { GenerateSessionsDto } from './dto/schedule-session.dto';

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

@Injectable()
export class SessionGenerateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schedules: SchedulesService,
    private readonly conflicts: ConflictService,
  ) {}

  async generate(id: string, dto: GenerateSessionsDto) {
    const schedule = await this.schedules.get(id);
    const until = dto.until ? parseDateOnlyEnd(dto.until) : addWeeks(schedule.validFrom, 12);
    const end = schedule.validTo && schedule.validTo < until ? schedule.validTo : until;
    if (end < schedule.validFrom) throw new BadRequestException('Rentang generate kosong.');
    // Batas paket kelompok (mis. "24 sesi"): generate hanya sampai kuota sesi
    // kelompok terpenuhi — menghitung semua sesi non-CANCELLED milik grup.
    const packageCap = schedule.group.package?.totalSessions ?? null;
    let groupSessionCount = 0;
    if (packageCap) {
      groupSessionCount = await this.prisma.session.count({
        where: { groupId: schedule.groupId, status: { not: 'CANCELLED' } },
      });
    }
    // Mode ganti: buang sesi hasil generate yang masih bersih (belum ada
    // absensi siswa/tutor, override susulan, atau honor) — data bertanggal
    // penting tidak pernah dihapus.
    let removed = 0;
    if (dto.replaceGenerated) {
      const del = await this.prisma.session.deleteMany({
        where: {
          scheduleId: id,
          status: 'SCHEDULED',
          startsAt: { gte: schedule.validFrom, lte: end },
          attendances: { none: {} },
          tutorAttendances: { none: {} },
          overrides: { none: {} },
          workItems: { none: {} },
        },
      });
      removed = del.count;
    }
    const dates: Date[] = [];
    const cursor = new Date(schedule.validFrom);
    cursor.setHours(0, 0, 0, 0);
    while (cursor <= end) {
      if (cursor.getDay() === schedule.dayOfWeek) dates.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
      if (dates.length > 200) break;
    }
    let created = 0;
    let skipped = 0;
    const failed: Array<{ date: string; reason: string }> = [];
    for (const day of dates) {
      if (packageCap !== null && groupSessionCount + created >= packageCap) break;
      const startsAt = minutesToDate(day, schedule.startMin);
      const endsAt = minutesToDate(day, schedule.endMin);
      const exists = await this.prisma.session.findFirst({
        where: { scheduleId: id, startsAt },
        select: { id: true, status: true },
      });
      if (exists && exists.status !== 'CANCELLED') {
        skipped += 1;
        continue;
      }
      try {
        await this.conflicts.assertNoSessionConflict({
          groupId: schedule.groupId,
          tutorId: schedule.tutorId,
          roomId: schedule.roomId,
          startsAt,
          endsAt,
        });
      } catch (e) {
        if (dto.skipExisting) {
          skipped += 1;
          continue;
        }
        failed.push({ date: startsAt.toISOString(), reason: e instanceof Error ? e.message : 'Bentrok.' });
        continue;
      }
      // Sesi CANCELLED di tanggal ini (mis. sisa jadwal yang sempat
      // dinonaktifkan) dihidupkan lagi — disinkronkan ke tutor/ruangan/
      // jam jadwal terkini, data absensi historisnya tetap utuh.
      if (exists) {
        await this.prisma.session.update({
          where: { id: exists.id },
          data: {
            status: 'SCHEDULED',
            tutorId: schedule.tutorId,
            roomId: schedule.roomId,
            endsAt,
          },
        });
      } else {
        await this.prisma.session.create({
          data: {
            groupId: schedule.groupId,
            scheduleId: id,
            tutorId: schedule.tutorId,
            roomId: schedule.roomId,
            startsAt,
            endsAt,
          },
        });
      }
      created += 1;
    }
    return { scheduleId: id, dayName: DAY_NAMES[schedule.dayOfWeek], total: dates.length, created, skipped, removed, failed };
  }
}
