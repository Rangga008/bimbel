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
import {
  RequireAnyPermissions,
  RequirePermissions,
} from '../rbac/permissions.decorator';
import { PERMISSION_CODES } from '../rbac/permissions.constants';
import { AuditService } from '../../common/audit/audit.service';
import { PackagesService } from './packages.service';
import { CreatePackageDto } from './dto/create-package.dto';
import { UpdatePackageDto } from './dto/update-package.dto';

/** CRUD Package. */
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PackagesController {
  constructor(
    private readonly packages: PackagesService,
    private readonly audit: AuditService,
  ) {}

  @Get('packages')
  @RequirePermissions(PERMISSION_CODES.PEOPLE_VIEW)
  list(
    @Query('levelId') levelId?: string,
    @Query('programId') programId?: string,
  ) {
    return this.packages.list({ levelId, programId });
  }

  @Get('packages/:id')
  @RequirePermissions(PERMISSION_CODES.PEOPLE_VIEW)
  get(@Param('id') id: string) {
    return this.packages.get(id);
  }

  @Post('packages')
  @RequirePermissions(PERMISSION_CODES.PROGRAM_MANAGE)
  async create(
    @Body() dto: CreatePackageDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const created = await this.packages.create(dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'PACKAGE_CREATED',
      entity: 'Package',
      entityId: created.id,
      newData: { levelId: dto.levelId, name: dto.name },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return created;
  }

  @Patch('packages/:id')
  @RequirePermissions(PERMISSION_CODES.PROGRAM_MANAGE)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePackageDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const before = await this.packages.get(id);
    const updated = await this.packages.update(id, dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'PACKAGE_UPDATED',
      entity: 'Package',
      entityId: id,
      oldData: { name: before.name, totalSessions: before.totalSessions },
      newData: dto,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return updated;
  }

  /**
   * Set harga paket saja — untuk Admin Finance (`price.manage`) tanpa memberi
   * akses ke struktur program/level (`program.manage` tetap boleh).
   */
  @Patch('packages/:id/price')
  @RequireAnyPermissions(
    PERMISSION_CODES.PROGRAM_MANAGE,
    PERMISSION_CODES.PRICE_MANAGE,
  )
  async setPrice(
    @Param('id') id: string,
    @Body() dto: { price: number | null },
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const before = await this.packages.get(id);
    const updated = await this.packages.setPrice(id, dto.price);
    await this.audit.log({
      actorId: actor.id,
      action: 'PACKAGE_PRICE_UPDATED',
      entity: 'Package',
      entityId: id,
      oldData: { name: before.name, price: String(before.price ?? 'null') },
      newData: { price: dto.price },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return updated;
  }

  @Delete('packages/:id')
  @RequirePermissions(PERMISSION_CODES.PROGRAM_MANAGE)
  async remove(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const result = await this.packages.remove(id);
    await this.audit.log({
      actorId: actor.id,
      action: 'PACKAGE_DELETED',
      entity: 'Package',
      entityId: id,
      newData: result,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return result;
  }
}
