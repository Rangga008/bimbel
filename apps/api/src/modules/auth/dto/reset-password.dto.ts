import { IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class ResetPasswordDto {
  /** Token link lama (tetap didukung untuk email reset yang sudah terkirim). */
  @IsOptional()
  @IsString()
  token?: string;

  /** Email atau nomor HP yang dipakai saat meminta OTP. */
  @IsOptional()
  @IsString()
  identifier?: string;

  /** Kode OTP 6 digit dari email/WhatsApp. */
  @IsOptional()
  @Matches(/^\d{6}$/, { message: 'Kode OTP harus 6 digit angka.' })
  otp?: string;

  @IsString()
  @MinLength(8, { message: 'Kata sandi baru minimal 8 karakter.' })
  newPassword: string;
}
