import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { PERMISSION_CODES } from '../rbac/permissions.constants';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { DashboardService } from './dashboard.service';

/**
 * Beranda tiap role: data nyata Fase 1 (people, groups, schedule, attendance).
 * Guard permission tetap di tiap route; service membatasi scope per user login.
 */
@Controller('dashboard')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('siswa')
  @RequirePermissions(PERMISSION_CODES.DASHBOARD_SISWA_VIEW)
  siswa(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboard.siswaHome(user.id);
  }

  @Get('orang-tua')
  @RequirePermissions(PERMISSION_CODES.DASHBOARD_ORANG_TUA_VIEW)
  orangTua(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboard.orangTuaHome(user.id);
  }

  @Get('tutor')
  @RequirePermissions(PERMISSION_CODES.DASHBOARD_TUTOR_VIEW)
  tutor(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboard.tutorHome(user.id);
  }

  @Get('admin-finance')
  @RequirePermissions(PERMISSION_CODES.DASHBOARD_ADMIN_FINANCE_VIEW)
  adminFinance(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboard.adminFinanceHome(user.id);
  }

  /** Seri bulanan & perbandingan kinerja untuk grafik dashboard finance. */
  @Get('admin-finance/analytics')
  @RequirePermissions(PERMISSION_CODES.DASHBOARD_ADMIN_FINANCE_VIEW)
  financeAnalytics() {
    return this.dashboard.ownerAnalytics();
  }

  @Get('admin-academic')
  @RequirePermissions(PERMISSION_CODES.DASHBOARD_ADMIN_ACADEMIC_VIEW)
  adminAcademic(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboard.adminAcademicHome(user.id);
  }

  @Get('owner')
  @RequirePermissions(PERMISSION_CODES.DASHBOARD_OWNER_VIEW)
  owner(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboard.ownerHome(user.id);
  }

  @Get('owner/analytics')
  @RequirePermissions(PERMISSION_CODES.DASHBOARD_OWNER_VIEW)
  ownerAnalytics() {
    return this.dashboard.ownerAnalytics();
  }
}
