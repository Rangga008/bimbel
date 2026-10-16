import {
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** Ortu mendaftarkan anak: pilih program + jenjang → invoice terbit otomatis. */
export class CreateEnrollmentDto {
  @IsString()
  @MinLength(3, { message: 'Nama anak minimal 3 karakter.' })
  @MaxLength(100)
  childName: string;

  @IsUUID('4', { message: 'programId tidak valid.' })
  programId: string;

  @IsUUID('4', { message: 'levelId tidak valid.' })
  levelId: string;

  /** Anak yang sudah terdaftar sebelumnya — untuk tambah program kedua
   *  (mis. sudah ikut reguler lalu daftar extra agar dapat harga promo). */
  @IsOptional()
  @IsUUID('4', { message: 'existingStudentId tidak valid.' })
  existingStudentId?: string;

  /** Cara bayar kelas reguler: FULL (lunas di awal) | TWO_TIMES | MONTHLY. */
  @IsOptional()
  @IsIn(['FULL', 'TWO_TIMES', 'MONTHLY'], {
    message: 'Cara bayar tidak valid.',
  })
  paymentPlan?: 'FULL' | 'TWO_TIMES' | 'MONTHLY';

  /** Privat: jumlah siswa dalam satu kelas privat (tier harga brosur). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  studentCount?: number;

  /** Privat: jumlah pertemuan yang dibayar di awal. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(48)
  sessionCount?: number;

  @IsOptional()
  @IsDateString({}, { message: 'Tanggal lahir tidak valid.' })
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  schoolOrigin?: string;

  @IsOptional()
  @IsIn(['M', 'F'], { message: 'Jenis kelamin tidak valid.' })
  gender?: 'M' | 'F';

  /** No. HP anak — dipakai login siswa & notifikasi. Opsional tapi disarankan;
   *  bila kosong akun anak hanya punya email placeholder. */
  @IsOptional()
  @IsString()
  @MinLength(9, { message: 'Nomor HP anak minimal 9 digit.' })
  @MaxLength(30)
  childPhone?: string;

  /** Email anak (opsional) — bila diisi dipakai sebagai identitas login. */
  @IsOptional()
  @IsEmail({}, { message: 'Email anak tidak valid.' })
  childEmail?: string;

  /** Kata sandi akun anak (opsional) — bila kosong sistem membuatkan dan
   *  ditampilkan sekali ke orang tua di respons pendaftaran. */
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'Kata sandi anak minimal 8 karakter.' })
  @MaxLength(100)
  childPassword?: string;
}

/** Ortu mengubah data anak sendiri — termasuk identitas login anak. */
export class UpdateChildDto {
  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'Nama anak minimal 3 karakter.' })
  @MaxLength(100)
  name?: string;

  /** No. HP anak — kirim string kosong untuk menghapus. */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  /** Email anak — kirim string kosong untuk mengembalikan ke placeholder. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  email?: string;

  /** Kata sandi baru anak — kosongkan bila tidak diubah. */
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'Kata sandi minimal 8 karakter.' })
  @MaxLength(100)
  password?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Tanggal lahir tidak valid.' })
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  schoolOrigin?: string;

  @IsOptional()
  @IsIn(['M', 'F'], { message: 'Jenis kelamin tidak valid.' })
  gender?: 'M' | 'F';
}

/** Verifikasi finance — notes opsional (mis. alasan atau catatan pembayaran). */
export class ReviewEnrollmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

/** Penempatan ke kelompok oleh admin academic. */
export class PlaceEnrollmentDto {
  @IsUUID('4', { message: 'groupId tidak valid.' })
  groupId: string;
}
