import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export enum BudgetCategory {
  PENGADAAN_RUANG_BELAJAR = 'PENGADAAN_RUANG_BELAJAR',
  PERSIAPAN_TAHUN_AJARAN = 'PERSIAPAN_TAHUN_AJARAN',
  OVERHEAD_RUMAH_TANGGA = 'OVERHEAD_RUMAH_TANGGA',
  LOGISTIK_PERAWATAN = 'LOGISTIK_PERAWATAN',
  AKADEMIK = 'AKADEMIK',
  MARKETING = 'MARKETING',
  KESEHATAN_TUNJANGAN = 'KESEHATAN_TUNJANGAN',
  HONOR_PEGAWAI = 'HONOR_PEGAWAI',
  LAIN_LAIN = 'LAIN_LAIN',
}

export class CreateBudgetDto {
  @IsEnum(BudgetCategory, { message: 'Kategori tidak valid.' })
  category: BudgetCategory;

  @IsString()
  @IsNotEmpty({ message: 'Periode wajib diisi.' })
  @MaxLength(7, { message: 'Format periode harus YYYY-MM.' })
  period: string;

  @Type(() => Number)
  @IsNumber({}, { message: 'Nominal budget tidak valid.' })
  @Min(0, { message: 'Nominal budget tidak boleh negatif.' })
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Deskripsi maksimal 500 karakter.' })
  description?: string;
}

export class UpdateBudgetDto {
  @IsOptional()
  @IsEnum(BudgetCategory, { message: 'Kategori tidak valid.' })
  category?: BudgetCategory;

  @IsOptional()
  @IsString()
  @MaxLength(7, { message: 'Format periode harus YYYY-MM.' })
  period?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Nominal budget tidak valid.' })
  @Min(0, { message: 'Nominal budget tidak boleh negatif.' })
  amount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Deskripsi maksimal 500 karakter.' })
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}