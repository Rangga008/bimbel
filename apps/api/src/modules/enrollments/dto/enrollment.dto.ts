import {
  IsDateString,
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
