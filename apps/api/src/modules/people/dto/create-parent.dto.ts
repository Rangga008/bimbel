import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateParentDto {
  @IsEmail({}, { message: 'Email orang tua tidak valid.' })
  email: string;

  @IsString()
  @MinLength(3, { message: 'Nama minimal 3 karakter.' })
  @MaxLength(100)
  name: string;

  /** Opsional — bila kosong backend generate temporary password aman (dikembalikan sekali). */
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'Kata sandi minimal 8 karakter.' })
  @MaxLength(100)
  password?: string;

  /** Wajib — nomor HP dipakai ortu untuk login selain email + notifikasi WA. */
  @IsString()
  @MinLength(8, { message: 'No. HP minimal 8 digit.' })
  @MaxLength(30)
  phone: string;

  /** Daftar studentId yang langsung dihubungkan saat parent dibuat. */
  @IsOptional()
  @IsUUID('4', { each: true, message: 'studentId tidak valid.' })
  studentIds?: string[];
}
