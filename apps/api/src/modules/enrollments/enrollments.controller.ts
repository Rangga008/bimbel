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
import { RequirePermissions } from '../rbac/permissions.decorator';
import { PERMISSION_CODES } from '../rbac/permissions.constants';
import { AuditService } from '../../common/audit/audit.service';
import { EnrollmentsService } from './enrollments.service';
import {
  CreateEnrollmentDto,
  PlaceEnrollmentDto,
  ReviewEnrollmentDto,
  UpdateChildDto,
} from './dto/enrollment.dto';

/**
 * Pendaftaran siswa self-service:
 * - `POST /me/enrollments` — ortu daftarkan anak (invoice terbit otomatis).
 * - `GET /me/enrollments` — ortu memantau status pendaftarannya.
 * - `GET /enrollments` — staff melihat antrean pendaftaran.
 * - `POST /enrollments/:id/accept|reject` — verifikasi admin finance.
 * - `POST /enrollments/:id/place` — penempatan kelompok admin academic.
 */
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class EnrollmentsController {
  constructor(
    private readonly enrollments: EnrollmentsService,
    private readonly audit: AuditService,
  ) {}

  @Post('me/enrollments')
  @RequirePermissions(PERMISSION_CODES.ENROLLMENT_CREATE)
  async create(
    @Body() dto: CreateEnrollmentDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const created = await this.enrollments.create(actor, dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'ENROLLMENT_CREATED',
      entity: 'Enrollment',
      entityId: created.id,
      newData: {
        childName: dto.childName,
        programId: dto.programId,
        levelId: dto.levelId,
        invoiceId: created.invoiceId,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return created;
  }

  @Get('me/enrollments')
  @RequirePermissions(PERMISSION_CODES.ENROLLMENT_VIEW)
  mine(@CurrentUser() actor: AuthenticatedUser) {
    return this.enrollments.mine(actor);
  }

  /** Daftar anak milik ortu — untuk mendaftarkan anak yang sama ke program lain. */
  @Get('me/enrollments/children')
  @RequirePermissions(PERMISSION_CODES.ENROLLMENT_VIEW)
  myChildren(@CurrentUser() actor: AuthenticatedUser) {
    return this.enrollments.myChildren(actor);
  }

  /**
   * Ortu mengubah data anak sendiri — termasuk identitas login (no HP/email)
   * dan kata sandi anak. Berguna untuk melengkapi akun anak yang awalnya
   * dibuat dengan email placeholder.
   */
  @Patch('me/enrollments/children/:studentId')
  @RequirePermissions(PERMISSION_CODES.ENROLLMENT_CREATE)
  async updateChild(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('studentId') studentId: string,
    @Body() dto: UpdateChildDto,
    @Req() req: Request,
  ) {
    const result = await this.enrollments.updateChild(actor, studentId, dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'CHILD_UPDATED_BY_PARENT',
      entity: 'Student',
      entityId: studentId,
      newData: { ...dto, password: dto.password ? '***' : undefined },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return result;
  }

  /** Ortu menghapus data anak yang belum punya jejak bisnis (belum lunas/ditempatkan). */
  @Delete('me/enrollments/children/:studentId')
  @RequirePermissions(PERMISSION_CODES.ENROLLMENT_CREATE)
  removeChild(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('studentId') studentId: string,
  ) {
    return this.enrollments.removeChild(actor, studentId);
  }

  @Get('enrollments')
  @RequirePermissions(PERMISSION_CODES.ENROLLMENT_VIEW)
  list(@Query('status') status?: string, @Query('studentId') studentId?: string) {
    return this.enrollments.list({ status, studentId });
  }

  @Post('enrollments/:id/accept')
  @RequirePermissions(PERMISSION_CODES.ENROLLMENT_REVIEW)
  async accept(
    @Param('id') id: string,
    @Body() dto: ReviewEnrollmentDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const updated = await this.enrollments.accept(actor, id, dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'ENROLLMENT_ACCEPTED',
      entity: 'Enrollment',
      entityId: id,
      newData: { studentId: updated.studentId, notes: dto.notes },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return updated;
  }

  @Post('enrollments/:id/reject')
  @RequirePermissions(PERMISSION_CODES.ENROLLMENT_REVIEW)
  async reject(
    @Param('id') id: string,
    @Body() dto: ReviewEnrollmentDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const updated = await this.enrollments.reject(actor, id, dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'ENROLLMENT_REJECTED',
      entity: 'Enrollment',
      entityId: id,
      newData: { notes: dto.notes },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return updated;
  }

  /**
   * Diskon/bantuan/promo per siswa — nominalnya disebar ke invoice cicilan
   * pendaftaran ini yang belum lunas (paket/jenjang tidak berubah).
   */
  @Post('enrollments/:id/discount')
  @RequirePermissions(PERMISSION_CODES.INVOICE_MANAGE)
  async discount(
    @Param('id') id: string,
    @Body() dto: { amount?: number; reason?: string },
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const result = await this.enrollments.applyDiscount(
      id,
      Number(dto.amount),
      String(dto.reason ?? ''),
    );
    await this.audit.log({
      actorId: actor.id,
      action: 'ENROLLMENT_DISCOUNTED',
      entity: 'Enrollment',
      entityId: id,
      newData: { amount: dto.amount, reason: dto.reason, applied: result.applied },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return result;
  }

  @Post('enrollments/:id/place')
  @RequirePermissions(PERMISSION_CODES.ENROLLMENT_PLACE)
  async place(
    @Param('id') id: string,
    @Body() dto: PlaceEnrollmentDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const updated = await this.enrollments.place(id, dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'ENROLLMENT_PLACED',
      entity: 'Enrollment',
      entityId: id,
      newData: { groupId: dto.groupId, studentId: updated.studentId },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return updated;
  }
}
