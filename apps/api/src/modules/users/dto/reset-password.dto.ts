import { IsString, MaxLength, MinLength } from 'class-validator';

/** Fase 0b — reset password oleh admin menghasilkan password baru. */
export class ResetPasswordDto {
  @IsString()
  @MinLength(8, { message: 'Kata sandi baru minimal 8 karakter.' })
  @MaxLength(100)
  newPassword: string;
}
