import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { PERMISSION_CODES } from '../rbac/permissions.constants';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';

/**
 * Endpoint dashboard placeholder per role — dipakai untuk membuktikan guard permission
 * bekerja end-to-end (DoD auth-rbac). Konten nyata dashboard menyusul di fase modul terkait.
 */
@Controller('dashboard')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DashboardController {
  @Get('siswa')
  @RequirePermissions(PERMISSION_CODES.DASHBOARD_SISWA_VIEW)
  siswa(@CurrentUser() user: AuthenticatedUser) {
    return { role: 'SISWA', user: user.name };
  }

  @Get('orang-tua')
  @RequirePermissions(PERMISSION_CODES.DASHBOARD_ORANG_TUA_VIEW)
  orangTua(@CurrentUser() user: AuthenticatedUser) {
    return { role: 'ORANG_TUA', user: user.name };
  }

  @Get('tutor')
  @RequirePermissions(PERMISSION_CODES.DASHBOARD_TUTOR_VIEW)
  tutor(@CurrentUser() user: AuthenticatedUser) {
    return { role: 'TUTOR', user: user.name };
  }

  @Get('admin-finance')
  @RequirePermissions(PERMISSION_CODES.DASHBOARD_ADMIN_FINANCE_VIEW)
  adminFinance(@CurrentUser() user: AuthenticatedUser) {
    return { role: 'ADMIN_FINANCE', user: user.name };
  }

  @Get('admin-academic')
  @RequirePermissions(PERMISSION_CODES.DASHBOARD_ADMIN_ACADEMIC_VIEW)
  adminAcademic(@CurrentUser() user: AuthenticatedUser) {
    return { role: 'ADMIN_ACADEMIC', user: user.name };
  }

  @Get('owner')
  @RequirePermissions(PERMISSION_CODES.DASHBOARD_OWNER_VIEW)
  owner(@CurrentUser() user: AuthenticatedUser) {
    return { role: 'OWNER', user: user.name };
  }
}
