import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';

export enum ExamStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  LOCKED = 'LOCKED',
  ENDED = 'ENDED',
}

/** Subtes (bagian per mapel ala UTBK) dalam ujian. */
export class ExamSubtesDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  subjectId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  /** Durasi subtes dalam menit — timer jalan saat siswa mulai subtes. */
  @IsInt()
  @Min(1, { message: 'Durasi subtes minimal 1 menit.' })
  durationMinutes: number;
}

/** Item soal ujian — subtesIdx menunjuk indeks pada array `subtes`. */
export class ExamItemDto {
  @IsString()
  questionId: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  points?: number;

  /** Indeks subtes (0-based) pada array subtes di request yang sama. */
  @IsOptional()
  @IsInt()
  @Min(0)
  subtesIdx?: number | null;
}

export class CreateExamDto {
  @IsOptional()
  @IsUUID('4', { message: 'programId tidak valid.' })
  programId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'levelId tidak valid.' })
  levelId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'subjectId tidak valid.' })
  subjectId?: string;

  @IsOptional()
  @IsString()
  // Kategori ujian tidak valid.
  category?: string;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsDateString()
  scheduledStartAt: string;

  @IsDateString()
  scheduledEndAt: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  durationMinutes?: number;

  /** Proteksi fullscreen+kunci saat siswa keluar (default true). */
  @IsOptional()
  @IsBoolean()
  proctoringEnabled?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;

  /** Soal mode biasa — opsional bila `items` (mode subtes) dikirim. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  questionIds?: string[];

  @IsOptional()
  @IsArray()
  points?: number[]; // Points per question (same length as questionIds)

  /** Item soal ber-subtes — bila dikirim, menimpa questionIds/points. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExamItemDto)
  items?: ExamItemDto[];

  /** Daftar subtes try out (kosong = ujian biasa tanpa subtes). */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExamSubtesDto)
  subtes?: ExamSubtesDto[];

  /** Kelompok target — kosong/tidak dikirim = terbuka sesuai scope taksonomi. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  groupIds?: string[];

  /** true = hasil & kunci langsung terlihat setelah submit. */
  @IsOptional()
  @IsBoolean()
  showResultImmediately?: boolean;

  /** true = tampil di halaman publik /tryout (promosi peserta luar). */
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

export class UpdateExamDto {
  @IsOptional()
  @IsUUID('4', { message: 'programId tidak valid.' })
  programId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'levelId tidak valid.' })
  levelId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'subjectId tidak valid.' })
  subjectId?: string;

  @IsOptional()
  @IsString()
  // Kategori ujian tidak valid.
  category?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  scheduledStartAt?: string;

  @IsOptional()
  @IsDateString()
  scheduledEndAt?: string;

  @IsOptional()
  @IsEnum(ExamStatus)
  status?: ExamStatus;

  @IsOptional()
  @IsInt()
  @Min(0)
  durationMinutes?: number;

  @IsOptional()
  @IsBoolean()
  proctoringEnabled?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  questionIds?: string[];

  @IsOptional()
  @IsArray()
  points?: number[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExamItemDto)
  items?: ExamItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExamSubtesDto)
  subtes?: ExamSubtesDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  groupIds?: string[];

  @IsOptional()
  @IsBoolean()
  showResultImmediately?: boolean;

  /** true = tampil di halaman publik /tryout (promosi peserta luar). */
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

export class RedeemExamCodeDto {
  @IsString()
  code!: string;
}
