import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Fase 0b — edit profil dasar akun (nama/email/phone). Tanpa hard delete. */
export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'Nama minimal 3 karakter.' })
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Email tidak valid.' })
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsBoolean({ message: 'isActive harus boolean.' })
  isActive?: boolean;
}
