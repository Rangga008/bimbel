import { Type } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, MaxLength, ValidateNested, IsArray } from 'class-validator';
import { QuestionType } from "@prisma/client";

export class CreateQuestionOptionDto {
  /** id opsi existing — diisi saat update agar ID opsi tetap stabil
   *  (jawaban siswa menyimpan optionId). */
  @IsOptional()
  @IsUUID('4', { message: 'id opsi tidak valid.' })
  id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Konten opsi maksimal 500 karakter.' })
  content?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'URL gambar opsi maksimal 500 karakter.' })
  imageUrl?: string;

  @IsOptional()
  isCorrect?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Sort order tidak valid.' })
  sortOrder?: number;
}

export class CreateQuestionDto {
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
  // Kategori soal tidak valid.
  category?: string;

  @IsEnum(QuestionType, { message: 'Tipe soal tidak valid.' })
  type: QuestionType;

  @IsString()
  @IsNotEmpty({ message: 'Konten soal wajib diisi.' })
  @MaxLength(2000, { message: 'Konten soal maksimal 2000 karakter.' })
  content: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'URL gambar maksimal 500 karakter.' })
  imageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20, { message: 'Tingkat kesulitan maksimal 20 karakter.' })
  difficulty?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Poin tidak valid.' })
  points?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Pembahasan maksimal 2000 karakter.' })
  explanation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'URL gambar pembahasan maksimal 500 karakter.' })
  explanationImageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Kunci isian singkat maksimal 500 karakter.' })
  answerKey?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuestionOptionDto)
  options?: CreateQuestionOptionDto[];
}

export class UpdateQuestionDto {
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
  // Kategori soal tidak valid.
  category?: string;

  @IsOptional()
  @IsEnum(QuestionType, { message: 'Tipe soal tidak valid.' })
  type?: QuestionType;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Konten soal maksimal 2000 karakter.' })
  content?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'URL gambar maksimal 500 karakter.' })
  imageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20, { message: 'Tingkat kesulitan maksimal 20 karakter.' })
  difficulty?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Poin tidak valid.' })
  points?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Pembahasan maksimal 2000 karakter.' })
  explanation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'URL gambar pembahasan maksimal 500 karakter.' })
  explanationImageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Kunci isian singkat maksimal 500 karakter.' })
  answerKey?: string;

  @IsOptional()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuestionOptionDto)
  options?: CreateQuestionOptionDto[];
}