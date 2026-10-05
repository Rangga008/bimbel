import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

// Catatan: questionId/optionId TIDAK divalidasi sebagai UUID v4 murni (@IsString saja).
// Question/QuestionOption.id di skema Prisma adalah kolom String biasa (default uuid()),
// bukan tipe UUID yang dipaksa DB — data seed/demo memakai literal non-UUID (mis. "seed-q1").
// Validasi referensial sebenarnya (soal/opsi ada & aktif) tetap dilakukan di service layer.

export class CreateLatsolPackageDto {
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
  // Kategori paket tidak valid.
  category?: string;

  @IsString()
  @IsNotEmpty({ message: 'Judul paket latsol wajib diisi.' })
  @MaxLength(200, { message: 'Judul maksimal 200 karakter.' })
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Deskripsi maksimal 1000 karakter.' })
  description?: string;

  @IsArray({ message: 'questionIds harus berupa array.' })
  @IsString({ each: true, message: 'Setiap questionId harus string valid.' })
  @IsNotEmpty({ message: 'Paket latsol minimal berisi 1 soal.' })
  questionIds: string[];
}

export class UpdateLatsolPackageDto {
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
  // Kategori paket tidak valid.
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Judul maksimal 200 karakter.' })
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Deskripsi maksimal 1000 karakter.' })
  description?: string;

  @IsOptional()
  isActive?: boolean;

  @IsOptional()
  @IsArray({ message: 'questionIds harus berupa array.' })
  @IsString({ each: true, message: 'Setiap questionId harus string valid.' })
  questionIds?: string[];
}

export class AnswerItemDto {
  @IsString({ message: 'questionId tidak valid.' })
  questionId: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true, message: 'Setiap optionId harus string valid.' })
  selectedOptionIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Jawaban teks maksimal 2000 karakter.' })
  textAnswer?: string;
}

export class SubmitLatsolDto {
  @IsOptional()
  @Type(() => AnswerItemDto)
  @ValidateNested({ each: true })
  @IsArray()
  answers?: AnswerItemDto[];
}

export class SaveAnswerDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true, message: 'Setiap optionId harus string valid.' })
  selectedOptionIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Jawaban teks maksimal 2000 karakter.' })
  textAnswer?: string;
}

export class GradeEssayDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Skor tidak valid.' })
  score?: number;

  @IsOptional()
  isCorrect?: boolean;
}
