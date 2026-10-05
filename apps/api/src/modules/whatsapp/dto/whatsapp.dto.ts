// Fase 5b — DTO endpoint admin WhatsApp outbox.
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Enqueue pesan uji ke outbox (dev/demo DoD — provider saat ini log-only). */
export class TestWhatsAppDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  phone!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message!: string;
}
