// Controller Fase 1d: roster, bulk input, koreksi (audit), rekap 4 dimensi.
import { Body, Controller, Get, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { PERMISSION_CODES } from '../rbac/permissions.constants';
import { AuditService } from '../../common/audit/audit.service';
import { AttendanceService } from './attendance.service';
import { AttendanceRecapService } from './attendance-recap.service';
import { CorrectAttendanceDto, MarkAttendanceBulkDto, MarkTutorAttendanceDto } from './dto/attendance.dto';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AttendanceController {
  constructor(
    private readonly attendance: AttendanceService,
    private readonly recap: AttendanceRecapService,
    private readonly audit: AuditService,
  ) {}

  private ctx(req: Request) {
    return { ipAddress: req.ip, userAgent: req.headers['user-agent'] };
  }

  @Get('sessions/:id/attendance')
  @RequirePermissions(PERMISSION_CODES.ATTENDANCE_VIEW)
  roster(@Param('id') id: string) {
    return this.attendance.roster(id);
  }

  @Post('sessions/:id/attendance')
  @RequirePermissions(PERMISSION_CODES.ATTENDANCE_MANAGE)
  async mark(
    @Param('id') id: string,
    @Body() dto: MarkAttendanceBulkDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    await this.attendance.assertCanMark(
      id,
      actor.id,
      actor.permissions,
      actor.roles,
    );
    const rows = await this.attendance.markBulk(id, dto, actor.id);
    await this.audit.log({
      actorId: actor.id,
      action: 'ATTENDANCE_MARKED',
      entity: 'Session',
      entityId: id,
      newData: { count: dto.items.length },
      ...this.ctx(req),
    });
    return rows;
  }

  /**
   * Kehadiran tutor per sesi (absen tutor mengajar) — terpisah dari absen
   * siswa; dipakai payroll. Tutor menandai sesi miliknya; admin semua sesi.
   */
  @Put('sessions/:id/tutor-attendance')
  @RequirePermissions(PERMISSION_CODES.ATTENDANCE_MANAGE)
  async markTutorPresence(
    @Param('id') id: string,
    @Body() dto: MarkTutorAttendanceDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const saved = await this.attendance.markTutorPresence(
      id,
      dto.status,
      dto.note ?? null,
      { id: actor.id, permissions: actor.permissions, roles: actor.roles },
    );
    await this.audit.log({
      actorId: actor.id,
      action: 'TUTOR_ATTENDANCE_MARKED',
      entity: 'Session',
      entityId: id,
      newData: { tutorId: saved.tutorId, status: dto.status, note: dto.note ?? null },
      ...this.ctx(req),
    });
    return saved;
  }

  /** Rekap kehadiran tutor (admin) / milik sendiri (tutor). */
  @Get('attendance/tutor')
  @RequirePermissions(PERMISSION_CODES.ATTENDANCE_VIEW)
  listTutorAttendance(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('tutorId') tutorId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.attendance.listTutorAttendance(
      { id: actor.id, roles: actor.roles },
      { tutorId, from, to },
    );
  }

  /** Koreksi 1 baris absensi — permission khusus + audit old/new (WAJIB). */
  @Patch('sessions/:id/attendance/:studentId')
  @RequirePermissions(PERMISSION_CODES.ATTENDANCE_CORRECT)
  async correct(
    @Param('id') id: string,
    @Param('studentId') studentId: string,
    @Body() dto: CorrectAttendanceDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const { before, updated } = await this.attendance.correct(id, studentId, dto.status, dto.note ?? null, actor.id);
    await this.audit.log({
      actorId: actor.id,
      action: 'ATTENDANCE_CORRECTED',
      entity: 'Attendance',
      entityId: before.id,
      oldData: { status: before.status, note: before.note },
      newData: { status: dto.status, note: dto.note ?? null },
      ...this.ctx(req),
    });
    return updated;
  }

  /** Rekap umum 4 dimensi (admin/owner/tutor yang punya attendance.view). */
  @Get('attendance/recap')
  @RequirePermissions(PERMISSION_CODES.ATTENDANCE_VIEW)
  recapAll(
    @Query('studentId') studentId?: string,
    @Query('groupId') groupId?: string,
    @Query('tutorId') tutorId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.recap.recap({ studentId, groupId, tutorId, from, to });
  }

  /** Rekap milik siswa login. */
  @Get('attendance/mine-student')
  @RequirePermissions(PERMISSION_CODES.DASHBOARD_SISWA_VIEW)
  mineStudent(@CurrentUser() actor: AuthenticatedUser, @Query('from') from?: string, @Query('to') to?: string) {
    return this.recap.recapMineStudent(actor.id, { from, to });
  }

  /** Rekap anak milik orang tua login (halaman "Kehadiran"). */
  @Get('attendance/mine-children')
  @RequirePermissions(PERMISSION_CODES.DASHBOARD_ORANG_TUA_VIEW)
  mineChildren(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('studentId') studentId?: string,
  ) {
    return this.recap.recapMineChildren(actor.id, { from, to, studentId });
  }
}
