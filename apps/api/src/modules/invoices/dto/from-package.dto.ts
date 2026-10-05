import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
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

/**
 * Item tambahan pada invoice paket — biaya admin, diskon, dsb.
 * `unitPrice` boleh negatif untuk potongan/diskon.
 */
export class InvoiceAdjustmentItemDto {
  @IsString()
  @MaxLength(255, { message: 'Deskripsi item maksimal 255 karakter.' })
  @IsNotEmpty({ message: 'Deskripsi item wajib diisi.' })
  description: string;

  @IsOptional()
  @IsInt({ message: 'Jumlah harus bilangan bulat.' })
  @Min(1, { message: 'Jumlah minimal 1.' })
  quantity?: number;

  // Sengaja tanpa @Min(0) — nilai negatif = potongan/diskon.
  @IsNumber({}, { message: 'Nominal tidak valid.' })
  unitPrice: number;
}

/**
 * Buat invoice dari paket siswa (draft). Item utama auto-generate dari harga
 * paket — `price` opsional meng-override harga tsb (diskon khusus, harga
 * kesepakatan, dsb); `extraItems` menambah potongan/biaya lain.
 */
export class CreateInvoiceFromPackageDto {
  @IsUUID('4', { message: 'studentId tidak valid.' })
  studentId: string;

  @IsUUID('4', { message: 'packageId tidak valid.' })
  packageId: string;

  /** Override harga paket untuk invoice ini saja (harga paket tidak berubah). */
  @IsOptional()
  @IsNumber({}, { message: 'Harga tidak valid.' })
  @Min(0, { message: 'Harga minimal 0.' })
  price?: number;

  @IsOptional()
  @IsArray({ message: 'extraItems harus array.' })
  @ValidateNested({ each: true })
  @Type(() => InvoiceAdjustmentItemDto)
  extraItems?: InvoiceAdjustmentItemDto[];

  @IsOptional()
  @IsDateString({}, { message: 'Jatuh tempo tidak valid (pakai format YYYY-MM-DD).' })
  dueDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Catatan maksimal 2000 karakter.' })
  notes?: string;
}

/** Terbitkan draft menjadi ISSUED (status masih manual di Fase 2a). */
export class IssueInvoiceDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  dueDate?: string;

  @IsOptional()
  @IsIn(['ISSUED'], { message: 'Status tidak valid.' })
  status?: 'ISSUED';
}
