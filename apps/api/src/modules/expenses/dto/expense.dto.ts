import { Type } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { BudgetCategory } from '../../budget/dto/budget.dto';

export class CreateExpenseDto {
  @IsOptional()
  @IsUUID('4', { message: 'budgetId tidak valid.' })
  budgetId?: string;

  @IsUUID('4', { message: 'accountId tidak valid.' })
  accountId: string;

  @Type(() => Number)
  @IsNumber({}, { message: 'Nominal expense tidak valid.' })
  @Min(1, { message: 'Nominal expense minimal Rp 1.' })
  amount: number;

  @IsString()
  @IsNotEmpty({ message: 'Deskripsi wajib diisi.' })
  @MaxLength(500, { message: 'Deskripsi maksimal 500 karakter.' })
  description: string;

  @IsEnum(BudgetCategory, { message: 'Kategori tidak valid.' })
  category: BudgetCategory;

  @IsString()
  @IsNotEmpty({ message: 'Tanggal pengeluaran wajib diisi.' })
  occurredAt: string; // ISO date string

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'URL bukti maksimal 500 karakter.' })
  receiptUrl?: string;
}

export class UpdateExpenseDto {
  @IsOptional()
  @IsUUID('4', { message: 'budgetId tidak valid.' })
  budgetId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'accountId tidak valid.' })
  accountId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Nominal expense tidak valid.' })
  @Min(1, { message: 'Nominal expense minimal Rp 1.' })
  amount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Deskripsi maksimal 500 karakter.' })
  description?: string;

  @IsOptional()
  @IsEnum(BudgetCategory, { message: 'Kategori tidak valid.' })
  category?: BudgetCategory;

  @IsOptional()
  @IsString()
  occurredAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'URL bukti maksimal 500 karakter.' })
  receiptUrl?: string;
}