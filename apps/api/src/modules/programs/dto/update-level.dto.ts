import { ArrayUnique, IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';
import { PriceUnit } from '@prisma/client';

export class UpdateLevelDto {
  @IsOptional()
  @IsUUID('4', { message: 'gradeLevelId tidak valid.' })
  gradeLevelId?: string | null;

  @IsOptional()
  @IsUUID('4', { message: 'subjectId tidak valid.' })
  subjectId?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  code?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  /** Kirim null untuk menghapus harga. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number | null;

  /** Kirim null untuk menghapus satuan. */
  @IsOptional()
  @IsEnum(PriceUnit)
  priceUnit?: PriceUnit | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  fullPayPrice?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  installment2x?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyAmount?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  monthlyCount?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  promoPrice?: number | null;

  /** Tier privat per jumlah siswa — kirim {} untuk mengosongkan. */
  @IsOptional()
  sessionPrices?: Record<string, number> | null;

  @IsOptional()
  @IsInt()
  @Min(15)
  sessionDurationMin?: number | null;

  /** Override biaya pendaftaran jenjang — kirim null untuk ikut biaya program. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  registrationFee?: number | null;

  /** Set penuh daftar mapel jenjang — array kosong menghapus semua. */
  @IsOptional()
  @IsUUID('4', { each: true })
  @ArrayUnique()
  subjectIds?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
