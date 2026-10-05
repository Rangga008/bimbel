import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Fase 0b — buat akun manual oleh Owner/Admin. Password = temporary (admin yang set). */
export class CreateUserDto {
  @IsEmail({}, { message: 'Email tidak valid.' })
  email: string;

  @IsString()
  @MinLength(3, { message: 'Nama minimal 3 karakter.' })
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
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
