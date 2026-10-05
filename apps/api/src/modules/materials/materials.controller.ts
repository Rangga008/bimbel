import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { PERMISSION_CODES } from '../rbac/permissions.constants';
import { AuditService } from '../../common/audit/audit.service';
import { MaterialsService } from './materials.service';
import { CreateMaterialDto, UpdateMaterialDto } from './dto/material.dto';

function ctx(req: Request) {
  return { ipAddress: req.ip, userAgent: req.headers['user-agent'] };
}

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MaterialsController {
  constructor(
    private readonly materials: MaterialsService,
    private readonly audit: AuditService,
  ) {}

  @Get('materials')
  @RequirePermissions(PERMISSION_CODES.MATERIAL_VIEW)
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('programId') programId?: string,
    @Query('levelId') levelId?: string,
    @Query('groupId') groupId?: string,
    @Query('subjectId') subjectId?: string,
    @Query('category') category?: string,
    @Query('search') search?: string,
  ) {
    return this.materials.list(actor, { programId, levelId, groupId, subjectId, category, search });
  }

  @Get('materials/:id')
  @RequirePermissions(PERMISSION_CODES.MATERIAL_VIEW)
  get(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.materials.get(id, actor);
  }

  @Post('materials')
  @RequirePermissions(PERMISSION_CODES.MATERIAL_MANAGE)
  async create(
    @Body() dto: CreateMaterialDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const created = await this.materials.create(dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'MATERIAL_CREATED',
      entity: 'Material',
      entityId: created.id,
      newData: { title: dto.title, programId: dto.programId, levelId: dto.levelId, groupId: dto.groupId },
      ...ctx(req),
    });
    return created;
  }

  @Patch('materials/:id')
  @RequirePermissions(PERMISSION_CODES.MATERIAL_MANAGE)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateMaterialDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const before = await this.materials.get(id);
    const updated = await this.materials.update(id, dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'MATERIAL_UPDATED',
      entity: 'Material',
      entityId: id,
      oldData: { title: before.title, programId: before.programId, levelId: before.levelId, groupId: before.groupId },
      newData: { title: updated.title, programId: updated.programId, levelId: updated.levelId, groupId: updated.groupId },
      ...ctx(req),
    });
    return updated;
  }

  @Delete('materials/:id')
  @RequirePermissions(PERMISSION_CODES.MATERIAL_MANAGE)
  async delete(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const before = await this.materials.get(id);
    await this.materials.delete(id);
    await this.audit.log({
      actorId: actor.id,
      action: 'MATERIAL_DELETED',
      entity: 'Material',
      entityId: id,
      oldData: { title: before.title, programId: before.programId, levelId: before.levelId, groupId: before.groupId },
      ...ctx(req),
    });
    return { success: true };
  }
}