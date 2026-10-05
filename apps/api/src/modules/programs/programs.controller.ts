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
import { ProgramsService } from './programs.service';
import { CreateProgramDto } from './dto/create-program.dto';
import { UpdateProgramDto } from './dto/update-program.dto';

/** CRUD Program. Tulis butuh `program.manage`, baca butuh `people.view`. */
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProgramsController {
  constructor(
    private readonly programs: ProgramsService,
    private readonly audit: AuditService,
  ) {}

  @Get('programs')
  // Tutor boleh memanggil — hasilnya dibatasi program yang dia ampu.
  @RequireAnyPermissions(
    PERMISSION_CODES.PEOPLE_VIEW,
    PERMISSION_CODES.DASHBOARD_TUTOR_VIEW,
  )
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('search') search?: string,
    @Query('isActive') isActive?: string,
  ) {
    return this.programs.list(actor, { search, isActive });
  }

  @Get('programs/options')
  @RequireAnyPermissions(
    PERMISSION_CODES.PEOPLE_VIEW,
    PERMISSION_CODES.DASHBOARD_TUTOR_VIEW,
  )
  options(@CurrentUser() actor: AuthenticatedUser) {
    return this.programs.options(actor);
  }

  /** Katalog read-only untuk halaman "Program" Orang Tua — cukup login. */
  @Get('programs/catalog')
  catalog() {
    return this.programs.catalog();
  }

  @Get('programs/:id')
  @RequirePermissions(PERMISSION_CODES.PEOPLE_VIEW)
  get(@Param('id') id: string) {
    return this.programs.get(id);
  }

  @Post('programs')
  @RequirePermissions(PERMISSION_CODES.PROGRAM_MANAGE)
  async create(
    @Body() dto: CreateProgramDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const created = await this.programs.create(dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'PROGRAM_CREATED',
      entity: 'Program',
      entityId: created.id,
      newData: { code: dto.code, name: dto.name },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return created;
  }

  @Patch('programs/:id')
  @RequirePermissions(PERMISSION_CODES.PROGRAM_MANAGE)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProgramDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const before = await this.programs.get(id);
    const updated = await this.programs.update(id, dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'PROGRAM_UPDATED',
      entity: 'Program',
      entityId: id,
      oldData: { name: before.name, code: before.code },
      newData: dto,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return updated;
  }

  @Delete('programs/:id')
  @RequirePermissions(PERMISSION_CODES.PROGRAM_MANAGE)
  async remove(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const result = await this.programs.remove(id);
    await this.audit.log({
      actorId: actor.id,
      action: 'PROGRAM_DELETED',
      entity: 'Program',
      entityId: id,
      newData: result,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return result;
  }
}
