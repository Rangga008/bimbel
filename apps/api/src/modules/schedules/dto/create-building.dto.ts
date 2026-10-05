// ===========================================================================
// Fase 1c — Buildings & Rooms (CRUD minimal untuk conflict detection ruangan)
// ===========================================================================

import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateBuildingDto {
  @IsString()
  @MinLength(3, { message: 'Nama gedung minimal 3 karakter.' })
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
