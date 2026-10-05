import { Body, Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuditService } from '../../common/audit/audit.service';
import { PaymentsService } from './payments.service';
import { GatewayWebhookDto } from './dto/payment.dto';

/**
 * Fase 2b — Webhook gateway dummy (server-to-server, TANPA auth user).
 * - Signature = HMAC-SHA256 dari JSON canonical:
 *   {"amount":<number>,"providerRef":"...","status":"..."}
 *   (key alfabetis; amount = number hasil class-transformer, mis. 1200000
 *   TANPA trailing .0 — klien WAJIB sign bentuk ini, bukan body mentah).
 *   Tanpa signature valid → 401 (DoD anti-bypass).
 * - Rate-limit mengandalkan ThrottlerGuard global.
 * - DoD: TIDAK ada endpoint client yang bisa menandai payment sukses —
 *   satu-satunya jalan VERIFIED untuk channel GATEWAY adalah webhook ini.
 */
@Controller('webhooks')
export class PaymentWebhookController {
  constructor(private readonly payments: PaymentsService, private readonly audit: AuditService) {}

  @Post('payment')
  @HttpCode(200)
  async handle(
    @Body() dto: GatewayWebhookDto,
    @Req() req: Request,
    @Headers('x-webhook-signature') signature?: string,
  ) {
    const canonical = JSON.stringify({
      amount: dto.amount,
      providerRef: dto.providerRef,
      status: dto.status,
    });
    const updated = await this.payments.handleWebhook(canonical, dto, signature);
    await this.audit.log({
      actorId: null,
      action: 'PAYMENT_GATEWAY_WEBHOOK',
      entity: 'Payment',
      entityId: (updated as { id: string }).id,
      newData: { providerRef: dto.providerRef, status: dto.status, amount: dto.amount },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return { success: true, status: (updated as { status: string }).status };
  }

  /**
   * Webhook notifikasi Midtrans (server-to-server, TANPA auth user).
   * Daftarkan URL ini di dashboard Midtrans → Settings → Configuration →
   * Payment Notification URL: {API_BASE}/api/webhooks/midtrans
   * signature_key diverifikasi dengan Server Key dari Pengaturan.
   */
  @Post('midtrans')
  @HttpCode(200)
  async handleMidtrans(@Body() body: Record<string, unknown>, @Req() req: Request) {
    const result = await this.payments.handleMidtransWebhook(body);
    await this.audit.log({
      actorId: null,
      action: 'PAYMENT_GATEWAY_WEBHOOK',
      entity: 'Payment',
      entityId: String(body.order_id ?? 'midtrans'),
      newData: {
        provider: 'MIDTRANS',
        orderId: body.order_id,
        transactionStatus: body.transaction_status,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return result;
  }
}
