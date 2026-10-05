import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

/** Metode pembayaran Fase 2b — 3 channel wajib. */
export const PAYMENT_METHODS = ['CASH', 'TRANSFER_MANUAL', 'GATEWAY'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_CHANNELS = ['CASH', 'MANUAL', 'GATEWAY'] as const;
export type PaymentChannel = (typeof PAYMENT_CHANNELS)[number];

/** Cash di kantor — diinput + verifikasi instan oleh admin (permission payment.verify). */
export class CreateCashPaymentDto {
  @IsUUID('4', { message: 'invoiceId tidak valid.' })
  invoiceId: string;

  @IsNumber({}, { message: 'Nominal tidak valid.' })
  @Min(1000, { message: 'Nominal minimal Rp 1.000.' })
  amount: number;

  @IsOptional()
  @IsUUID('4', { message: 'accountId tidak valid.' })
  accountId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Catatan maksimal 500 karakter.' })
  note?: string;
}

/**
 * Upload bukti manual (Orang Tua) — selalu PENDING.
 * `proofUrl`: path/URL bukti (Fase 2b: string bebas — file storage menyusul;
 * frontend mengirim nama file/data-url ringkas, bukan binary besar).
 */
export class CreateManualProofDto {
  @IsUUID('4', { message: 'invoiceId tidak valid.' })
  invoiceId: string;

  @IsNumber({}, { message: 'Nominal tidak valid.' })
  @Min(1000, { message: 'Nominal minimal Rp 1.000.' })
  amount: number;

  @IsString()
  @IsNotEmpty({ message: 'Bukti pembayaran wajib diisi.' })
  @MaxLength(2000, { message: 'Referensi bukti maksimal 2000 karakter.' })
  proofUrl: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Catatan maksimal 500 karakter.' })
  proofNote?: string;
}

/** Verifikasi / tolak bukti PENDING oleh admin (permission payment.verify). */
export class VerifyPaymentDto {
  @IsIn(['APPROVE', 'REJECT'], { message: 'Aksi harus APPROVE atau REJECT.' })
  action: 'APPROVE' | 'REJECT';

  @IsOptional()
  @IsUUID('4', { message: 'accountId tidak valid.' })
  accountId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Alasan maksimal 500 karakter.' })
  reason?: string;
}

/**
 * Inisiasi gateway dummy — membuat payment PENDING dengan providerRef.
 * TIDAK mengubah status invoice. Pelunasan HANYA via webhook server.
 */
export class InitiateGatewayDto {
  @IsUUID('4', { message: 'invoiceId tidak valid.' })
  invoiceId: string;

  @IsNumber({}, { message: 'Nominal tidak valid.' })
  @Min(1000, { message: 'Nominal minimal Rp 1.000.' })
  amount: number;
}

/**
 * Simulasi hasil pembayaran gateway DUMMY (sandbox). Backend menandatangani
 * payload dengan secret lalu memprosesnya lewat jalur webhook yang sama —
 * secret tidak pernah sampai ke client. Hanya aktif saat provider = DUMMY.
 */
export class SimulateGatewayDto {
  @IsString()
  @IsNotEmpty({ message: 'providerRef wajib diisi.' })
  @MaxLength(100)
  providerRef: string;

  @IsIn(['SUCCESS', 'FAILED', 'EXPIRED'], {
    message: 'Status simulasi tidak dikenal.',
  })
  status: 'SUCCESS' | 'FAILED' | 'EXPIRED';
}

/**
 * Webhook gateway dummy (server-to-server).
 * Provider dummy menandatangani body dengan HMAC-SHA256 memakai
 * PAYMENT_WEBHOOK_SECRET. Tanpa signature valid → 401, status tetap PENDING.
 */
export class GatewayWebhookDto {
  @IsString()
  @IsNotEmpty({ message: 'providerRef wajib diisi.' })
  @MaxLength(100)
  providerRef: string;

  @IsIn(['SUCCESS', 'FAILED', 'EXPIRED'], {
    message: 'Status webhook tidak dikenal.',
  })
  status: 'SUCCESS' | 'FAILED' | 'EXPIRED';

  @IsNumber({}, { message: 'Nominal webhook tidak valid.' })
  @Min(0)
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  signature?: string;
}
