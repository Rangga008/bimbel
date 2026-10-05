import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateTutorDto {
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
  @IsString()
  @MaxLength(100)
  specialization?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
