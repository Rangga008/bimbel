import { Type } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateMaterialDto {
  @IsOptional()
  @IsUUID('4', { message: 'programId tidak valid.' })
  programId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'levelId tidak valid.' })
  levelId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'groupId tidak valid.' })
  groupId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'subjectId tidak valid.' })
  subjectId?: string;

  @IsOptional()
  @IsString()
  // Kategori materi tidak valid.
  category?: string;

  @IsString()
  @IsNotEmpty({ message: 'Judul materi wajib diisi.' })
  @MaxLength(200, { message: 'Judul maksimal 200 karakter.' })
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Deskripsi maksimal 1000 karakter.' })
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000, { message: 'Isi materi maksimal 20000 karakter.' })
  content?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'URL gambar maksimal 500 karakter.' })
  imageUrl?: string;
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'URL file maksimal 500 karakter.' })
  fileUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Tipe file maksimal 100 karakter.' })
  fileType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Ukuran file tidak valid.' })
  fileSize?: number;
}

export class UpdateMaterialDto {
  @IsOptional()
  @IsUUID('4', { message: 'programId tidak valid.' })
  programId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'levelId tidak valid.' })
  levelId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'groupId tidak valid.' })
  groupId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'subjectId tidak valid.' })
  subjectId?: string;

  @IsOptional()
  @IsString()
  // Kategori materi tidak valid.
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
  @IsString()
  @MaxLength(20000, { message: 'Isi materi maksimal 20000 karakter.' })
  content?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'URL gambar maksimal 500 karakter.' })
  imageUrl?: string;
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'URL file maksimal 500 karakter.' })
  fileUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Tipe file maksimal 100 karakter.' })
  fileType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Ukuran file tidak valid.' })
  fileSize?: number;

  @IsOptional()
  isActive?: boolean;
}