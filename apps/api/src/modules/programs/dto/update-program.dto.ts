import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';
import { ProgramCategory } from '@prisma/client';

export class UpdateProgramDto {
  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'Nama program minimal 3 karakter.' })
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(30)
  code?: string;

  /** Mapel dari master data. Kirim null untuk melepas mapel dari program. */
  @IsOptional()
  @IsUUID('4', { message: 'subjectId tidak valid.' })
  subjectId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsEnum(ProgramCategory)
  category?: ProgramCategory;

  /** Biaya pendaftaran — kirim null untuk menghapus. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  registrationFee?: number | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
