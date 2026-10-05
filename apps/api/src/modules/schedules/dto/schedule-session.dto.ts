// ===========================================================================
// Fase 1c — Schedule & Session DTOs.
// Schedule = template mingguan ("tiap Senin 16:00-17:30"), Session = kejadian
// konkret bertanggal-waktu. Waktu template dinyatakan sebagai menit sejak
// 00:00 (startMin/endMin) supaya mudah divalidasi & di-generate.
// ===========================================================================

import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const DAY_MESSAGE = 'dayOfWeek harus 0 (Minggu) sampai 6 (Sabtu).';

export class CreateScheduleDto {
  @IsUUID('4', { message: 'groupId tidak valid.' })
  groupId: string;

  @IsOptional()
  @IsUUID('4', { message: 'tutorId tidak valid.' })
  tutorId?: string | null;

  @IsOptional()
  @IsUUID('4', { message: 'roomId tidak valid.' })
  roomId?: string | null;

  /** Mapel yang diajar di slot jadwal ini — untuk program paket multi-mapel. */
  @IsOptional()
  @IsUUID('4', { message: 'subjectId tidak valid.' })
  subjectId?: string | null;

  @IsInt()
  @Min(0, { message: DAY_MESSAGE })
  @Max(6, { message: DAY_MESSAGE })
  dayOfWeek: number;

  /** Menit sejak 00:00, mis. 16:00 = 960. */
  @IsInt()
  @Min(0)
  @Max(24 * 60 - 1)
  startMin: number;

  /** Menit sejak 00:00, mis. 17:30 = 1050. */
  @IsInt()
  @Min(1)
  @Max(24 * 60)
  endMin: number;

  /** Tanggal mulai berlaku (YYYY-MM-DD). */
  @IsDateString({}, { message: 'validFrom harus tanggal (YYYY-MM-DD).' })
  validFrom: string;

  /** Tanggal akhir berlaku (opsional). */
  @IsOptional()
  @IsDateString({}, { message: 'validTo harus tanggal (YYYY-MM-DD).' })
  validTo?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateScheduleDto {
  @IsOptional()
  @IsUUID('4', { message: 'tutorId tidak valid.' })
  tutorId?: string | null;

  @IsOptional()
  @IsUUID('4', { message: 'roomId tidak valid.' })
  roomId?: string | null;

  @IsOptional()
  @IsUUID('4', { message: 'subjectId tidak valid.' })
  subjectId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0, { message: DAY_MESSAGE })
  @Max(6, { message: DAY_MESSAGE })
  dayOfWeek?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(24 * 60 - 1)
  startMin?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24 * 60)
  endMin?: number;

  @IsOptional()
  @IsDateString({}, { message: 'validFrom harus tanggal (YYYY-MM-DD).' })
  validFrom?: string;

  @IsOptional()
  @IsDateString({}, { message: 'validTo harus tanggal (YYYY-MM-DD).' })
  validTo?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class GenerateSessionsDto {
  /** Batas akhir generate (YYYY-MM-DD). Default 12 minggu dari validFrom. */
  @IsOptional()
  @IsDateString({}, { message: 'until harus tanggal (YYYY-MM-DD).' })
  until?: string;

  /** true = lewati tanggal yang sudah ada sesinya (idempotent), false = error bila bentrok. */
  @IsOptional()
  @IsBoolean()
  skipExisting?: boolean;

  /**
   * true = hapus dulu sesi SCHEDULED hasil generate jadwal ini yang masih
   * "bersih" (belum ada absensi/override/honor) lalu generate ulang — dipakai
   * saat jadwal diedit supaya sesi lama tidak nyangkut.
   */
  @IsOptional()
  @IsBoolean()
  replaceGenerated?: boolean;
}

export class CreateSessionDto {
  @IsUUID('4', { message: 'groupId tidak valid.' })
  groupId: string;

  @IsOptional()
  @IsUUID('4', { message: 'scheduleId tidak valid.' })
  scheduleId?: string | null;

  @IsOptional()
  @IsUUID('4', { message: 'tutorId tidak valid.' })
  tutorId?: string | null;

  @IsOptional()
  @IsUUID('4', { message: 'roomId tidak valid.' })
  roomId?: string | null;

  /** Mapel sesi ini — kosong = ikut mapel jadwal/level/program. */
  @IsOptional()
  @IsUUID('4', { message: 'subjectId tidak valid.' })
  subjectId?: string | null;

  @IsDateString({}, { message: 'startsAt harus ISO datetime.' })
  startsAt: string;

  @IsDateString({}, { message: 'endsAt harus ISO datetime.' })
  endsAt: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdateSessionDto {
  @IsOptional()
  @IsUUID('4', { message: 'tutorId tidak valid.' })
  tutorId?: string | null;

  @IsOptional()
  @IsUUID('4', { message: 'roomId tidak valid.' })
  roomId?: string | null;

  /** Mapel sesi ini — null untuk kembali mengikuti mapel jadwal/level/program. */
  @IsOptional()
  @IsUUID('4', { message: 'subjectId tidak valid.' })
  subjectId?: string | null;

  @IsOptional()
  @IsDateString({}, { message: 'startsAt harus ISO datetime.' })
  startsAt?: string;

  @IsOptional()
  @IsDateString({}, { message: 'endsAt harus ISO datetime.' })
  endsAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;

  /** Hanya SCHEDULED / CANCELLED di fase ini (COMPLETED milik Fase 1d). */
  @IsOptional()
  @IsString()
  status?: 'SCHEDULED' | 'CANCELLED';
}

export class UpsertSessionOverrideDto {
  @IsUUID('4', { message: 'studentId tidak valid.' })
  studentId: string;

  @IsOptional()
  @IsDateString({}, { message: 'startsAt harus ISO datetime.' })
  startsAt?: string | null;

  @IsOptional()
  @IsDateString({}, { message: 'endsAt harus ISO datetime.' })
  endsAt?: string | null;

  @IsOptional()
  @IsUUID('4', { message: 'roomId tidak valid.' })
  roomId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

export class SessionsQueryDto {
  @IsOptional()
  @IsUUID('4', { message: 'groupId tidak valid.' })
  groupId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'tutorId tidak valid.' })
  tutorId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'studentId tidak valid.' })
  studentId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'roomId tidak valid.' })
  roomId?: string;

  @IsOptional()
  @IsDateString({}, { message: 'from harus ISO datetime.' })
  from?: string;

  @IsOptional()
  @IsDateString({}, { message: 'to harus ISO datetime.' })
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  take?: number;
}
