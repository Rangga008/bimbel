import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { PERMISSION_CODES } from '../rbac/permissions.constants';
import { AuditService } from '../../common/audit/audit.service';
import { PaymentsService } from './payments.service';
import {
  CreateManualProofDto,
  InitiateGatewayDto,
  SimulateGatewayDto,
} from './dto/payment.dto';

/**
 * Fase 2b — Orang Tua: invoice anak + upload bukti + inisiasi gateway + riwayat.
 * Scope SELALU dibatasi ke anak sendiri (parent_students) di service layer.
 */
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ParentPaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly audit: AuditService,
  ) {}

  @Get('me/invoices')
  @RequirePermissions(PERMISSION_CODES.PAYMENT_VIEW)
  myInvoices(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('studentId') studentId?: string,
  ) {
    return this.payments.myChildrenInvoices(actor.id, studentId);
  }

  @Get('me/payments')
  @RequirePermissions(PERMISSION_CODES.PAYMENT_VIEW)
  myPayments(@CurrentUser() actor: AuthenticatedUser) {
    return this.payments.myPayments(actor.id);
  }

  @Post('me/payments/manual-proof')
  @RequirePermissions(PERMISSION_CODES.PAYMENT_CREATE)
  async manualProof(
    @Body() dto: CreateManualProofDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const created = await this.payments.submitManualProof(actor.id, dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'PAYMENT_PROOF_SUBMITTED',
      entity: 'Payment',
      entityId: created.id,
      newData: { invoiceId: dto.invoiceId, amount: dto.amount },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return created;
  }

  /**
   * Upload file bukti nyata (JPG/PNG/WebP/PDF, maks 2MB — buffer memory, divalidasi
   * & ditulis service). Mengembalikan `proofUrl` token untuk dipakai di
   * POST /me/payments/manual-proof.
   */
  @Post('me/payments/proof-upload')
  @RequirePermissions(PERMISSION_CODES.PAYMENT_CREATE)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }),
  )
  uploadProof(
    @UploadedFile() file: { buffer: Buffer; mimetype: string } | undefined,
  ) {
    return this.payments.saveProofFile(file);
  }

  /**
   * Simulasi pembayaran gateway DUMMY: server menandatangani payload lalu
   * memprosesnya lewat jalur webhook asli. Scope: pembuat transaksi / staff.
   */
  @Post('me/payments/gateway/simulate')
  @RequirePermissions(PERMISSION_CODES.PAYMENT_CREATE)
  async simulateGateway(
    @Body() dto: SimulateGatewayDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const result = await this.payments.simulateGateway(actor, dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'PAYMENT_GATEWAY_SIMULATED',
      entity: 'Payment',
      entityId: result.id,
      newData: { providerRef: dto.providerRef, status: dto.status },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return result;
  }

  /**
   * Sinkronkan status payment gateway dengan provider (mis. ortu kembali dari
   * Snap sebelum webhook masuk). Server menanyakan status ke API provider —
   * klien tidak bisa memaksa status; hanya pembacaan + jalur outcome yang sama.
   */
  @Post('me/payments/:id/check-status')
  @RequirePermissions(PERMISSION_CODES.PAYMENT_CREATE)
  async checkStatus(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const result = await this.payments.checkGatewayStatus(actor, id);
    if (result.status !== 'PENDING') {
      await this.audit.log({
        actorId: actor.id,
        action: 'PAYMENT_GATEWAY_STATUS_SYNCED',
        entity: 'Payment',
        entityId: id,
        newData: { status: result.status, providerRef: result.providerRef },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
    }
    return result;
  }

  @Post('me/payments/gateway/initiate')
  @RequirePermissions(PERMISSION_CODES.PAYMENT_CREATE)
  async initiate(
    @Body() dto: InitiateGatewayDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const allowed = await this.payments.allowedStudentsOrThrow(actor.id);
    const created = await this.payments.initiateGateway(actor.id, dto, allowed);
    await this.audit.log({
      actorId: actor.id,
      action: 'PAYMENT_GATEWAY_INITIATED',
      entity: 'Payment',
      entityId: created.id,
      newData: {
        invoiceId: dto.invoiceId,
        amount: dto.amount,
        providerRef: created.providerRef,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return created;
  }

  @Get('me/receipts')
  @RequirePermissions(PERMISSION_CODES.PAYMENT_VIEW)
  async myReceipts(@CurrentUser() actor: AuthenticatedUser) {
    const allowed = await this.payments.allowedStudentsOrThrow(actor.id);
    const all = await Promise.all(
      allowed.map((sid) => this.payments.listReceipts({ studentId: sid })),
    );
    return all
      .flat()
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
      .slice(0, 100);
  }

  @Get('me/receipts/:id')
  @RequirePermissions(PERMISSION_CODES.PAYMENT_VIEW)
  async myReceipt(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const receipt = await this.payments.getReceipt(id);
    const allowed = await this.payments.allowedStudentsOrThrow(actor.id);
    const { ForbiddenException } = await import('@nestjs/common');
    if (!allowed.includes(receipt.studentId))
      throw new ForbiddenException('Kwitansi ini bukan milik anak Anda.');
    return receipt;
  }
}
