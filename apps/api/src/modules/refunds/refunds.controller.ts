import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { PERMISSION_CODES } from '../rbac/permissions.constants';
import { AuditService } from '../../common/audit/audit.service';
import { RefundsService } from './refunds.service';
import { NotificationEventsService } from '../notifications/notification-events.service';
import { CreateRefundDto, ManualLedgerEntryDto, SetArReminderDto } from './dto/refund.dto';

function ctx(req: Request) {
  return { ipAddress: req.ip, userAgent: req.headers['user-agent'] };
}

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RefundsController {
  constructor(
    private readonly refunds: RefundsService,
    private readonly audit: AuditService,
    private readonly events: NotificationEventsService,
  ) {}

  @Get('ar')
  @RequirePermissions(PERMISSION_CODES.AR_VIEW)
  listAr(
    @Query('search') search?: string,
    @Query('reminderStatus') reminderStatus?: string,
    @Query('overdue') overdue?: string,
  ) {
    return this.refunds.listAr({ search, reminderStatus, overdue });
  }

  // Koreksi flag reminder piutang (bukan pengiriman WA — itu Fase 5).
  // Permission refund.manage (aksi tulis finansial), bukan ar.view yang read-only.
  @Patch('ar/:invoiceId/reminder')
  @RequirePermissions(PERMISSION_CODES.REFUND_MANAGE)
  async reminder(
    @Param('invoiceId') invoiceId: string,
    @Body() dto: SetArReminderDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const updated = await this.refunds.setReminder(invoiceId, dto.status);
    await this.audit.log({
      actorId: actor.id,
      action: 'AR_REMINDER_UPDATED',
      entity: 'Invoice',
      entityId: invoiceId,
      newData: { reminderStatus: dto.status },
      ...ctx(req),
    });
    return updated;
  }

  /**
   * Kirim pengingat WA ke orang tua untuk invoice outstanding (Fase 5b).
   * Masuk antrean outbox → worker mengirim lewat provider aktif.
   * Sekaligus menandai reminderStatus=SENT.
   */
  @Post('ar/:invoiceId/send-reminder')
  @RequirePermissions(PERMISSION_CODES.REFUND_MANAGE)
  async sendReminder(
    @Param('invoiceId') invoiceId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const result = await this.events.paymentReminder(invoiceId);
    await this.audit.log({
      actorId: actor.id,
      action: 'AR_REMINDER_SENT',
      entity: 'Invoice',
      entityId: invoiceId,
      newData: result,
      ...ctx(req),
    });
    return result;
  }

  /**
   * Reminder jatuh tempo massal — kirim WA ke ortu untuk semua invoice
   * outstanding yang jatuh tempo dalam `days` hari (default 7, termasuk
   * yang sudah lewat). Per-invoice dilewatkan ke events.paymentReminder
   * (outbox + tanda SENT); kegagalan satu invoice tidak menghentikan lainnya.
   */
  @Post('ar/send-due-reminders')
  @RequirePermissions(PERMISSION_CODES.REFUND_MANAGE)
  async sendDueReminders(
    @Query('days') days: string | undefined,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const due = await this.refunds.dueInvoices(days ? Number(days) || 7 : 7);
    let sent = 0;
    let failed = 0;
    for (const inv of due) {
      try {
        await this.events.paymentReminder(inv.id);
        sent += 1;
      } catch {
        failed += 1;
      }
    }
    const result = { invoices: due.length, sent, failed };
    await this.audit.log({
      actorId: actor.id,
      action: 'AR_DUE_REMINDERS_SENT',
      entity: 'Invoice',
      entityId: '*',
      newData: result,
      ...ctx(req),
    });
    return result;
  }

  @Get('refunds')
  @RequirePermissions(PERMISSION_CODES.AR_VIEW)
  listRefunds(@Query('invoiceId') invoiceId?: string) {
    return this.refunds.listRefunds(invoiceId);
  }

  @Post('refunds')
  @RequirePermissions(PERMISSION_CODES.REFUND_MANAGE)
  async create(
    @Body() dto: CreateRefundDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const before = await this.refunds.getInvoiceForAudit(dto.invoiceId);
    const created = await this.refunds.createRefund(actor.id, dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'REFUND_CREATED',
      entity: 'Refund',
      entityId: created.id,
      oldData: { invoiceId: dto.invoiceId, invoiceBefore: before },
      newData: {
        invoiceId: dto.invoiceId,
        amount: dto.amount,
        cashOut: created.cashOut,
        reason: dto.reason,
        invoiceAfter: created.invoice,
      },
      ...ctx(req),
    });
    return created;
  }

  @Get('ledger')
  @RequirePermissions(PERMISSION_CODES.LEDGER_VIEW)
  ledger(
    @Query('accountId') accountId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.refunds.listLedger({ accountId, from, to });
  }

  /**
   * Transaksi harian ad-hoc — kas masuk/keluar di luar siklus invoice
   * (mis. melayani tamu, belanja mendadak di luar RAB bulanan).
   */
  @Post('ledger/manual')
  @RequirePermissions(PERMISSION_CODES.EXPENSE_MANAGE)
  async manualEntry(
    @Body() dto: ManualLedgerEntryDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const created = await this.refunds.createManualEntry(dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'LEDGER_MANUAL_CREATED',
      entity: 'LedgerEntry',
      entityId: created.id,
      newData: { direction: dto.direction, amount: dto.amount, accountId: dto.accountId },
      ...ctx(req),
    });
    return created;
  }

  /** Hapus entry MANUAL saja — entry dari invoice/refund/gaji tidak bisa. */
  @Delete('ledger/manual/:id')
  @RequirePermissions(PERMISSION_CODES.EXPENSE_MANAGE)
  async deleteManualEntry(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const before = await this.refunds.deleteManualEntry(id);
    await this.audit.log({
      actorId: actor.id,
      action: 'LEDGER_MANUAL_DELETED',
      entity: 'LedgerEntry',
      entityId: id,
      ...ctx(req),
    });
    return before;
  }
}
