import { IsEmail, IsOptional, IsString } from 'class-validator';

export class ForgotPasswordDto {
  /** Email atau nomor HP akun. */
  @IsOptional()
  @IsString()
  identifier?: string;

  /** Kompatibilitas request lama yang masih mengirim field `email`. */
  @IsOptional()
  @IsEmail()
  email?: string;
}
