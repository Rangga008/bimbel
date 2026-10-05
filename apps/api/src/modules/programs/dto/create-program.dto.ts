import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';
import { ProgramCategory } from '@prisma/client';

export class CreateProgramDto {
  @IsString()
  @MinLength(3, { message: 'Nama program minimal 3 karakter.' })
  @MaxLength(100)
  name: string;

  @IsString()
  @MinLength(2, { message: 'Kode program minimal 2 karakter.' })
  @MaxLength(30)
  code: string;

  /** Mapel dari master data (dropdown) — program tersinkron ke kode mapel. */
  @IsOptional()
  @IsUUID('4', { message: 'subjectId tidak valid.' })
  subjectId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  /** Kategori kelas sesuai brosur — default REGULER. */
  @IsOptional()
  @IsEnum(ProgramCategory)
  category?: ProgramCategory;

  /** Biaya pendaftaran sekali bayar saat enrollment (Rp). */
  @IsOptional()
  @IsNumber()
  @Min(0)
  registrationFee?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
