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
import { RequireAnyPermissions } from '../rbac/permissions.decorator';
import { PERMISSION_CODES } from '../rbac/permissions.constants';
import { AuditService } from '../../common/audit/audit.service';
import { ContentCategoriesService } from './content-categories.service';
import {
  CreateContentCategoryDto,
  UpdateContentCategoryDto,
} from './dto/content-category.dto';

function ctx(req: Request) {
  return { ipAddress: req.ip, userAgent: req.headers['user-agent'] };
}

@Controller('content-categories')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ContentCategoriesController {
  constructor(
    private readonly categories: ContentCategoriesService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Semua role yang login membaca daftar kategori (dipakai dropdown materi,
   * soal, latsol, ujian — termasuk siswa). `?all=1` untuk pengelola melihat
   * yang nonaktif.
   */
  @Get()
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('all') all?: string,
  ) {
    const canManage =
      actor.permissions.includes(PERMISSION_CODES.QUESTION_MANAGE) ||
      actor.permissions.includes(PERMISSION_CODES.MATERIAL_MANAGE) ||
      actor.permissions.includes(PERMISSION_CODES.EXAM_MANAGE);
    return this.categories.list(all === '1' && canManage);
  }

  @Post()
  @RequireAnyPermissions(
    PERMISSION_CODES.QUESTION_MANAGE,
    PERMISSION_CODES.MATERIAL_MANAGE,
    PERMISSION_CODES.EXAM_MANAGE,
  )
  async create(
    @Body() dto: CreateContentCategoryDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const created = await this.categories.create(dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'CONTENT_CATEGORY_CREATED',
      entity: 'ContentCategoryDef',
      entityId: created.id,
      newData: { code: created.code, name: created.name },
      ...ctx(req),
    });
    return created;
  }

  @Patch(':id')
  @RequireAnyPermissions(
    PERMISSION_CODES.QUESTION_MANAGE,
    PERMISSION_CODES.MATERIAL_MANAGE,
    PERMISSION_CODES.EXAM_MANAGE,
  )
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateContentCategoryDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const updated = await this.categories.update(id, dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'CONTENT_CATEGORY_UPDATED',
      entity: 'ContentCategoryDef',
      entityId: id,
      newData: { name: updated.name, isActive: updated.isActive },
      ...ctx(req),
    });
    return updated;
  }

  @Delete(':id')
  @RequireAnyPermissions(
    PERMISSION_CODES.QUESTION_MANAGE,
    PERMISSION_CODES.MATERIAL_MANAGE,
    PERMISSION_CODES.EXAM_MANAGE,
  )
  async delete(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const result = await this.categories.delete(id);
    await this.audit.log({
      actorId: actor.id,
      action: 'CONTENT_CATEGORY_DELETED',
      entity: 'ContentCategoryDef',
      entityId: id,
      ...ctx(req),
    });
    return result;
  }
}
