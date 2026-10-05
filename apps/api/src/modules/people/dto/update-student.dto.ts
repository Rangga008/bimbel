import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateStudentDto {
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
  @IsDateString({}, { message: 'Tanggal lahir tidak valid.' })
  dateOfBirth?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  schoolOrigin?: string | null;

  @IsOptional()
  @IsIn(['M', 'F', 'OTHER'], { message: 'Gender tidak valid.' })
  gender?: 'M' | 'F' | 'OTHER' | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
