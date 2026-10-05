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
import { ParentsService } from './parents.service';
import { ParentStudentService } from './parent-student.service';
import { CreateParentDto } from './dto/create-parent.dto';
import { UpdateParentDto } from './dto/update-parent.dto';
import { LinkParentStudentDto } from './dto/link-parent-student.dto';

/** CRUD Parent + relasi parent_students. */
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ParentsController {
  constructor(
    private readonly parents: ParentsService,
    private readonly links: ParentStudentService,
    private readonly audit: AuditService,
  ) {}

  @Get('parents')
  @RequirePermissions(PERMISSION_CODES.PEOPLE_VIEW)
  list(@Query('search') search?: string) {
    return this.parents.list({ search });
  }

  @Get('parents/:id')
  @RequirePermissions(PERMISSION_CODES.PEOPLE_VIEW)
  get(@Param('id') id: string) {
    return this.parents.get(id);
  }

  @Post('parents')
  @RequirePermissions(PERMISSION_CODES.PEOPLE_PARENT_MANAGE)
  async create(
    @Body() dto: CreateParentDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const created = await this.parents.create(dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'PARENT_CREATED',
      entity: 'Parent',
      entityId: created.id,
      newData: { email: dto.email, studentIds: dto.studentIds ?? [] },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return created;
  }

  @Patch('parents/:id')
  @RequirePermissions(PERMISSION_CODES.PEOPLE_PARENT_MANAGE)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateParentDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const before = await this.parents.get(id);
    const updated = await this.parents.update(id, dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'PARENT_UPDATED',
      entity: 'Parent',
      entityId: id,
      oldData: { isActive: before.isActive },
      newData: dto,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return updated;
  }

  /** Hapus ortu — hanya bila tak terhubung anak & tanpa pendaftaran. */
  @Delete('parents/:id')
  @RequirePermissions(PERMISSION_CODES.PEOPLE_PARENT_MANAGE)
  async remove(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const before = await this.parents.get(id);
    const result = await this.parents.remove(id);
    await this.audit.log({
      actorId: actor.id,
      action: 'PARENT_DELETED',
      entity: 'Parent',
      entityId: id,
      oldData: { name: before.user.name, email: before.user.email },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return result;
  }

  @Post('parent-students')
  @RequirePermissions(PERMISSION_CODES.PEOPLE_PARENT_MANAGE)
  async link(
    @Body() dto: LinkParentStudentDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const created = await this.links.link(dto.parentId, dto.studentId);
    await this.audit.log({
      actorId: actor.id,
      action: 'PARENT_STUDENT_LINKED',
      entity: 'ParentStudent',
      entityId: created.id,
      newData: { parentId: dto.parentId, studentId: dto.studentId },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return created;
  }

  @Delete('parent-students/:parentId/:studentId')
  @RequirePermissions(PERMISSION_CODES.PEOPLE_PARENT_MANAGE)
  async unlink(
    @Param('parentId') parentId: string,
    @Param('studentId') studentId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const result = await this.links.unlink(parentId, studentId);
    await this.audit.log({
      actorId: actor.id,
      action: 'PARENT_STUDENT_UNLINKED',
      entity: 'ParentStudent',
      entityId: `${parentId}:${studentId}`,
      oldData: { parentId, studentId },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return result;
  }
}
