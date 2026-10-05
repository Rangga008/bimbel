import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateStudentDto {
  @IsEmail({}, { message: 'Email siswa tidak valid.' })
  email: string;

  @IsString()
  @MinLength(3, { message: 'Nama minimal 3 karakter.' })
  @MaxLength(100)
  name: string;

  /**
   * Opsional — bila kosong, backend generate temporary password aman
   * (UsersService.createUserForPersonInTx) dan mengembalikannya SEKALI
   * di response `tempPassword` untuk ditunjukkan ke admin.
   */
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'Kata sandi minimal 8 karakter.' })
  @MaxLength(100)
  password?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Tanggal lahir tidak valid.' })
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  schoolOrigin?: string;

  @IsOptional()
  @IsIn(['M', 'F', 'OTHER'], { message: 'Gender tidak valid.' })
  gender?: 'M' | 'F' | 'OTHER';

  /** Daftar parentId yang langsung dihubungkan saat siswa dibuat. */
  @IsOptional()
  @IsUUID('4', { each: true, message: 'parentId tidak valid.' })
  parentIds?: string[];
}
