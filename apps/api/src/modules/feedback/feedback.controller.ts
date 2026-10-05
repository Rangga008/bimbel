// Endpoints feedback mingguan + reminder WA per kelompok.
// - Ortu/siswa: konteks pengisian, daftar entri minggu berjalan, upsert.
// - Tutor/staff: matriks kelompok (siswa × mapel) + export Excel.
// - Admin (GROUP_MANAGE): tombol reminder WA (bayar, jadwal, performa, feedback).
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
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
import { FeedbackService } from './feedback.service';
import {
  FeedbackWeekQueryDto,
  GROUP_REMINDER_TYPES,
  SubmitFeedbackDto,
} from './dto/feedback.dto';
import type { GroupReminderType } from './dto/feedback.dto';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FeedbackController {
  constructor(
    private readonly feedback: FeedbackService,
    private readonly audit: AuditService,
  ) {}

  // ===== Pengisian (ortu & siswa) =====

  /** Konteks form: daftar siswa + kelompok + mapel yang bisa diisi pemanggil. */
  @Get('me/feedback/context')
  @RequireAnyPermissions(
    PERMISSION_CODES.DASHBOARD_ORANG_TUA_VIEW,
    PERMISSION_CODES.DASHBOARD_SISWA_VIEW,
  )
  myContext(@CurrentUser() actor: AuthenticatedUser) {
    return this.feedback.myContext(actor);
  }

  /** Entri minggu ini milik pemanggil (ortu → semua anaknya). */
  @Get('me/feedback')
  @RequireAnyPermissions(
    PERMISSION_CODES.DASHBOARD_ORANG_TUA_VIEW,
    PERMISSION_CODES.DASHBOARD_SISWA_VIEW,
  )
  listMine(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() q: FeedbackWeekQueryDto,
  ) {
    return this.feedback.listMine(actor, q.week);
  }

  /** Upsert satu sel feedback (siswa×mapel×minggu). */
  @Post('me/feedback')
  @RequireAnyPermissions(
    PERMISSION_CODES.DASHBOARD_ORANG_TUA_VIEW,
    PERMISSION_CODES.DASHBOARD_SISWA_VIEW,
  )
  submit(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: SubmitFeedbackDto,
  ) {
    return this.feedback.submit(actor, dto);
  }

  // ===== Tampilan kelompok (tutor anggota + staff) =====

  /** Matriks feedback kelompok untuk 1 minggu. */
  @Get('groups/:id/feedback')
  @RequirePermissions(PERMISSION_CODES.GROUP_VIEW)
  matrix(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') groupId: string,
    @Query() q: FeedbackWeekQueryDto,
  ) {
    return this.feedback.groupMatrix(actor, groupId, q.week);
  }

  /** Export matriks ke Excel (.xlsx) — tutor kelompok & staff saja. */
  @Get('groups/:id/feedback/export')
  @RequirePermissions(PERMISSION_CODES.GROUP_VIEW)
  async exportXlsx(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') groupId: string,
    @Query() q: FeedbackWeekQueryDto,
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request,
  ) {
    const { buffer, filename, matrix } = await this.feedback.exportXlsx(
      actor,
      groupId,
      q.week,
    );
    await this.audit.log({
      actorId: actor.id,
      action: 'FEEDBACK_EXPORTED',
      entity: 'LearningGroup',
      entityId: groupId,
      newData: { week: matrix.weekStart },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.length),
    });
    res.send(buffer);
  }

  // ===== Reminder WA per kelompok (admin/staff) =====

  /**
   * `POST /groups/:id/reminders/:type` — antrekan pesan WA ke ortu anggota.
   * Tipe: payment-due | weekly-schedule | monthly-performance | feedback.
   * Dedupe per tipe+periode+nomor ditangani unique index outbox.
   */
  @Post('groups/:id/reminders/:type')
  // Finance juga boleh kirim reminder (tagihan & jadwal) — payment.verify hanya
  // dimiliki role keuangan, jadi ortu/tutor tak bisa memicu massal.
  @RequireAnyPermissions(
    PERMISSION_CODES.GROUP_MANAGE,
    PERMISSION_CODES.PAYMENT_VERIFY,
  )
  async sendReminder(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') groupId: string,
    @Param('type') type: string,
    @Req() req: Request,
  ) {
    if (!GROUP_REMINDER_TYPES.includes(type as GroupReminderType)) {
      throw new BadRequestException(
        'Jenis reminder tidak valid — gunakan payment-due, weekly-schedule, monthly-performance, atau feedback.',
      );
    }
    const result = await this.feedback.sendReminder(
      actor,
      groupId,
      type as GroupReminderType,
    );
    await this.audit.log({
      actorId: actor.id,
      action: 'GROUP_REMINDER_SENT',
      entity: 'LearningGroup',
      entityId: groupId,
      newData: { ...result, type },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return result;
  }
}
