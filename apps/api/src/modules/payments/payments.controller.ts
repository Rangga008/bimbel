import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { createReadStream } from 'node:fs';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { PERMISSION_CODES } from '../rbac/permissions.constants';
import { AuditService } from '../../common/audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PaymentsService } from './payments.service';
import {
  CreateCashPaymentDto,
  InitiateGatewayDto,
  VerifyPaymentDto,
} from './dto/payment.dto';

function ctx(req: Request) {
  return { ipAddress: req.ip, userAgent: req.headers['user-agent'] };
}

/**
 * Fase 2b — Admin Finance: list/verifikasi pembayaran + kwitansi.
 * - GET /payments (filter status/channel) — payment.view
 * - POST /payments/cash — payment.verify (input + verifikasi instan)
 * - PATCH /payments/:id/verify — payment.verify (APPROVE/REJECT bukti MANUAL/CASH-pending;
 *   GATEWAY hanya boleh REJECT — APPROVE gateway ditolak, pelunasan hanya via webhook)
 * - POST /payments/gateway/initiate — payment.create (admin boleh inisiasi untuk siswa)
 * - GET /receipts, GET /receipts/:id — payment.view
 */
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('payments')
  @RequirePermissions(PERMISSION_CODES.PAYMENT_VIEW)
  list(
    @Query('status') status?: string,
    @Query('channel') channel?: string,
    @Query('studentId') studentId?: string,
    @Query('search') search?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.payments.list({ status, channel, studentId, search, from, to });
  }

  @Get('payments/pending-count')
  @RequirePermissions(PERMISSION_CODES.PAYMENT_VIEW)
  pendingCount() {
    return this.prisma.payment
      .count({ where: { status: 'PENDING' } })
      .then((count) => ({ count }));
  }

  @Get('payments/:id')
  @RequirePermissions(PERMISSION_CODES.PAYMENT_VIEW)
  get(@Param('id') id: string) {
    return this.payments.get(id);
  }

  /**
   * Unduh file bukti tersimpan (channel MANUAL). payment.view wajib; di service
   * dibatasi lagi: hanya pembuat payment atau staff payment.verify.
   */
  @Get('payments/:id/proof')
  @RequirePermissions(PERMISSION_CODES.PAYMENT_VIEW)
  async proof(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const file = await this.payments.getProofFile(id, actor);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', 'inline');
    createReadStream(file.path).pipe(res);
  }

  @Post('payments/cash')
  @RequirePermissions(PERMISSION_CODES.PAYMENT_VERIFY)
  async cash(
    @Body() dto: CreateCashPaymentDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const created = await this.payments.createCash(actor.id, dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'PAYMENT_CASH_VERIFIED',
      entity: 'Payment',
      entityId: created.id,
      newData: { invoiceId: dto.invoiceId, amount: dto.amount, method: 'CASH' },
      ...ctx(req),
    });
    await this.notifyPayer(
      created.studentId,
      `Pembayaran tunai ${created.id} terverifikasi.`,
      `/pembayaran/${created.id}`,
    );
    return created;
  }

  @Patch('payments/:id/verify')
  @RequirePermissions(PERMISSION_CODES.PAYMENT_VERIFY)
  async verify(
    @Param('id') id: string,
    @Body() dto: VerifyPaymentDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const before = await this.payments.get(id);
    const updated = await this.payments.verify(actor.id, id, dto.action, {
      accountId: dto.accountId,
      reason: dto.reason,
    });
    await this.audit.log({
      actorId: actor.id,
      action:
        dto.action === 'APPROVE' ? 'PAYMENT_VERIFIED' : 'PAYMENT_REJECTED',
      entity: 'Payment',
      entityId: id,
      oldData: { status: before.status },
      newData: {
        status: dto.action === 'APPROVE' ? 'VERIFIED' : 'REJECTED',
        reason: dto.reason ?? null,
      },
      ...ctx(req),
    });
    const pid = (updated as { studentId?: string }).studentId;
    if (pid) {
      await this.notifyPayer(
        pid,
        dto.action === 'APPROVE'
          ? 'Bukti pembayaran Anda disetujui.'
          : `Bukti pembayaran ditolak: ${dto.reason ?? '-'}`,
        `/pembayaran/${id}`,
      );
    }
    return updated;
  }

  @Post('payments/gateway/initiate')
  @RequirePermissions(PERMISSION_CODES.PAYMENT_CREATE)
  async initiate(
    @Body() dto: InitiateGatewayDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const created = await this.payments.initiateGateway(actor.id, dto);
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
      ...ctx(req),
    });
    return created;
  }

  @Get('receipts')
  @RequirePermissions(PERMISSION_CODES.PAYMENT_VIEW)
  receipts(
    @Query('studentId') studentId?: string,
    @Query('invoiceId') invoiceId?: string,
    @Query('search') search?: string,
  ) {
    return this.payments.listReceipts({ studentId, invoiceId, search });
  }

  @Get('receipts/:id')
  @RequirePermissions(PERMISSION_CODES.PAYMENT_VIEW)
  receipt(@Param('id') id: string) {
    return this.payments.getReceipt(id);
  }

  /** Notifikasi in-app ke pemilik akun siswa + semua ortu terhubung (best-effort). */
  private async notifyPayer(
    studentId: string | null | undefined,
    title: string,
    link: string,
  ) {
    if (!studentId) return;
    try {
      const student = await this.prisma.student.findUnique({
        where: { id: studentId },
        select: {
          userId: true,
          parentStudents: { select: { parent: { select: { userId: true } } } },
        },
      });
      if (!student) return;
      const userIds = [
        student.userId,
        ...student.parentStudents.map((p) => p.parent.userId),
      ];
      for (const userId of [...new Set(userIds)]) {
        try {
          await this.notifications.create({ userId, title, body: title, link });
        } catch {
          // best-effort
        }
      }
    } catch {
      // best-effort
    }
  }
}
