import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions, RequireAnyPermissions } from '../rbac/permissions.decorator';
import { PERMISSION_CODES } from '../rbac/permissions.constants';
import { AuditService } from '../../common/audit/audit.service';
import { ExamsService } from './exams.service';
import { CreateExamDto, UpdateExamDto } from './dto/exam.dto';

function ctx(req: Request) {
  return { ipAddress: req.ip, userAgent: req.headers['user-agent'] };
}

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ExamsController {
  constructor(
    private readonly exams: ExamsService,
    private readonly audit: AuditService,
  ) {}

  @Get('exams')
  @RequireAnyPermissions(PERMISSION_CODES.EXAM_VIEW, PERMISSION_CODES.EXAM_ATTEMPT)
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('programId') programId?: string,
    @Query('levelId') levelId?: string,
    @Query('subjectId') subjectId?: string,
    @Query('category') category?: string,
  ) {
    return this.exams.list(actor, { status, programId, levelId, subjectId, category });
  }

  @Get('exams-available')
  @RequirePermissions(PERMISSION_CODES.EXAM_ATTEMPT)
  listAvailable(@CurrentUser() actor: AuthenticatedUser) {
    return this.exams.listAvailableForStudent(actor);
  }

  @Get('exams/:id')
  @RequireAnyPermissions(PERMISSION_CODES.EXAM_VIEW, PERMISSION_CODES.EXAM_ATTEMPT)
  async get(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    // Siswa tidak boleh melihat kunci via endpoint admin: arahkan ke for-student.
    if (!actor.permissions.includes(PERMISSION_CODES.EXAM_VIEW)) {
      return this.exams.getForStudent(id, actor);
    }
    return this.exams.get(id, actor);
  }

  @Get('exams/:id/for-student')
  @RequirePermissions(PERMISSION_CODES.EXAM_ATTEMPT)
  getForStudent(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.exams.getForStudent(id, actor);
  }

  @Get('exams/:id/for-pembahasan')
  @RequirePermissions(PERMISSION_CODES.EXAM_VIEW)
  getForPembahasan(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.exams.getForPembahasan(id, actor);
  }

  @Post('exams')
  @RequirePermissions(PERMISSION_CODES.EXAM_MANAGE)
  async create(
    @Body() dto: CreateExamDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const created = await this.exams.create(actor.id, dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'EXAM_CREATED',
      entity: 'Exam',
      entityId: created.id,
      newData: {
        title: dto.title,
        scheduledStartAt: dto.scheduledStartAt,
        scheduledEndAt: dto.scheduledEndAt,
      },
      ...ctx(req),
    });
    return created;
  }

  @Patch('exams/:id')
  @RequirePermissions(PERMISSION_CODES.EXAM_MANAGE)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateExamDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const before = await this.exams.get(id);
    const updated = await this.exams.update(id, dto);
    // Transisi status (DRAFT→PUBLISHED→LOCKED) adalah aksi kritis tersendiri —
    // beri action eksplisit supaya mudah dilacak di halaman Audit.
    const statusChanged = before.status !== updated.status;
    await this.audit.log({
      actorId: actor.id,
      action: statusChanged ? `EXAM_${updated.status}` : 'EXAM_UPDATED',
      entity: 'Exam',
      entityId: id,
      oldData: { title: before.title, status: before.status },
      newData: { title: updated.title, status: updated.status },
      ...ctx(req),
    });
    return updated;
  }

  @Delete('exams/:id')
  @RequirePermissions(PERMISSION_CODES.EXAM_MANAGE)
  async delete(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const before = await this.exams.get(id);
    await this.exams.delete(id);
    await this.audit.log({
      actorId: actor.id,
      action: 'EXAM_DELETED',
      entity: 'Exam',
      entityId: id,
      oldData: { title: before.title },
      ...ctx(req),
    });
    return { success: true };
  }
}
