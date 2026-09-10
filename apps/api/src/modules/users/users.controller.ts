import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { PERMISSION_CODES } from '../rbac/permissions.constants';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { AssignRoleDto } from './dto/assign-role.dto';
import { UsersService } from './users.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';

/**
 * Endpoint pengelolaan role user — cakupan minimal Fase 0 supaya DoD "audit log
 * tercatat saat role/permission user berubah" bisa diuji end-to-end.
 * CRUD profil user lengkap (siswa/tutor/dsb) ada di modul people (Fase 1).
 */
@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  @Post(':id/roles')
  @RequirePermissions(PERMISSION_CODES.RBAC_MANAGE_ROLES)
  async assignRole(
    @Param('id') userId: string,
    @Body() dto: AssignRoleDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const [user, role] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.prisma.role.findUnique({ where: { id: dto.roleId } }),
    ]);
    if (!user) throw new NotFoundException('User tidak ditemukan.');
    if (!role) throw new NotFoundException('Role tidak ditemukan.');

    const before = await this.usersService.findByIdWithRoles(userId);
    await this.usersService.assignRole(userId, dto.roleId);
    const after = await this.usersService.findByIdWithRoles(userId);

    await this.auditService.log({
      actorId: actor.id,
      action: 'USER_ROLE_ASSIGNED',
      entity: 'User',
      entityId: userId,
      oldData: before && this.usersService.buildRolesAndPermissions(before),
      newData: after && this.usersService.buildRolesAndPermissions(after),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return { success: true };
  }

  @Delete(':id/roles/:roleId')
  @RequirePermissions(PERMISSION_CODES.RBAC_MANAGE_ROLES)
  async revokeRole(
    @Param('id') userId: string,
    @Param('roleId') roleId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    if (actor.id === userId) {
      throw new ForbiddenException('Tidak bisa mengubah role akun sendiri.');
    }

    const before = await this.usersService.findByIdWithRoles(userId);
    if (!before) throw new NotFoundException('User tidak ditemukan.');

    await this.usersService.revokeRole(userId, roleId);
    const after = await this.usersService.findByIdWithRoles(userId);

    await this.auditService.log({
      actorId: actor.id,
      action: 'USER_ROLE_REVOKED',
      entity: 'User',
      entityId: userId,
      oldData: this.usersService.buildRolesAndPermissions(before),
      newData: after && this.usersService.buildRolesAndPermissions(after),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return { success: true };
  }
}
