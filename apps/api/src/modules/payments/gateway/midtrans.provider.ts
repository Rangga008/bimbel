// Provider Midtrans (Snap) — diaktifkan via Pengaturan > Payment Gateway.
// createBill  : POST {base}/snap/v1/transactions (Basic base64(serverKey+":"))
//               -> { token, redirect_url } untuk redirect ortu ke halaman Snap.
// Notifikasi  : Midtrans POST ke /webhooks/midtrans; signature_key =
//               sha512(order_id + status_code + gross_amount + serverKey).
//               transaction_status: capture/settlement -> SUCCESS,
//               deny/cancel -> FAILED, expire -> EXPIRED, lainnya diabaikan.
import { createHash, randomBytes } from 'node:crypto';
import { BadGatewayException } from '@nestjs/common';
import {
  PaymentGatewayProvider,
  type CreateBillResult,
  type WebhookVerifyResult,
} from './payment-gateway.provider';

interface MidtransNotification {
  order_id?: string;
  status_code?: string;
  gross_amount?: string;
  signature_key?: string;
  transaction_status?: string;
  fraud_status?: string;
}

export class MidtransGatewayProvider extends PaymentGatewayProvider {
  readonly name = 'MIDTRANS';

  constructor(
    private readonly serverKey: string,
    private readonly isProduction: boolean,
  ) {
    super();
  }

  private get baseUrl() {
    return this.isProduction
      ? 'https://app.midtrans.com'
      : 'https://app.sandbox.midtrans.com';
  }

  // API transaksi/status Midtrans memakai host api.*, berbeda dari host Snap (app.*).
  private get apiBaseUrl() {
    return this.isProduction
      ? 'https://api.midtrans.com'
      : 'https://api.sandbox.midtrans.com';
  }

  /**
   * Buat transaksi Snap. order_id harus unik per percobaan (Midtrans menolak
   * order_id yang dipakai ulang), jadi disusun dari nomor invoice + suffix
   * acak — itulah yang disimpan sebagai providerRef.
   */
  async createBill(args: {
    invoiceId: string;
    invoiceNumber: string;
    amount: number;
  }): Promise<CreateBillResult> {
    const orderId = `${args.invoiceNumber}-${randomBytes(4).toString('hex').toUpperCase()}`.slice(
      0,
      50,
    );
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/snap/v1/transactions`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.serverKey}:`).toString('base64')}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          transaction_details: {
            order_id: orderId,
            gross_amount: Math.round(args.amount),
          },
          // Pembayaran expired setelah 24 jam bila ortu tidak menyelesaikan.
          expiry: { unit: 'hours', duration: 24 },
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      throw new BadGatewayException(
        `Tidak dapat menghubungi Midtrans: ${err instanceof Error ? err.message : err}`,
      );
    }
    const text = await res.text();
    if (!res.ok) {
      // 401 biasanya berarti serverKey salah/bukan key sandbox-vs-prod yg sesuai.
      const hint =
        res.status === 401
          ? ' — periksa Server Key (sandbox vs production) di Pengaturan.'
          : '';
      throw new BadGatewayException(
        `Midtrans Snap merespons ${res.status}: ${text.slice(0, 200)}${hint}`,
      );
    }
    const json = JSON.parse(text) as {
      token?: string;
      redirect_url?: string;
    };
    if (!json.redirect_url) {
      throw new BadGatewayException(
        'Midtrans tidak mengembalikan redirect_url.',
      );
    }
    return {
      providerRef: orderId,
      redirectUrl: json.redirect_url,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };
  }

  /**
   * Verifikasi notifikasi Midtrans: signature_key harus sama dengan
   * sha512(order_id + status_code + gross_amount + serverKey).
   */
  verifyNotification(body: MidtransNotification): boolean {
    if (!body.order_id || !body.status_code || !body.gross_amount) return false;
    if (!body.signature_key || !this.serverKey) return false;
    const expected = createHash('sha512')
      .update(
        `${body.order_id}${body.status_code}${body.gross_amount}${this.serverKey}`,
      )
      .digest('hex');
    if (expected.length !== body.signature_key.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i += 1) {
      diff |= expected.charCodeAt(i) ^ body.signature_key.charCodeAt(i);
    }
    return diff === 0;
  }

  /**
   * Cek status transaksi langsung ke API Midtrans: GET /v2/{order_id}/status.
   * Dipakai saat ortu kembali dari Snap tapi webhook belum masuk — signature_key
   * di respons diverifikasi sama seperti notifikasi webhook.
   */
  async checkStatus(orderId: string): Promise<WebhookVerifyResult> {
    let res: Response;
    try {
      res = await fetch(`${this.apiBaseUrl}/v2/${encodeURIComponent(orderId)}/status`, {
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.serverKey}:`).toString('base64')}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      throw new BadGatewayException(
        `Tidak dapat menghubungi Midtrans: ${err instanceof Error ? err.message : err}`,
      );
    }
    if (res.status === 404) {
      // Transaksi tidak dikenal Midtrans — abaikan, jangan ubah payment.
      return { valid: false, providerRef: orderId };
    }
    const text = await res.text();
    if (!res.ok) {
      throw new BadGatewayException(
        `Midtrans status merespons ${res.status}: ${text.slice(0, 200)}`,
      );
    }
    const body = JSON.parse(text) as MidtransNotification;
    if (!this.verifyNotification(body)) {
      throw new BadGatewayException('Signature respons status Midtrans tidak valid.');
    }
    return this.parseNotification(body);
  }

  /** Petakan transaction_status Midtrans ke status internal. */
  parseNotification(body: MidtransNotification): WebhookVerifyResult {
    const amount = Number(body.gross_amount);
    const ts = body.transaction_status;
    const fraud = body.fraud_status;
    let status: WebhookVerifyResult['status'];
    if (ts === 'settlement' || (ts === 'capture' && fraud === 'accept')) {
      status = 'SUCCESS';
    } else if (ts === 'deny' || ts === 'cancel') {
      status = 'FAILED';
    } else if (ts === 'expire') {
      status = 'EXPIRED';
    } else {
      // pending / capture-non-accept / refund / dsb — belum final.
      return { valid: true, providerRef: body.order_id, amount };
    }
    return {
      valid: true,
      providerRef: body.order_id,
      amount,
      status,
    };
  }

  // Interface lama (dummy HMAC) tidak dipakai — Midtrans membawa signature
  // di dalam body notifikasi, bukan header.
  verifyWebhookSignature(): boolean {
    return false;
  }
  parseWebhook(): WebhookVerifyResult {
    return { valid: true };
  }
}
