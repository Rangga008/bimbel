import {
  IsEmail,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

/**
 * Pendaftaran mandiri orang tua dari landing page (`/daftar`).
 * Tidak ada studentIds — anak ditambahkan ortu setelah login (atau oleh admin).
 * Identitas = nomor HP ATAU email (minimal salah satu); bila email kosong
 * sistem membuat placeholder dari nomor HP agar kolom unik `users.email`
 * tetap terisi.
 */
export class RegisterParentDto {
  /** Opsional — divalidasi hanya bila diisi (wajib salah satu ditegakkan field phone). */
  @ValidateIf((o: RegisterParentDto) => o.email !== undefined && o.email !== '')
  @IsEmail({}, { message: 'Email tidak valid.' })
  email?: string;

  @IsString()
  @MinLength(3, { message: 'Nama minimal 3 karakter.' })
  @MaxLength(100)
  name: string;

  /** Wajib bila email kosong — dipakai untuk login via HP dan notifikasi WA. */
  @ValidateIf((o: RegisterParentDto) => !o.email?.trim())
  @IsString({ message: 'Isi nomor HP atau email — minimal salah satu.' })
  @MinLength(9, { message: 'Nomor HP minimal 9 digit.' })
  @MaxLength(30)
  phone?: string;

  @IsString()
  @MinLength(8, { message: 'Kata sandi minimal 8 karakter.' })
  @MaxLength(100)
  password: string;
}
