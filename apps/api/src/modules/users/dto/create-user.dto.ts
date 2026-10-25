import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

/**
 * Fase 0b — buat akun manual oleh Owner/Admin. Password = temporary (admin
 * yang set). Identitas login = email ATAU no HP (minimal salah satu); bila
 * email kosong, sistem membuat placeholder dari nomor HP agar kolom unik
 * `users.email` tetap terisi.
 */
export class CreateUserDto {
  /** Opsional — divalidasi hanya bila diisi. */
  @ValidateIf((o: CreateUserDto) => o.email !== undefined && o.email !== '')
  @IsEmail({}, { message: 'Email tidak valid.' })
  email?: string;

  @IsString()
  @MinLength(3, { message: 'Nama minimal 3 karakter.' })
  @MaxLength(100)
  name: string;

  /** Wajib bila email kosong — dipakai login via HP + notifikasi WA. */
  @ValidateIf((o: CreateUserDto) => !o.email?.trim())
  @IsString({ message: 'Isi nomor HP atau email — minimal salah satu.' })
  @MinLength(9, { message: 'Nomor HP minimal 9 digit.' })
  @MaxLength(30, { message: 'Nomor HP maksimal 30 karakter.' })
  phone?: string;

  /** Temporary password yang diberikan admin ke user baru. */
  @IsString()
  @MinLength(8, { message: 'Kata sandi sementara minimal 8 karakter.' })
  @MaxLength(100)
  tempPassword: string;

  /** Role awal (boleh >1). Resolve by id; kosong = tanpa role. */
  @IsOptional()
  @IsUUID('4', { each: true, message: 'roleId tidak valid.' })
  roleIds?: string[];
}
