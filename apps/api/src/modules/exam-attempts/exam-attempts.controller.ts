import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
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
import { ExamAttemptsService } from './exam-attempts.service';
import { ExamAutoSubmitService } from './exam-auto-submit.service';
import { SaveExamAnswerDto, SubmitExamDto } from './dto/exam-attempt.dto';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ExamAttemptsController {
  constructor(
    private readonly attempts: ExamAttemptsService,
    private readonly autoSubmit: ExamAutoSubmitService,
    private readonly audit: AuditService,
  ) {}

  @Post('exam-attempts/start')
  @RequirePermissions(PERMISSION_CODES.EXAM_ATTEMPT)
  start(
    @CurrentUser() user: AuthenticatedUser,
    @Body('examId') examId: string,
  ) {
    return this.attempts.start(user.id, examId, user);
  }

  // Route statis harus didaftarkan sebelum ':id' supaya tidak tertangkap sebagai param id.
  @Get('exam-attempts/locked')
  @RequirePermissions(PERMISSION_CODES.EXAM_PROCTOR_UNLOCK)
  getLockedAttempts() {
    return this.attempts.getLockedAttempts();
  }

  @Get('exam-attempts/:id')
  @RequirePermissions(PERMISSION_CODES.EXAM_ATTEMPT)
  getDetail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.attempts.getAttemptDetail(user.id, id);
  }

  @Put('exam-attempts/:id/answers/:questionId')
  @RequirePermissions(PERMISSION_CODES.EXAM_ATTEMPT)
  saveAnswer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') attemptId: string,
    @Param('questionId') questionId: string,
    @Body() dto: SaveExamAnswerDto,
  ) {
    return this.attempts.saveAnswer(user.id, attemptId, questionId, dto);
  }

  @Post('exam-attempts/:id/submit')
  @RequirePermissions(PERMISSION_CODES.EXAM_ATTEMPT)
  async submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() _dto: SubmitExamDto,
    @Req() req: Request,
  ) {
    const submitted = await this.attempts.submit(user.id, id, _dto);
    await this.audit.log({
      actorId: user.id,
      action: 'EXAM_ATTEMPT_SUBMITTED',
      entity: 'ExamAttempt',
      entityId: id,
      newData: {
        score: submitted?.score,
        lateByMs: submitted?.lateByMs,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return submitted;
  }

  @Get('exams/:examId/my-attempts')
  @RequirePermissions(PERMISSION_CODES.EXAM_ATTEMPT)
  getMyAttempts(
    @CurrentUser() user: AuthenticatedUser,
    @Param('examId') examId: string,
  ) {
    return this.attempts.getStudentAttempts(user.id, examId);
  }

  @Get('exams/:examId/attempts')
  @RequirePermissions(PERMISSION_CODES.EXAM_VIEW)
  getExamAttempts(@Param('examId') examId: string) {
    return this.attempts.getExamAttempts(examId);
  }

  @Post('exam-auto-submit/trigger')
  @RequirePermissions(PERMISSION_CODES.EXAM_MANAGE)
  async triggerAutoSubmit(
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const result = await this.autoSubmit.triggerManualCheck();
    await this.audit.log({
      actorId: actor.id,
      action: 'EXAM_AUTO_SUBMIT_TRIGGERED',
      entity: 'ExamAttempt',
      entityId: '*',
      newData: { result },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return result;
  }
}
