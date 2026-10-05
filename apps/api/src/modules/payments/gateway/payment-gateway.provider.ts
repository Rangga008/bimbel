/**
 * Fase 2b — Payment Gateway abstraction.
 * WhatsApp/payment provider BELUM dipilih (00-project-overview.md) — semua
 * provider wajib lewat interface ini supaya ganti provider = tambah class baru,
 * tanpa mengubah service/controller. Fase ini: 1 provider DUMMY/sandbox.
 */
import { createHmac, randomBytes } from 'node:crypto';

export interface CreateBillResult {
  providerRef: string;
  redirectUrl: string;
  expiresAt: Date;
}

export interface WebhookVerifyResult {
  valid: boolean;
  providerRef?: string;
  amount?: number;
  status?: 'SUCCESS' | 'FAILED' | 'EXPIRED';
}

export abstract class PaymentGatewayProvider {
  abstract readonly name: string;
  abstract createBill(args: { invoiceId: string; invoiceNumber: string; amount: number }): Promise<CreateBillResult>;
  abstract verifyWebhookSignature(rawBody: string, signature: string | undefined): boolean;
  abstract parseWebhook(body: unknown): WebhookVerifyResult;
}

/**
 * Provider DUMMY (sandbox lokal, tanpa panggil jaringan):
 * - createBill: generate ref `DUMMY-<timestamp>-<rand>` + redirectUrl internal.
 * - verify: HMAC-SHA256(rawBody, PAYMENT_WEBHOOK_SECRET) hex == signature.
 * Provider asli (Midtrans/Xendit/dsb) kelak cukup implement interface ini.
 */
export class DummyGatewayProvider extends PaymentGatewayProvider {
  readonly name = 'DUMMY';

  constructor(private readonly webhookSecret: string) {
    super();
  }

  async createBill(args: { invoiceId: string; invoiceNumber: string; amount: number }): Promise<CreateBillResult> {
    const ref = `DUMMY-${Date.now()}-${randomBytes(4).toString('hex').toUpperCase()}`;
    void args;
    return {
      providerRef: ref,
      redirectUrl: `/pembayaran/gateway/${ref}`,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };
  }

  verifyWebhookSignature(rawBody: string, signature: string | undefined): boolean {
    if (!signature || !this.webhookSecret) return false;
    const expected = createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
    if (expected.length !== signature.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
    return diff === 0;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  parseWebhook(_body: unknown): WebhookVerifyResult {
    // Diparse di service dari DTO tervalidasi; provider hanya verifikasi signature.
    return { valid: true };
  }
}
