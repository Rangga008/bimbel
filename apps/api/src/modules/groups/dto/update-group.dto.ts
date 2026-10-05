import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';

export class UpdateGroupDto {
  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'Nama kelompok minimal 3 karakter.' })
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  code?: string | null;

  @IsOptional()
  @IsUUID('4', { message: 'programId tidak valid.' })
  programId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'levelId tidak valid.' })
  levelId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1, { message: 'Kapasitas minimal 1.' })
  capacity?: number | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
