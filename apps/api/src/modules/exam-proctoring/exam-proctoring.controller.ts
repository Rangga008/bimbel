import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions, RequireAnyPermissions } from '../rbac/permissions.decorator';
import { PERMISSION_CODES } from '../rbac/permissions.constants';
import { ExamProctoringService } from './exam-proctoring.service';
import { ReportViolationDto, UnlockAttemptDto } from './dto/exam-proctoring.dto';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ExamProctoringController {
  constructor(
    private readonly proctoring: ExamProctoringService,
  ) {}

  /**
   * Report proctoring violation (fullscreen exit, visibility change, blur, tab leave).
   * Student only (pemilik attempt).
   */
  @Post('exam-attempts/:id/violation')
  @RequirePermissions(PERMISSION_CODES.EXAM_ATTEMPT)
  reportViolation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') attemptId: string,
    @Body() dto: ReportViolationDto,
  ) {
    return this.proctoring.reportViolation(user.id, attemptId, dto);
  }

  /**
   * Get proctoring status for an attempt.
   * Pemilik attempt, atau pemegang exam.view / exam_proctor.unlock.
   */
  @Get('exam-attempts/:id/proctoring-status')
  @RequireAnyPermissions(
    PERMISSION_CODES.EXAM_ATTEMPT,
    PERMISSION_CODES.EXAM_VIEW,
    PERMISSION_CODES.EXAM_PROCTOR_UNLOCK,
  )
  getProctoringStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') attemptId: string,
  ) {
    const canViewAll =
      user.permissions.includes(PERMISSION_CODES.EXAM_VIEW) ||
      user.permissions.includes(PERMISSION_CODES.EXAM_PROCTOR_UNLOCK);
    return this.proctoring.getProctoringStatus(user.id, attemptId, canViewAll);
  }

  /**
   * Overview proctoring per ujian: kelompok peserta + status attempt
   * (belum mulai / in-progress / locked / submitted) + jumlah pelanggaran.
   * Akses: exam.view atau exam_proctor.unlock (semua tutor bisa mengawasi).
   */
  @Get('exams/:id/proctoring-overview')
  @RequireAnyPermissions(
    PERMISSION_CODES.EXAM_VIEW,
    PERMISSION_CODES.EXAM_PROCTOR_UNLOCK,
  )
  examOverview(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') examId: string,
  ) {
    return this.proctoring.examOverview(examId, actor);
  }

  /**
   * Unlock a locked attempt.
   * Requires exam_proctor.unlock permission (lintas kelompok/program).
   */
  @Post('exam-attempts/:id/unlock')
  @RequirePermissions(PERMISSION_CODES.EXAM_PROCTOR_UNLOCK)
  unlockAttempt(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') attemptId: string,
    @Body() dto: UnlockAttemptDto,
  ) {
    return this.proctoring.unlockAttempt(user.id, attemptId, dto);
  }
}
