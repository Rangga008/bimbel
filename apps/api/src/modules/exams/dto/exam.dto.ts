import { IsArray, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export enum ExamStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  LOCKED = 'LOCKED',
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

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @IsString({ each: true })
  questionIds: string[];

  @IsOptional()
  @IsArray()
  points?: number[]; // Points per question (same length as questionIds)
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
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  questionIds?: string[];

  @IsOptional()
  @IsArray()
  points?: number[];
}
