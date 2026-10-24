import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

/**
 * Pendaftaran mandiri SISWA dari luar bimbel (`/daftar-siswa`) — mis. untuk
 * try out/promosi. Identitas utama = nomor HP; email opsional (placeholder
 * dari HP bila kosong). `joinCode` opsional: bila diisi dan cocok dengan
 * kode gabung sebuah kelompok, siswa langsung jadi anggota kelompok itu
 * dan bisa mengerjakan ujian yang ditugaskan ke kelompok tersebut.
 */
export class RegisterStudentDto {
  @IsString()
  @MinLength(3, { message: 'Nama minimal 3 karakter.' })
  @MaxLength(100)
  name: string;

  /** Wajib — dipakai untuk login via HP. */
  @IsString()
  @MinLength(9, { message: 'Nomor HP minimal 9 digit.' })
  @MaxLength(30)
  phone: string;

  @IsString()
  @MinLength(8, { message: 'Kata sandi minimal 8 karakter.' })
  @MaxLength(100)
  password: string;

  @ValidateIf((o: RegisterStudentDto) => !!o.email)
  @IsEmail({}, { message: 'Email tidak valid.' })
  email?: string;

  /** Kode gabung kelompok (opsional) — salah kode ditolak 400. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  joinCode?: string;
}
