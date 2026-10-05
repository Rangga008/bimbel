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
import { LevelsService } from './levels.service';
import { CreateLevelDto } from './dto/create-level.dto';
import { UpdateLevelDto } from './dto/update-level.dto';

/** CRUD Level. */
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LevelsController {
  constructor(
    private readonly levels: LevelsService,
    private readonly audit: AuditService,
  ) {}

  @Get('levels')
  // Tutor boleh memanggil — hasilnya dibatasi program yang dia ampu.
  // Siswa juga boleh — hasilnya dibatasi jenjang enrollment/kelompoknya,
  // dipakai drill-down materi/latsol/ujian di portal siswa.
  @RequireAnyPermissions(
    PERMISSION_CODES.PEOPLE_VIEW,
    PERMISSION_CODES.DASHBOARD_TUTOR_VIEW,
    PERMISSION_CODES.DASHBOARD_SISWA_VIEW,
  )
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('programId') programId?: string,
  ) {
    return this.levels.list(actor, { programId });
  }

  @Get('levels/:id')
  @RequirePermissions(PERMISSION_CODES.PEOPLE_VIEW)
  get(@Param('id') id: string) {
    return this.levels.get(id);
  }

  @Post('levels')
  @RequirePermissions(PERMISSION_CODES.PROGRAM_MANAGE)
  async create(
    @Body() dto: CreateLevelDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const created = await this.levels.create(dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'LEVEL_CREATED',
      entity: 'Level',
      entityId: created.id,
      newData: { programId: dto.programId, name: dto.name },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return created;
  }

  @Patch('levels/:id')
  @RequirePermissions(PERMISSION_CODES.PROGRAM_MANAGE)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateLevelDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const before = await this.levels.get(id);
    const updated = await this.levels.update(id, dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'LEVEL_UPDATED',
      entity: 'Level',
      entityId: id,
      oldData: { name: before.name },
      newData: dto,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return updated;
  }

  /**
   * Set harga jenjang saja — untuk Admin Finance (`price.manage`) tanpa
   * memberi akses ubah struktur level (`program.manage` tetap boleh).
   */
  @Patch('levels/:id/pricing')
  @RequireAnyPermissions(
    PERMISSION_CODES.PROGRAM_MANAGE,
    PERMISSION_CODES.PRICE_MANAGE,
  )
  async setPricing(
    @Param('id') id: string,
    @Body() dto: UpdateLevelDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const before = await this.levels.get(id);
    const updated = await this.levels.setPricing(id, dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'LEVEL_PRICING_UPDATED',
      entity: 'Level',
      entityId: id,
      oldData: { name: before.name, price: String(before.price ?? 'null') },
      newData: dto,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return updated;
  }
}
