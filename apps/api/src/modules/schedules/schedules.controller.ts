// Controller Fase 1c: schedules, sessions, overrides, facilities (part 1).
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { PERMISSION_CODES } from '../rbac/permissions.constants';
import { AuditService } from '../../common/audit/audit.service';
import { SchedulesService } from './schedules.service';
import { SessionGenerateService } from './session-generate.service';
import { CreateScheduleDto, GenerateSessionsDto, UpdateScheduleDto } from './dto/schedule-session.dto';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SchedulesController {
  constructor(
    private readonly schedules: SchedulesService,
    private readonly generator: SessionGenerateService,
    private readonly audit: AuditService,
  ) {}

  ctx(req: Request) {
    return { ipAddress: req.ip, userAgent: req.headers['user-agent'] };
  }

  @Get('schedules')
  @RequirePermissions(PERMISSION_CODES.SCHEDULE_VIEW)
  listSchedules(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('groupId') groupId?: string,
    @Query('isActive') isActive?: string,
  ) {
    return this.schedules.list(actor, { groupId, isActive });
  }

  @Get('schedules/:id')
  @RequirePermissions(PERMISSION_CODES.SCHEDULE_VIEW)
  getSchedule(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.schedules.get(id, actor);
  }

  @Post('schedules')
  @RequirePermissions(PERMISSION_CODES.SCHEDULE_MANAGE)
  async createSchedule(@Body() dto: CreateScheduleDto, @CurrentUser() actor: AuthenticatedUser, @Req() req: Request) {
    const created = await this.schedules.create(dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'SCHEDULE_CREATED',
      entity: 'Schedule',
      entityId: created.id,
      newData: { groupId: dto.groupId, dayOfWeek: dto.dayOfWeek, startMin: dto.startMin, endMin: dto.endMin },
      ...this.ctx(req),
    });
    return created;
  }

  @Patch('schedules/:id')
  @RequirePermissions(PERMISSION_CODES.SCHEDULE_MANAGE)
  async updateSchedule(
    @Param('id') id: string,
    @Body() dto: UpdateScheduleDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const before = await this.schedules.get(id);
    const updated = await this.schedules.update(id, dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'SCHEDULE_UPDATED',
      entity: 'Schedule',
      entityId: id,
      oldData: { tutorId: before.tutorId, roomId: before.roomId, dayOfWeek: before.dayOfWeek },
      newData: dto,
      ...this.ctx(req),
    });
    return updated;
  }

  @Delete('schedules/:id')
  @RequirePermissions(PERMISSION_CODES.SCHEDULE_MANAGE)
  async deleteSchedule(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const result = await this.schedules.remove(id);
    await this.audit.log({
      actorId: actor.id,
      action: 'SCHEDULE_DELETED',
      entity: 'Schedule',
      entityId: id,
      oldData: result,
      ...this.ctx(req),
    });
    return result;
  }

  @Post('schedules/:id/generate')
  @RequirePermissions(PERMISSION_CODES.SCHEDULE_MANAGE)
  async generate(
    @Param('id') id: string,
    @Body() dto: GenerateSessionsDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const result = await this.generator.generate(id, dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'SCHEDULE_SESSIONS_GENERATED',
      entity: 'Schedule',
      entityId: id,
      newData: result,
      ...this.ctx(req),
    });
    return result;
  }
}
