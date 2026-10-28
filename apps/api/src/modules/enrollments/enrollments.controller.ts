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
import { EnrollmentsService } from './enrollments.service';
import {
  CreateEnrollmentDto,
  CreateStaffEnrollmentDto,
  PlaceEnrollmentDto,
  ReviewEnrollmentDto,
  SubmitStatementDto,
  UpdateChildDto,
} from './dto/enrollment.dto';

function ctx(req: Request) {
  return { ipAddress: req.ip, userAgent: req.headers['user-agent'] };
}

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

  /** Ortu: surat pernyataan tersimpan + data prefill untuk satu pendaftaran. */
  @Get('me/enrollments/:enrollmentId/statement')
  @RequirePermissions(PERMISSION_CODES.ENROLLMENT_VIEW)
  statementForm(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('enrollmentId') enrollmentId: string,
  ) {
    return this.enrollments.statementForm(actor, enrollmentId);
  }

  /**
   * Ortu: isi & setujui surat pernyataan anak — snapshot data ortu/anak/
   * program/pembayaran disimpan server-side; boleh diperbarui untuk koreksi.
   */
  @Post('me/enrollments/:enrollmentId/statement')
  @RequirePermissions(PERMISSION_CODES.ENROLLMENT_CREATE)
  async submitStatement(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('enrollmentId') enrollmentId: string,
    @Body() dto: SubmitStatementDto,
    @Req() req: Request,
  ) {
    const saved = await this.enrollments.submitStatement(actor, enrollmentId, dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'PARENT_STATEMENT_SIGNED',
      entity: 'ParentStatement',
      entityId: saved.id,
      newData: { enrollmentId, agreedAt: saved.agreedAt },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return saved;
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

  /**
   * Admin/staff menambahkan program ke siswa yang sudah ada — termasuk
   * backfill "sudah lunas sampai angsuran ke-N" (paidInstallments).
   */
  @Post('enrollments')
  @RequirePermissions(PERMISSION_CODES.ENROLLMENT_CREATE)
  async createForStudent(
    @Body() dto: CreateStaffEnrollmentDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const created = await this.enrollments.createForStudent(dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'ENROLLMENT_CREATED_BY_STAFF',
      entity: 'Enrollment',
      entityId: created.id,
      newData: {
        studentId: dto.studentId,
        programId: dto.programId,
        levelId: dto.levelId,
        paidInstallments: dto.paidInstallments,
      },
      ...ctx(req),
    });
    return created;
  }

  @Get('enrollments')
  @RequirePermissions(PERMISSION_CODES.ENROLLMENT_VIEW)
  list(@Query('status') status?: string, @Query('studentId') studentId?: string) {
    return this.enrollments.list({ status, studentId });
  }

  /** Admin: surat pernyataan tersimpan untuk satu pendaftaran (cetak arsip). */
  @Get('enrollments/:id/statement')
  @RequirePermissions(PERMISSION_CODES.ENROLLMENT_VIEW)
  adminStatement(@Param('id') id: string) {
    return this.enrollments.adminStatement(id);
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
  @RequireAnyPermissions(
    PERMISSION_CODES.INVOICE_MANAGE,
    PERMISSION_CODES.ENROLLMENT_PLACE,
  )
  async discount(
    @Param('id') id: string,
    @Body() dto: { amount?: number; months?: number | null; reason?: string },
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const result = await this.enrollments.applyDiscount(
      id,
      Number(dto.amount),
      String(dto.reason ?? ''),
      dto.months === null || dto.months === undefined
        ? null
        : Number(dto.months),
    );
    await this.audit.log({
      actorId: actor.id,
      action: 'ENROLLMENT_DISCOUNTED',
      entity: 'Enrollment',
      entityId: id,
      newData: {
        amount: dto.amount,
        months: dto.months ?? null,
        reason: dto.reason,
        applied: result.applied,
      },
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
