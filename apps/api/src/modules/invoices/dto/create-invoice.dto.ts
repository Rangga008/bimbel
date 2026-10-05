import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { InvoiceAdjustmentItemDto } from './from-package.dto';

export class CreateInvoiceItemDto {
  @IsString()
  @MaxLength(255, { message: 'Deskripsi item maksimal 255 karakter.' })
  @IsNotEmpty({ message: 'Deskripsi item wajib diisi.' })
  description: string;

  @IsOptional()
  @IsInt({ message: 'Jumlah harus bilangan bulat.' })
  @Min(1, { message: 'Jumlah minimal 1.' })
  quantity?: number;

  @IsNumber({}, { message: 'Harga satuan tidak valid.' })
  @Min(0, { message: 'Harga satuan minimal 0.' })
  unitPrice: number;
}

/**
 * Buat invoice — dua mode (salah satu wajib):
 * 1. Dari paket: isi `packageId` → item auto-generate dari harga paket
 *    (dipakai saat siswa didaftarkan ke Package).
 * 2. Manual: isi `items` (tanpa packageId).
 */
export class CreateInvoiceDto {
  @IsUUID('4', { message: 'studentId tidak valid.' })
  studentId: string;

  @IsOptional()
  @IsUUID('4', { message: 'packageId tidak valid.' })
  packageId?: string;

  /** Override harga paket (mode paket saja). */
  @IsOptional()
  @IsNumber({}, { message: 'Harga tidak valid.' })
  @Min(0, { message: 'Harga minimal 0.' })
  price?: number;

  /** Item tambahan mode paket — biaya admin, diskon (negatif), dsb. */
  @IsOptional()
  @IsArray({ message: 'extraItems harus array.' })
  @ValidateNested({ each: true })
  @Type(() => InvoiceAdjustmentItemDto)
  extraItems?: InvoiceAdjustmentItemDto[];

  @IsOptional()
  @IsArray({ message: 'items harus array.' })
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceItemDto)
  items?: CreateInvoiceItemDto[];

  @IsOptional()
  @IsDateString({}, { message: 'Jatuh tempo tidak valid (pakai format YYYY-MM-DD).' })
  dueDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Catatan maksimal 2000 karakter.' })
  notes?: string;
}
