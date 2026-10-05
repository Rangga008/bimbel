import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Pendaftaran mandiri orang tua dari landing page (`/daftar`).
 * Tidak ada studentIds — anak ditambahkan ortu setelah login (atau oleh admin).
 */
export class RegisterParentDto {
  @IsEmail({}, { message: 'Email tidak valid.' })
  email: string;

  @IsString()
  @MinLength(3, { message: 'Nama minimal 3 karakter.' })
  @MaxLength(100)
  name: string;

  /** Wajib — dipakai untuk login via HP dan notifikasi WhatsApp. */
  @IsString()
  @MinLength(9, { message: 'Nomor HP minimal 9 digit.' })
  @MaxLength(30)
  phone: string;

  @IsString()
  @MinLength(8, { message: 'Kata sandi minimal 8 karakter.' })
  @MaxLength(100)
  password: string;
}
