// ===========================================================================
// Fase 1d — Notification skeleton DTOs (in-app saja, WA menyusul Fase 5).
// ===========================================================================
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateNotificationDto {
  @IsString()
  userId!: string;

  @IsString()
  @MaxLength(150)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  body?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  link?: string;
}

export class UpdatePreferenceDto {
  @IsOptional()
  @IsBoolean()
  inAppEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  attendanceAlert?: boolean;

  @IsOptional()
  @IsBoolean()
  scheduleAlert?: boolean;

  /** Fase 5b — matikan antrean WhatsApp ke nomor user ini. */
  @IsOptional()
  @IsBoolean()
  whatsAppEnabled?: boolean;
}
