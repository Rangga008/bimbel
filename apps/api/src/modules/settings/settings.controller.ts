// Fase 6 — Endpoint pengaturan aplikasi (halaman Pengaturan admin finance).
// PUT /settings/:key adalah aksi tulis konfigurasi -> selalu diaudit.
import {
  Body,
  Controller,
  Get,
  Param,
  Put,
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
import { SettingsService } from './settings.service';

function ctx(req: Request) {
  return { ipAddress: req.ip, userAgent: req.headers['user-agent'] };
}

@Controller('settings')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  /** Semua setting ter-group: { company, finance, whatsapp }. */
  @Get()
  @RequirePermissions(PERMISSION_CODES.SETTINGS_MANAGE)
  getAll() {
    return this.settings.getAll();
  }

  @Put(':key')
  @RequirePermissions(PERMISSION_CODES.SETTINGS_MANAGE)
  async set(
    @Param('key') key: string,
    @Body() body: { value?: unknown },
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const { row, oldValue, newValue } = await this.settings.set(
      key,
      body?.value,
      actor.id,
    );
    await this.audit.log({
      actorId: actor.id,
      action: 'APP_SETTING_UPDATED',
      entity: 'AppSetting',
      entityId: key,
      oldData: oldValue,
      newData: newValue,
      ...ctx(req),
    });
    return { key: row.key, value: newValue, updatedAt: row.updatedAt };
  }
}
