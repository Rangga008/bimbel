// ===========================================================================
// Fase 1d — Attendance DTOs. Status: HADIR/TERLAMBAT/IZIN/SAKIT/ALFA.
// Input bulk 1 sesi penuh (semua siswa kelompok) oleh tutor.
// ===========================================================================
import { IsArray, IsIn, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export const ATTENDANCE_STATUSES = ['HADIR', 'TERLAMBAT', 'IZIN', 'SAKIT', 'ALFA'] as const;
export type AttendanceStatusDto = (typeof ATTENDANCE_STATUSES)[number];

export class AttendanceItemDto {
  @IsUUID('4', { message: 'studentId tidak valid.' })
  studentId: string;

  @IsIn([...ATTENDANCE_STATUSES], { message: 'Status kehadiran tidak valid.' })
  status!: AttendanceStatusDto;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string | null;
}

export class MarkAttendanceBulkDto {
  @IsArray({ message: 'items harus array.' })
  @ValidateNested({ each: true })
  @Type(() => AttendanceItemDto)
  items!: AttendanceItemDto[];
}

export class MarkTutorAttendanceDto {
  @IsIn([...ATTENDANCE_STATUSES], { message: 'Status kehadiran tidak valid.' })
  status!: AttendanceStatusDto;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string | null;
}

export class CorrectAttendanceDto {
  @IsIn([...ATTENDANCE_STATUSES], { message: 'Status kehadiran tidak valid.' })
  status!: AttendanceStatusDto;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string | null;
}

export class AttendanceRecapQueryDto {
  @IsOptional()
  @IsUUID('4', { message: 'studentId tidak valid.' })
  studentId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'groupId tidak valid.' })
  groupId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'tutorId tidak valid.' })
  tutorId?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}
