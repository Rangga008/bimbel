import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
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
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UsersService } from './users.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';

/**
 * Fase 0b — Manajemen Akun (halaman Owner):
 * list/create/edit/nonaktifkan user, assign role, reset password.
 * Semua aksi kritis masuk audit log.
 */
@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSION_CODES.USERS_MANAGE)
  async list(
    @Query('search') search?: string,
    @Query('isActive') isActive?: string,
    @Query('role') role?: string,
  ) {
    return this.usersService.listUsers({ search, isActive, role });
  }

  @Get('roles')
  @RequirePermissions(PERMISSION_CODES.USERS_MANAGE)
  async listRoles() {
    return this.prisma.role.findMany({ orderBy: { name: 'asc' } });
  }

  @Get(':id')
  @RequirePermissions(PERMISSION_CODES.USERS_MANAGE)
  async detail(@Param('id') id: string) {
    if (id === 'roles') throw new NotFoundException('User tidak ditemukan.');
    return this.usersService.getUser(id);
  }

  @Post()
  @RequirePermissions(PERMISSION_CODES.USERS_MANAGE)
  async create(
    @Body() dto: CreateUserDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const created = await this.usersService.createUser(dto);
    await this.auditService.log({
      actorId: actor.id,
      action: 'USER_CREATED',
      entity: 'User',
      entityId: created.id,
      newData: { email: created.email, name: created.name, roles: created.roles },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return created;
  }

  @Patch(':id')
  @RequirePermissions(PERMISSION_CODES.USERS_MANAGE)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const before = await this.usersService.findByIdWithRoles(id);
    if (!before) throw new NotFoundException('User tidak ditemukan.');
    const updated = await this.usersService.updateUser(id, dto);
    await this.auditService.log({
      actorId: actor.id,
      action: 'USER_UPDATED',
      entity: 'User',
      entityId: id,
      oldData: {
        email: before.email,
        name: before.name,
        phone: before.phone,
        isActive: before.isActive,
      },
      newData: {
        email: updated.email,
        name: updated.name,
        phone: updated.phone,
        isActive: updated.isActive,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return updated;
  }

  @Post(':id/deactivate')
  @RequirePermissions(PERMISSION_CODES.USERS_MANAGE)
  async deactivate(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    if (actor.id === id) {
      throw new ForbiddenException('Tidak bisa menonaktifkan akun sendiri.');
    }
    const before = await this.usersService.findByIdWithRoles(id);
    if (!before) throw new NotFoundException('User tidak ditemukan.');
    const updated = await this.usersService.deactivateUser(id);
    await this.auditService.log({
      actorId: actor.id,
      action: 'USER_DEACTIVATED',
      entity: 'User',
      entityId: id,
      oldData: { isActive: before.isActive },
      newData: { isActive: updated.isActive },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return updated;
  }

  @Post(':id/activate')
  @RequirePermissions(PERMISSION_CODES.USERS_MANAGE)
  async activate(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const before = await this.usersService.findByIdWithRoles(id);
    if (!before) throw new NotFoundException('User tidak ditemukan.');
    const updated = await this.usersService.activateUser(id);
    await this.auditService.log({
      actorId: actor.id,
      action: 'USER_ACTIVATED',
      entity: 'User',
      entityId: id,
      oldData: { isActive: before.isActive },
      newData: { isActive: updated.isActive },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return updated;
  }

  @Post(':id/reset-password')
  @RequirePermissions(PERMISSION_CODES.USERS_RESET_PASSWORD)
  async resetPassword(
    @Param('id') id: string,
    @Body() dto: ResetPasswordDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    await this.usersService.resetPassword(id, dto.newPassword);
    await this.auditService.log({
      actorId: actor.id,
      action: 'USER_PASSWORD_RESET',
      entity: 'User',
      entityId: id,
      // Sengaja TIDAK menyimpan password baru di audit log.
      newData: { resetAt: new Date().toISOString() },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return { success: true };
  }

  @Post(':id/roles')
  @RequirePermissions(PERMISSION_CODES.USERS_MANAGE)
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
  @RequirePermissions(PERMISSION_CODES.USERS_MANAGE)
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
