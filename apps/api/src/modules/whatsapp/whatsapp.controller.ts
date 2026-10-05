// Fase 5b — Admin/Owner memantau antrean WhatsApp outbox.
// Endpoint ini HANYA mengelola antrean (list/proses/retry/test) —
// pengiriman tetap lewat worker + provider abstraction, bukan dari sini.
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { PERMISSION_CODES } from '../rbac/permissions.constants';
import { AuditService } from '../../common/audit/audit.service';
import { WhatsAppOutboxService } from './whatsapp-outbox.service';
import { TestWhatsAppDto } from './dto/whatsapp.dto';

@Controller('whatsapp-outbox')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WhatsAppController {
  constructor(
    private readonly outbox: WhatsAppOutboxService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSION_CODES.WHATSAPP_OUTBOX_VIEW)
  list(
    @Query('status') status?: string,
    @Query('eventType') eventType?: string,
  ) {
    return this.outbox.list({ status, eventType });
  }

  @Get('stats')
  @RequirePermissions(PERMISSION_CODES.WHATSAPP_OUTBOX_VIEW)
  stats() {
    return this.outbox.stats();
  }

  /** Proses antrean PENDING sekarang (dev/demo — normalnya dikerjakan worker). */
  @Post('process')
  @RequirePermissions(PERMISSION_CODES.WHATSAPP_OUTBOX_MANAGE)
  async process(@CurrentUser() actor: AuthenticatedUser, @Req() req: Request) {
    const result = await this.outbox.processPending();
    await this.audit.log({
      actorId: actor.id,
      action: 'WHATSAPP_OUTBOX_PROCESSED',
      entity: 'WhatsAppOutbox',
      entityId: 'batch',
      newData: result,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return result;
  }

  /** Re-queue pesan FAILED untuk dicoba lagi oleh worker. */
  @Post(':id/retry')
  @RequirePermissions(PERMISSION_CODES.WHATSAPP_OUTBOX_MANAGE)
  async retry(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const updated = await this.outbox.retry(id);
    await this.audit.log({
      actorId: actor.id,
      action: 'WHATSAPP_OUTBOX_RETRIED',
      entity: 'WhatsAppOutbox',
      entityId: id,
      newData: {
        recipientPhone: updated.recipientPhone,
        eventType: updated.eventType,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return updated;
  }

  /** Enqueue pesan uji (PENDING) — membuktikan jalur outbox tanpa event nyata. */
  @Post('test')
  @RequirePermissions(PERMISSION_CODES.WHATSAPP_OUTBOX_MANAGE)
  async test(
    @Body() dto: TestWhatsAppDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const created = await this.outbox.enqueue({
      phone: dto.phone,
      userId: actor.id,
      eventType: 'TEST',
      message: dto.message,
    });
    await this.audit.log({
      actorId: actor.id,
      action: 'WHATSAPP_OUTBOX_TEST_ENQUEUED',
      entity: 'WhatsAppOutbox',
      entityId: created?.id ?? 'skipped',
      newData: { phone: dto.phone },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return (
      created ?? {
        skipped: 'Nomor kosong atau WA dinonaktifkan di preferensi.',
      }
    );
  }
}
