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
import { TutorsService } from './tutors.service';
import { CreateTutorDto } from './dto/create-tutor.dto';
import { UpdateTutorDto } from './dto/update-tutor.dto';

/** CRUD Tutor (termasuk perubahan status kepegawaian -> audit log). */
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TutorsController {
  constructor(
    private readonly tutors: TutorsService,
    private readonly audit: AuditService,
  ) {}

  @Get('tutors')
  @RequirePermissions(PERMISSION_CODES.PEOPLE_VIEW)
  list(@Query('search') search?: string, @Query('isActive') isActive?: string) {
    return this.tutors.list({ search, isActive });
  }

  @Get('tutors/:id')
  @RequirePermissions(PERMISSION_CODES.PEOPLE_VIEW)
  get(@Param('id') id: string) {
    return this.tutors.get(id);
  }

  @Post('tutors')
  @RequirePermissions(PERMISSION_CODES.PEOPLE_TUTOR_MANAGE)
  async create(
    @Body() dto: CreateTutorDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const created = await this.tutors.create(dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'TUTOR_CREATED',
      entity: 'Tutor',
      entityId: created.id,
      newData: { email: dto.email },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return created;
  }

  @Patch('tutors/:id')
  @RequirePermissions(PERMISSION_CODES.PEOPLE_TUTOR_MANAGE)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTutorDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const before = await this.tutors.get(id);
    const updated = await this.tutors.update(id, dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'TUTOR_STATUS_CHANGED',
      entity: 'Tutor',
      entityId: id,
      oldData: { isActive: before.isActive },
      newData: dto,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return updated;
  }

  @Delete('tutors/:id')
  @RequirePermissions(PERMISSION_CODES.PEOPLE_TUTOR_MANAGE)
  async remove(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const deleted = await this.tutors.remove(id);
    await this.audit.log({
      actorId: actor.id,
      action: 'TUTOR_DELETED',
      entity: 'Tutor',
      entityId: id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return deleted;
  }
}
