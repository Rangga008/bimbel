// Controller Fase 1c: sessions, overrides, facilities (part 2).
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { PERMISSION_CODES } from '../rbac/permissions.constants';
import { AuditService } from '../../common/audit/audit.service';
import { SessionsService } from './sessions.service';
import { SessionOverridesService } from './session-overrides.service';
import { FacilitiesService } from './facilities.service';
import { CreateBuildingDto } from './dto/create-building.dto';
import { CreateRoomDto, UpdateRoomDto } from './dto/create-room.dto';
import { CreateSessionDto, UpdateSessionDto, UpsertSessionOverrideDto } from './dto/schedule-session.dto';
import { CreateDayNoteDto } from './dto/day-note.dto';
import { TutorAbsenceDto } from './dto/tutor-absence.dto';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SessionsController {
  constructor(
    private readonly sessions: SessionsService,
    private readonly overrides: SessionOverridesService,
    private readonly facilities: FacilitiesService,
    private readonly audit: AuditService,
  ) {}

  private ctx(req: Request) {
    return { ipAddress: req.ip, userAgent: req.headers['user-agent'] };
  }

  @Get('sessions')
  @RequirePermissions(PERMISSION_CODES.SESSION_VIEW)
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('groupId') groupId?: string,
    @Query('tutorId') tutorId?: string,
    @Query('roomId') roomId?: string,
    @Query('studentId') studentId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.sessions.list(actor, { groupId, tutorId, roomId, studentId, from, to });
  }

  @Get('sessions/mine')
  @RequirePermissions(PERMISSION_CODES.DASHBOARD_TUTOR_VIEW)
  mineTutor(@CurrentUser() actor: AuthenticatedUser, @Query('from') from?: string, @Query('to') to?: string) {
    return this.overrides.mineForTutor(actor.id, { from, to });
  }

  @Get('sessions/mine-student')
  @RequirePermissions(PERMISSION_CODES.DASHBOARD_SISWA_VIEW)
  mineStudent(@CurrentUser() actor: AuthenticatedUser, @Query('from') from?: string, @Query('to') to?: string) {
    return this.overrides.mineForStudent(actor.id, { from, to });
  }

  @Get('sessions/mine-children')
  @RequirePermissions(PERMISSION_CODES.DASHBOARD_ORANG_TUA_VIEW)
  mineChildren(@CurrentUser() actor: AuthenticatedUser, @Query('from') from?: string, @Query('to') to?: string) {
    return this.overrides.mineForParent(actor.id, { from, to });
  }

  @Get('sessions/:id')
  @RequirePermissions(PERMISSION_CODES.SESSION_VIEW)
  get(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.sessions.get(id, actor);
  }

  @Post('sessions')
  @RequirePermissions(PERMISSION_CODES.SESSION_MANAGE)
  async create(@Body() dto: CreateSessionDto, @CurrentUser() actor: AuthenticatedUser, @Req() req: Request) {
    const created = await this.sessions.create(dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'SESSION_CREATED',
      entity: 'Session',
      entityId: created.id,
      newData: { groupId: dto.groupId, tutorId: dto.tutorId, startsAt: dto.startsAt },
      ...this.ctx(req),
    });
    return created;
  }

  @Patch('sessions/:id')
  @RequirePermissions(PERMISSION_CODES.SESSION_MANAGE)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateSessionDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const before = await this.sessions.get(id);
    const updated = await this.sessions.update(id, dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'SESSION_RESCHEDULED',
      entity: 'Session',
      entityId: id,
      oldData: { tutorId: before.tutorId, roomId: before.roomId, startsAt: before.startsAt, endsAt: before.endsAt },
      newData: dto,
      ...this.ctx(req),
    });
    return updated;
  }

  @Delete('sessions/:id')
  @RequirePermissions(PERMISSION_CODES.SESSION_MANAGE)
  async remove(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const result = await this.sessions.remove(id);
    await this.audit.log({
      actorId: actor.id,
      action: 'SESSION_DELETED',
      entity: 'Session',
      entityId: id,
      oldData: result,
      ...this.ctx(req),
    });
    return result;
  }

  /**
   * Tutor melaporkan berhalangan hadir di sesi miliknya (sakit/dsb) —
   * menandai sesi + mengantrekan WA ke orang tua anggota kelompok.
   */
  @Post('sessions/:id/tutor-absence')
  @RequirePermissions(PERMISSION_CODES.DASHBOARD_TUTOR_VIEW)
  async tutorAbsence(
    @Param('id') id: string,
    @Body() dto: TutorAbsenceDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const result = await this.sessions.reportTutorAbsence(id, actor, dto.reason);
    await this.audit.log({
      actorId: actor.id,
      action: 'SESSION_TUTOR_ABSENCE',
      entity: 'Session',
      entityId: id,
      newData: { reason: dto.reason, notified: result.notified },
      ...this.ctx(req),
    });
    return result;
  }

  // ===== Catatan tanggal: libur / rapat / darurat / info =====

  /** Semua role login boleh membaca catatan tanggal (bagian dari jadwal). */
  @Get('day-notes')
  dayNotes(@Query('from') from?: string, @Query('to') to?: string) {
    return this.sessions.listDayNotes(from, to);
  }

  @Post('day-notes')
  @RequirePermissions(PERMISSION_CODES.SESSION_MANAGE)
  async createDayNote(
    @Body() dto: CreateDayNoteDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const created = await this.sessions.createDayNote(dto, actor.id);
    await this.audit.log({
      actorId: actor.id,
      action: 'DAY_NOTE_CREATED',
      entity: 'DayNote',
      entityId: created.id,
      newData: dto,
      ...this.ctx(req),
    });
    return created;
  }

  @Delete('day-notes/:id')
  @RequirePermissions(PERMISSION_CODES.SESSION_MANAGE)
  async removeDayNote(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const result = await this.sessions.removeDayNote(id);
    await this.audit.log({
      actorId: actor.id,
      action: 'DAY_NOTE_DELETED',
      entity: 'DayNote',
      entityId: id,
      oldData: result,
      ...this.ctx(req),
    });
    return result;
  }

  @Post('sessions/:id/overrides')
  @RequirePermissions(PERMISSION_CODES.SESSION_MANAGE)
  async upsertOverride(
    @Param('id') id: string,
    @Body() dto: UpsertSessionOverrideDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const result = await this.overrides.upsertOverride(id, dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'SESSION_STUDENT_OVERRIDDEN',
      entity: 'Session',
      entityId: id,
      newData: { studentId: dto.studentId, startsAt: dto.startsAt, roomId: dto.roomId },
      ...this.ctx(req),
    });
    return result;
  }

  @Delete('sessions/:id/overrides/:studentId')
  @RequirePermissions(PERMISSION_CODES.SESSION_MANAGE)
  async deleteOverride(
    @Param('id') id: string,
    @Param('studentId') studentId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const result = await this.overrides.deleteOverride(id, studentId);
    await this.audit.log({
      actorId: actor.id,
      action: 'SESSION_STUDENT_OVERRIDE_REMOVED',
      entity: 'Session',
      entityId: id,
      oldData: { studentId },
      ...this.ctx(req),
    });
    return result;
  }

  @Get('buildings')
  @RequirePermissions(PERMISSION_CODES.SCHEDULE_VIEW)
  buildings() {
    return this.facilities.listBuildings();
  }

  @Delete('buildings/:id')
  @RequirePermissions(PERMISSION_CODES.FACILITY_MANAGE)
  async removeBuilding(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const result = await this.facilities.removeBuilding(id);
    await this.audit.log({
      actorId: actor.id,
      action: 'BUILDING_DELETED',
      entity: 'Building',
      entityId: id,
      oldData: { name: result.name },
      ...this.ctx(req),
    });
    return result;
  }

  @Delete('rooms/:id')
  @RequirePermissions(PERMISSION_CODES.FACILITY_MANAGE)
  async removeRoom(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const result = await this.facilities.removeRoom(id);
    await this.audit.log({
      actorId: actor.id,
      action: 'ROOM_DELETED',
      entity: 'Room',
      entityId: id,
      oldData: { name: result.name },
      ...this.ctx(req),
    });
    return result;
  }

  @Post('buildings')
  @RequirePermissions(PERMISSION_CODES.FACILITY_MANAGE)
  async createBuilding(
    @Body() dto: CreateBuildingDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const created = await this.facilities.createBuilding(dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'BUILDING_CREATED',
      entity: 'Building',
      entityId: created.id,
      newData: { name: dto.name, address: dto.address },
      ...this.ctx(req),
    });
    return created;
  }

  @Get('rooms')
  @RequirePermissions(PERMISSION_CODES.SCHEDULE_VIEW)
  rooms(@Query('buildingId') buildingId?: string) {
    return this.facilities.listRooms(buildingId);
  }

  @Post('rooms')
  @RequirePermissions(PERMISSION_CODES.FACILITY_MANAGE)
  async createRoom(
    @Body() dto: CreateRoomDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const created = await this.facilities.createRoom(dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'ROOM_CREATED',
      entity: 'Room',
      entityId: created.id,
      newData: { name: dto.name, buildingId: dto.buildingId, capacity: dto.capacity },
      ...this.ctx(req),
    });
    return created;
  }

  @Patch('rooms/:id')
  @RequirePermissions(PERMISSION_CODES.FACILITY_MANAGE)
  async updateRoom(
    @Param('id') id: string,
    @Body() dto: UpdateRoomDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const updated = await this.facilities.updateRoom(id, dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'ROOM_UPDATED',
      entity: 'Room',
      entityId: id,
      newData: { name: dto.name, buildingId: dto.buildingId, capacity: dto.capacity, photoUrl: dto.photoUrl },
      ...this.ctx(req),
    });
    return updated;
  }
}
