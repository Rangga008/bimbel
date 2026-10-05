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
import {
  RequireAnyPermissions,
  RequirePermissions,
} from '../rbac/permissions.decorator';
import { PERMISSION_CODES } from '../rbac/permissions.constants';
import { AuditService } from '../../common/audit/audit.service';
import { MasterDataService, type MasterRowInput } from './master-data.service';

function ctx(req: Request) {
  return { ipAddress: req.ip, userAgent: req.headers['user-agent'] };
}

/**
 * Master data kurikulum (mapel & level kelas).
 * Read: semua peran yang butuh dropdown (admin, tutor yang meilih program).
 * Write: program.manage (admin akademik/owner).
 */
@Controller('master')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MasterDataController {
  constructor(
    private readonly masterData: MasterDataService,
    private readonly audit: AuditService,
  ) {}

  @Get('subjects')
  @RequireAnyPermissions(
    PERMISSION_CODES.PEOPLE_VIEW,
    PERMISSION_CODES.DASHBOARD_TUTOR_VIEW,
  )
  subjects(@Query('all') all?: string) {
    return this.masterData.listSubjects(all === 'true');
  }

  @Post('subjects')
  @RequirePermissions(PERMISSION_CODES.PROGRAM_MANAGE)
  async createSubject(
    @Body() dto: MasterRowInput,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const created = await this.masterData.createSubject(dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'MASTER_SUBJECT_CREATED',
      entity: 'Subject',
      entityId: created.id,
      newData: { code: created.code, name: created.name },
      ...ctx(req),
    });
    return created;
  }

  @Patch('subjects/:id')
  @RequirePermissions(PERMISSION_CODES.PROGRAM_MANAGE)
  async updateSubject(
    @Param('id') id: string,
    @Body() dto: MasterRowInput,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const updated = await this.masterData.updateSubject(id, dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'MASTER_SUBJECT_UPDATED',
      entity: 'Subject',
      entityId: id,
      newData: { code: updated.code, name: updated.name, isActive: updated.isActive },
      ...ctx(req),
    });
    return updated;
  }

  @Get('grade-levels')
  @RequireAnyPermissions(
    PERMISSION_CODES.PEOPLE_VIEW,
    PERMISSION_CODES.DASHBOARD_TUTOR_VIEW,
  )
  gradeLevels(@Query('all') all?: string) {
    return this.masterData.listGradeLevels(all === 'true');
  }

  @Post('grade-levels')
  @RequirePermissions(PERMISSION_CODES.PROGRAM_MANAGE)
  async createGradeLevel(
    @Body() dto: MasterRowInput,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const created = await this.masterData.createGradeLevel(dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'MASTER_GRADE_LEVEL_CREATED',
      entity: 'GradeLevel',
      entityId: created.id,
      newData: { code: created.code, name: created.name },
      ...ctx(req),
    });
    return created;
  }

  @Patch('grade-levels/:id')
  @RequirePermissions(PERMISSION_CODES.PROGRAM_MANAGE)
  async updateGradeLevel(
    @Param('id') id: string,
    @Body() dto: MasterRowInput,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const updated = await this.masterData.updateGradeLevel(id, dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'MASTER_GRADE_LEVEL_UPDATED',
      entity: 'GradeLevel',
      entityId: id,
      newData: { code: updated.code, name: updated.name, isActive: updated.isActive },
      ...ctx(req),
    });
    return updated;
  }
}
