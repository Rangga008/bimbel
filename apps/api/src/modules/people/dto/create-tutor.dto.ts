import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateTutorDto {
  /** Opsional — kosong → email placeholder digenerate dari nomor HP. */
  @ValidateIf((o: CreateTutorDto) => !!o.email)
  @IsEmail({}, { message: 'Email tutor tidak valid.' })
  email?: string;

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

  /** Wajib — nomor WA tutor ditampilkan ke ortu & dipakai reminder jadwal. */
  @IsString()
  @MinLength(8, { message: 'No. HP minimal 8 digit.' })
  @MaxLength(30, { message: 'Nomor HP maksimal 30 karakter.' })
  phone: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  specialization?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string;
}
