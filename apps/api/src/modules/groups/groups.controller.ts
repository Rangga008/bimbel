import {
  Body,
  Controller,
  Delete,
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
import { GroupsService } from './groups.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { AssignStudentDto } from './dto/assign-student.dto';
import { AssignTutorDto } from './dto/assign-tutor.dto';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class GroupsController {
  constructor(
    private readonly groups: GroupsService,
    private readonly audit: AuditService,
  ) {}

  private auditCtx(req: Request) {
    return { ipAddress: req.ip, userAgent: req.headers['user-agent'] };
  }

  @Get('groups')
  @RequirePermissions(PERMISSION_CODES.GROUP_VIEW)
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('search') search?: string,
    @Query('programId') programId?: string,
    @Query('levelId') levelId?: string,
    @Query('isActive') isActive?: string,
  ) {
    return this.groups.list(actor, { search, programId, levelId, isActive });
  }

  @Get('groups/mine')
  @RequirePermissions(PERMISSION_CODES.DASHBOARD_TUTOR_VIEW)
  listMine(@CurrentUser() actor: AuthenticatedUser) {
    return this.groups.listMine(actor.id);
  }

  @Get('groups/mine/:id')
  @RequirePermissions(PERMISSION_CODES.DASHBOARD_TUTOR_VIEW)
  getMine(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.groups.getMine(id, actor.id);
  }

  @Get('groups/:id')
  @RequirePermissions(PERMISSION_CODES.GROUP_VIEW)
  get(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.groups.get(id, actor);
  }

  @Post('groups')
  @RequirePermissions(PERMISSION_CODES.GROUP_MANAGE)
  async create(
    @Body() dto: CreateGroupDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const created = await this.groups.create(dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'GROUP_CREATED',
      entity: 'LearningGroup',
      entityId: created.id,
      newData: { name: dto.name, code: dto.code, programId: dto.programId },
      ...this.auditCtx(req),
    });
    return created;
  }

  @Patch('groups/:id')
  @RequirePermissions(PERMISSION_CODES.GROUP_MANAGE)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateGroupDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const before = await this.groups.get(id);
    const updated = await this.groups.update(id, dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'GROUP_UPDATED',
      entity: 'LearningGroup',
      entityId: id,
      oldData: { name: before.name, code: before.code, isActive: before.isActive },
      newData: dto,
      ...this.auditCtx(req),
    });
    return updated;
  }

  @Delete('groups/:id')
  @RequirePermissions(PERMISSION_CODES.GROUP_MANAGE)
  async remove(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const removed = await this.groups.remove(id);
    await this.audit.log({
      actorId: actor.id,
      action: 'GROUP_DELETED',
      entity: 'LearningGroup',
      entityId: id,
      oldData: { name: removed.name },
      ...this.auditCtx(req),
    });
    return removed;
  }

  @Post('groups/:id/students')
  @RequirePermissions(PERMISSION_CODES.GROUP_MANAGE)
  async assignStudent(
    @Param('id') id: string,
    @Body() dto: AssignStudentDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const result = await this.groups.assignStudent(id, dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'GROUP_STUDENT_ASSIGNED',
      entity: 'LearningGroup',
      entityId: id,
      newData: { studentId: dto.studentId },
      ...this.auditCtx(req),
    });
    return result;
  }

  @Delete('groups/:id/students/:studentId')
  @RequirePermissions(PERMISSION_CODES.GROUP_MANAGE)
  async unassignStudent(
    @Param('id') id: string,
    @Param('studentId') studentId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const result = await this.groups.unassignStudent(id, studentId);
    await this.audit.log({
      actorId: actor.id,
      action: 'GROUP_STUDENT_UNASSIGNED',
      entity: 'LearningGroup',
      entityId: id,
      oldData: { studentId },
      ...this.auditCtx(req),
    });
    return result;
  }

  @Post('groups/:id/tutors')
  @RequirePermissions(PERMISSION_CODES.GROUP_MANAGE)
  async assignTutor(
    @Param('id') id: string,
    @Body() dto: AssignTutorDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const result = await this.groups.assignTutor(id, dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'GROUP_TUTOR_ASSIGNED',
      entity: 'LearningGroup',
      entityId: id,
      newData: { tutorId: dto.tutorId, isLead: dto.isLead ?? false },
      ...this.auditCtx(req),
    });
    return result;
  }

  @Delete('groups/:id/tutors/:tutorId')
  @RequirePermissions(PERMISSION_CODES.GROUP_MANAGE)
  async unassignTutor(
    @Param('id') id: string,
    @Param('tutorId') tutorId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const result = await this.groups.unassignTutor(id, tutorId);
    await this.audit.log({
      actorId: actor.id,
      action: 'GROUP_TUTOR_UNASSIGNED',
      entity: 'LearningGroup',
      entityId: id,
      oldData: { tutorId },
      ...this.auditCtx(req),
    });
    return result;
  }
}
