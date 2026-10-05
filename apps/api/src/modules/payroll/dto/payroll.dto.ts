import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export const TUTOR_WORK_TYPES = [
  'REGULAR_SESSION',
  'PRIVATE_SESSION',
  'EXTRA_CLASS',
  'SPECIAL_TASK',
] as const;
export type TutorWorkTypeValue = (typeof TUTOR_WORK_TYPES)[number];

export const RATE_UNITS = ['SESSION', 'HOUR'] as const;
export type RateUnit = (typeof RATE_UNITS)[number];

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export class CreateTutorRateDto {
  @IsUUID('4', { message: 'tutorId tidak valid.' })
  tutorId: string;

  @IsIn(TUTOR_WORK_TYPES, { message: 'Jenis kerja tidak valid.' })
  workType: TutorWorkTypeValue;

  @Type(() => Number)
  @IsNumber({}, { message: 'Nominal tarif tidak valid.' })
  @Min(0, { message: 'Nominal tarif minimal Rp 0.' })
  amount: number;

  @IsOptional()
  @IsIn(RATE_UNITS, { message: 'Unit tarif harus SESSION atau HOUR.' })
  unit?: RateUnit;

  @IsString()
  @IsNotEmpty({ message: 'Tanggal mulai berlaku wajib diisi.' })
  effectiveFrom: string; // ISO date

  @IsOptional()
  @IsString()
  effectiveTo?: string; // ISO date; string kosong/null = tanpa batas
}

export class UpdateTutorRateDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Nominal tarif tidak valid.' })
  @Min(0, { message: 'Nominal tarif minimal Rp 0.' })
  amount?: number;

  @IsOptional()
  @IsIn(RATE_UNITS, { message: 'Unit tarif harus SESSION atau HOUR.' })
  unit?: RateUnit;

  @IsOptional()
  @IsString()
  effectiveFrom?: string;

  /** Kirim null/string kosong untuk menghapus batas akhir. */
  @IsOptional()
  @IsString()
  effectiveTo?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class GenerateWorkItemsDto {
  @Matches(PERIOD_RE, { message: 'Format periode harus YYYY-MM.' })
  period: string;

  @IsOptional()
  @IsUUID('4', { message: 'tutorId tidak valid.' })
  tutorId?: string;
}

/** Work item manual — hanya untuk SPECIAL_TASK (tugas khusus tanpa sesi). */
export class CreateManualWorkItemDto {
  @IsUUID('4', { message: 'tutorId tidak valid.' })
  tutorId: string;

  @IsString()
  @IsNotEmpty({ message: 'Deskripsi tugas wajib diisi.' })
  @MaxLength(500, { message: 'Deskripsi maksimal 500 karakter.' })
  description: string;

  @IsString()
  @IsNotEmpty({ message: 'Tanggal kerja wajib diisi.' })
  occurredAt: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Kuantitas tidak valid.' })
  @Min(0.01, { message: 'Kuantitas minimal 0.01.' })
  quantity?: number;

  /** Opsional — bila kosong dipakai tarif SPECIAL_TASK yang berlaku. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Nominal per unit tidak valid.' })
  @Min(0, { message: 'Nominal per unit minimal Rp 0.' })
  unitAmount?: number;
}

export class UpdateWorkItemDto {
  @IsOptional()
  @IsIn(TUTOR_WORK_TYPES, { message: 'Jenis kerja tidak valid.' })
  workType?: TutorWorkTypeValue;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Kuantitas tidak valid.' })
  @Min(0.01, { message: 'Kuantitas minimal 0.01.' })
  quantity?: number;

  /** Override nominal per unit manual — melepas referensi rate. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Nominal per unit tidak valid.' })
  @Min(0, { message: 'Nominal per unit minimal Rp 0.' })
  unitAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Deskripsi maksimal 500 karakter.' })
  description?: string;
}

export class GeneratePayrollRunsDto {
  @Matches(PERIOD_RE, { message: 'Format periode harus YYYY-MM.' })
  period: string;

  @IsOptional()
  @IsUUID('4', { message: 'tutorId tidak valid.' })
  tutorId?: string;
}

export class RepriceWorkItemsDto {
  @Matches(PERIOD_RE, { message: 'Format periode harus YYYY-MM.' })
  period: string;

  @IsOptional()
  @IsUUID('4', { message: 'tutorId tidak valid.' })
  tutorId?: string;
}

export class CreateAdjustmentDto {
  @Type(() => Number)
  @IsNumber({}, { message: 'Nominal adjustment tidak valid.' })
  amount: number; // boleh negatif; nol ditolak di service

  @IsString()
  @IsNotEmpty({ message: 'Alasan adjustment wajib diisi.' })
  @MaxLength(500, { message: 'Alasan maksimal 500 karakter.' })
  reason: string;
}

export class PayPayrollRunDto {
  @IsUUID('4', { message: 'accountId tidak valid.' })
  accountId: string;
}
