import { Type } from 'class-transformer';
import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateRefundDto {
  @IsUUID('4', { message: 'invoiceId tidak valid.' })
  invoiceId: string;

  @Type(() => Number)
  @IsNumber({}, { message: 'Nominal tidak valid.' })
  @Min(1, { message: 'Nominal refund minimal Rp 1.' })
  amount: number;

  @IsString()
  @IsNotEmpty({ message: 'Alasan refund wajib diisi.' })
  @MaxLength(500, { message: 'Alasan maksimal 500 karakter.' })
  reason: string;

  @IsOptional()
  @IsUUID('4', { message: 'accountId tidak valid.' })
  accountId?: string;
}

export class SetArReminderDto {
  @IsIn(['NONE', 'PENDING', 'SENT'], { message: 'Status reminder harus NONE, PENDING, atau SENT.' })
  status: 'NONE' | 'PENDING' | 'SENT';
}

export class ManualLedgerEntryDto {
  @IsUUID('4', { message: 'accountId tidak valid.' })
  accountId: string;

  @IsIn(['IN', 'OUT'], { message: 'Arah transaksi harus IN atau OUT.' })
  direction: 'IN' | 'OUT';

  @Type(() => Number)
  @IsNumber({}, { message: 'Nominal tidak valid.' })
  @Min(1, { message: 'Nominal minimal Rp 1.' })
  amount: number;

  @IsString()
  @IsNotEmpty({ message: 'Keterangan wajib diisi.' })
  @MaxLength(500, { message: 'Keterangan maksimal 500 karakter.' })
  description: string;

  @IsOptional()
  @IsString()
  occurredAt?: string;
}
