import {
  Equals,
  IsBoolean,
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

/**
 * Ortu menandatangani surat pernyataan/kontrak belajar anak.
 * Data anak/program/biaya TIDAK dikirim klien — disusun ulang sebagai
 * snapshot di server dari data pendaftaran supaya tidak bisa dimanipulasi.
 */
export class SubmitStatementDto {
  /** Nama ortu/wali penandatangan — prefill dari nama akun, boleh dikoreksi. */
  @IsString()
  @MinLength(3, { message: 'Nama orang tua minimal 3 karakter.' })
  @MaxLength(100)
  parentName: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsString()
  @MinLength(9, { message: 'Nomor HP minimal 9 digit.' })
  @MaxLength(30)
  phone?: string;

  /** Asal sekolah anak — prefill dari data anak, boleh dikoreksi. */
  @IsOptional()
  @IsString()
  @MaxLength(150)
  schoolOrigin?: string;

  /** Tanggal jatuh tempo angsuran tiap bulan (mis. 10 = tanggal 10). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  dueDay?: number;

  /** Ortu wajib menyetujui seluruh ketentuan administrasi sebelum menyimpan. */
  @IsBoolean()
  @Equals(true, { message: 'Ketentuan administrasi harus disetujui.' })
  agreed: boolean;

  /** Tanda tangan digital — data URL PNG dari signature pad (opsional). */
  @IsOptional()
  @IsString()
  @MaxLength(400_000, { message: 'Data tanda tangan terlalu besar.' })
  signatureData?: string;
}

/**
 * Admin/staff menambahkan program ke siswa yang sudah ada (backfill):
 * tanpa data ortu/anak — `paidInstallments` menandai berapa angsuran yang
 * SUDAH lunas saat enrollment dibuat ("sedang angsuran ke-N dari total").
 */
export class CreateStaffEnrollmentDto {
  @IsUUID('4', { message: 'studentId tidak valid.' })
  studentId: string;

  @IsUUID('4', { message: 'programId tidak valid.' })
  programId: string;

  @IsUUID('4', { message: 'levelId tidak valid.' })
  levelId: string;

  /** Cara bayar kelas reguler: FULL (lunas di awal) | TWO_TIMES | MONTHLY. */
  @IsOptional()
  @IsIn(['FULL', 'TWO_TIMES', 'MONTHLY'], { message: 'Cara bayar tidak valid.' })
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

  /**
   * Jumlah angsuran yang SUDAH lunas saat ini (0 = belum bayar apa pun).
   * Invoice cicilan 1..N ditandai lunas; cicilan berikutnya diterbitkan
   * sebagai tagihan berjalan, sisanya tetap rencana bulanan.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  paidInstallments?: number;
}
