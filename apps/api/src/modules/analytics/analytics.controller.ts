/**
 * Fase 4a — Analytics Controller
 * Per-question analytics & student performance dashboard
 * Role-based access control for Student, Parent, Tutor, Admin Academic
 */
import { Controller, Get, Query, UseGuards, Param } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { PERMISSION_CODES } from '../rbac/permissions.constants';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { AnalyticsService } from './analytics.service';

/**
 * Analytics endpoints for per-question analysis and student performance
 * Uses data from Fase 3 (exam_attempts, exam_answers) as source
 */
@Controller('analytics')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  /**
   * Get per-question analytics for a specific question
   * Access: Admin Academic, Tutor (for their groups)
   */
  @Get('question/:questionId')
  @RequirePermissions(PERMISSION_CODES.ANALYTICS_QUESTION_VIEW)
  async getQuestionAnalytics(@Param('questionId') questionId: string) {
    return this.analytics.getQuestionAnalytics(questionId);
  }

  /**
   * Get per-question analytics for all questions in an exam
   * Access: Admin Academic, Tutor (for their groups)
   */
  @Get('exam/:examId/questions')
  @RequirePermissions(PERMISSION_CODES.ANALYTICS_EXAM_VIEW)
  async getExamQuestionAnalytics(@Param('examId') examId: string) {
    return this.analytics.getExamQuestionAnalytics(examId);
  }

  /**
   * Get student performance dashboard
   * Access: Student (own data), Parent (child data), Tutor (group students), Admin Academic
   */
  @Get('student/:studentId/performance')
  @RequirePermissions(PERMISSION_CODES.ANALYTICS_STUDENT_PERFORMANCE_VIEW)
  async getStudentPerformance(@Param('studentId') studentId: string) {
    return this.analytics.getStudentPerformance(studentId);
  }

  /**
   * Get analytics for parent's child
   * Access: Parent (own children only)
   */
  @Get('parent/child/:studentId/performance')
  @RequirePermissions(PERMISSION_CODES.ANALYTICS_PARENT_CHILD_VIEW)
  async getParentChildAnalytics(
    @CurrentUser() user: AuthenticatedUser,
    @Param('studentId') studentId: string,
  ) {
    return this.analytics.getParentChildAnalytics(user.id, studentId);
  }

  /**
   * Get analytics for tutor's group
   * Access: Tutor (own groups only)
   */
  @Get('tutor/group/:groupId/analytics')
  @RequirePermissions(PERMISSION_CODES.ANALYTICS_TUTOR_GROUP_VIEW)
  async getTutorGroupAnalytics(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
  ) {
    return this.analytics.getTutorGroupAnalytics(user.id, groupId);
  }

  /**
   * Get admin academic analytics (aggregated)
   * Access: Admin Academic, Owner
   */
  @Get('admin/academic')
  @RequirePermissions(PERMISSION_CODES.ANALYTICS_ADMIN_ACADEMIC_VIEW)
  async getAdminAcademicAnalytics(
    @Query('programId') programId?: string,
    @Query('levelId') levelId?: string,
    @Query('groupId') groupId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const filters: any = {};
    if (programId) filters.programId = programId;
    if (levelId) filters.levelId = levelId;
    if (groupId) filters.groupId = groupId;
    if (startDate) filters.startDate = new Date(startDate);
    if (endDate) filters.endDate = new Date(endDate);

    return this.analytics.getAdminAcademicAnalytics(filters);
  }

  /**
   * Get own performance (for student)
   * Access: Student (own data only)
   */
  @Get('my-performance')
  @RequirePermissions(PERMISSION_CODES.ANALYTICS_MY_PERFORMANCE_VIEW)
  async getMyPerformance(@CurrentUser() user: AuthenticatedUser) {
    // This endpoint should call a separate method in the service that accepts userId
    // For now, we'll need to add that method to the service
    return this.analytics.getMyPerformance(user.id);
  }
}
