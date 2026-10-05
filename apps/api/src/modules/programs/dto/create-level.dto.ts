import { ArrayUnique, IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';
import { PriceUnit } from '@prisma/client';

export class CreateLevelDto {
  @IsUUID('4', { message: 'programId tidak valid.' })
  programId: string;

  /**
   * Level kelas dari master data (dropdown) — name/code/sortOrder otomatis
   * diambil dari sini. Bila diisi, `name` boleh kosong.
   */
  @IsOptional()
  @IsUUID('4', { message: 'gradeLevelId tidak valid.' })
  gradeLevelId?: string;

  /** Mapel level (opsional) — bila kosong level mewarisi mapel program. */
  @IsOptional()
  @IsUUID('4', { message: 'subjectId tidak valid.' })
  subjectId?: string;

  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Nama level minimal 2 karakter.' })
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  code?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  /** Harga kelas per jenjang (Rp) — bulanan untuk reguler/extra, per pertemuan untuk privat. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  /** Satuan penagihan harga. */
  @IsOptional()
  @IsEnum(PriceUnit)
  priceUnit?: PriceUnit;

  /** Reguler: harga lunas dibayar di awal (setelah diskon). */
  @IsOptional()
  @IsNumber()
  @Min(0)
  fullPayPrice?: number;

  /** Reguler: nominal tiap angsuran untuk cara bayar 2x. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  installment2x?: number;

  /** Reguler: nominal angsuran bulanan. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyAmount?: number;

  /** Reguler: jumlah angsuran bulanan (9x/10x). */
  @IsOptional()
  @IsInt()
  @Min(1)
  monthlyCount?: number;

  /** Extra: harga promo bila anak juga ikut kelas reguler. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  promoPrice?: number;

  /** Privat: harga per pertemuan per jumlah siswa, mis. {"2":75000,"3":65000}. */
  @IsOptional()
  sessionPrices?: Record<string, number>;

  /** Privat: durasi pertemuan (menit) — 60/90 sesuai jenjang. */
  @IsOptional()
  @IsInt()
  @Min(15)
  sessionDurationMin?: number;

  /** Override biaya pendaftaran jenjang ini — bila kosong ikut biaya program. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  registrationFee?: number;

  /** Daftar mapel dalam jenjang ini (kelas reguler multi-mapel sesuai brosur). */
  @IsOptional()
  @IsUUID('4', { each: true })
  @ArrayUnique()
  subjectIds?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
