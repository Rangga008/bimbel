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

export class CreateRoomDto {
  @IsString()
  @MinLength(2, { message: 'Nama ruangan minimal 2 karakter.' })
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsUUID('4', { message: 'buildingId tidak valid.' })
  buildingId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1, { message: 'Kapasitas minimal 1.' })
  capacity?: number | null;

  /** URL/path foto ruangan (mis. /api/media/<id>/file dari pustaka gambar). */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  photoUrl?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/** PATCH parsial — semua field opsional (service menjaga nilai lama). */
export class UpdateRoomDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Nama ruangan minimal 2 karakter.' })
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsUUID('4', { message: 'buildingId tidak valid.' })
  buildingId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1, { message: 'Kapasitas minimal 1.' })
  capacity?: number | null;

  /** URL/path foto ruangan (mis. /api/media/<id>/file dari pustaka gambar). */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  photoUrl?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
