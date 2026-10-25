import {
  ValidateIf,
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
  /** Opsional — kosong → email placeholder digenerate dari nomor HP. */
  @ValidateIf((o: CreateStudentDto) => !!o.email)
  @IsEmail({}, { message: 'Email siswa tidak valid.' })
  email?: string;

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

  /**
   * Wajib bila email kosong — akun siswa butuh minimal satu identitas
   * login (email atau no HP); tanpa keduanya akun tidak bisa login.
   */
  @ValidateIf(
    (o: CreateStudentDto) => !o.email?.trim() || o.phone !== undefined,
  )
  @IsString({ message: 'Isi nomor HP atau email — minimal salah satu.' })
  @MinLength(9, { message: 'Nomor HP minimal 9 digit.' })
  @MaxLength(30, { message: 'Nomor HP maksimal 30 karakter.' })
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
  @IsString()
  @MaxLength(30)
  nis?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  majorChoice1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  majorChoice2?: string;

  @IsOptional()
  @IsIn(['M', 'F', 'OTHER'], { message: 'Gender tidak valid.' })
  gender?: 'M' | 'F' | 'OTHER';

  /** Daftar parentId yang langsung dihubungkan saat siswa dibuat. */
  @IsOptional()
  @IsUUID('4', { each: true, message: 'parentId tidak valid.' })
  parentIds?: string[];
}
