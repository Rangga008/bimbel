// Controller Fase 1d: inbox in-app milik sendiri + preferensi + 1 contoh manual trigger.
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
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
import { NotificationsService } from './notifications.service';
import {
  CreateNotificationDto,
  UpdatePreferenceDto,
} from './dto/notification.dto';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  @Get('notifications/mine')
  @RequirePermissions(PERMISSION_CODES.NOTIFICATION_VIEW)
  mine(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    return this.notifications.mine(actor.id, unreadOnly === 'true');
  }

  @Get('notifications/unread-count')
  @RequirePermissions(PERMISSION_CODES.NOTIFICATION_VIEW)
  unreadCount(@CurrentUser() actor: AuthenticatedUser) {
    return this.notifications
      .unreadCount(actor.id)
      .then((count) => ({ count }));
  }

  @Patch('notifications/:id/read')
  @RequirePermissions(PERMISSION_CODES.NOTIFICATION_VIEW)
  markRead(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.notifications.markRead(actor.id, id);
  }

  @Post('notifications/read-all')
  @RequirePermissions(PERMISSION_CODES.NOTIFICATION_VIEW)
  markAllRead(@CurrentUser() actor: AuthenticatedUser) {
    return this.notifications.markAllRead(actor.id);
  }

  @Get('notifications/preference')
  @RequirePermissions(PERMISSION_CODES.NOTIFICATION_VIEW)
  myPreference(@CurrentUser() actor: AuthenticatedUser) {
    return this.notifications.myPreference(actor.id);
  }

  @Patch('notifications/preference')
  @RequirePermissions(PERMISSION_CODES.NOTIFICATION_VIEW)
  updatePreference(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: UpdatePreferenceDto,
  ) {
    return this.notifications.updatePreference(actor.id, dto);
  }

  /** 1 contoh manual trigger (admin/owner). Trigger otomatis menyusul Fase 5. */
  @Post('notifications')
  @RequirePermissions(PERMISSION_CODES.RBAC_MANAGE_ROLES)
  async create(
    @Body() dto: CreateNotificationDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const created = await this.notifications.create(dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'NOTIFICATION_SENT',
      entity: 'Notification',
      entityId: created.id,
      newData: { userId: dto.userId, title: dto.title },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return created;
  }
}
