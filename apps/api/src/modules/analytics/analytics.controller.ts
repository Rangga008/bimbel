/**
 * Fase 4a — Analytics Controller
 * Per-question analytics & student performance dashboard
 * Role-based access control for Student, Parent, Tutor, Admin Academic
 */
import { Controller, Get, Query, UseGuards, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions, RequireAnyPermissions } from '../rbac/permissions.decorator';
import { PERMISSION_CODES } from '../rbac/permissions.constants';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { AnalyticsService } from './analytics.service';

/** `?exams=id1,id2` → array id ujian (subset yang dipilih untuk laporan). */
function parseExamIds(raw?: string) {
  if (!raw) return undefined;
  const ids = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 50);
  return ids.length ? ids : undefined;
}

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
   * Rekap nilai semua siswa dalam satu ujian (matriks mapel/bab — gaya "HASIL TO").
   * Access: Admin Academic, Tutor
   */
  @Get('exam/:examId/score-recap')
  @RequirePermissions(PERMISSION_CODES.ANALYTICS_EXAM_VIEW)
  async getExamScoreRecap(@Param('examId') examId: string) {
    return this.analytics.getExamScoreRecap(examId);
  }

  /**
   * Rekap jawaban per nomor soal (baris KUNCI + jawaban tiap siswa — gaya "JAWABAN SISWA").
   */
  @Get('exam/:examId/answer-recap')
  @RequirePermissions(PERMISSION_CODES.ANALYTICS_EXAM_VIEW)
  async getExamAnswerRecap(@Param('examId') examId: string) {
    return this.analytics.getExamAnswerRecap(examId);
  }

  /** Export rekap nilai ujian ke .xlsx. */
  @Get('exam/:examId/score-recap.xlsx')
  @RequirePermissions(PERMISSION_CODES.ANALYTICS_EXAM_VIEW)
  async exportExamScoreRecap(
    @Param('examId') examId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { buffer, filename } = await this.analytics.exportExamScoreRecapXlsx(examId);
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.length),
    });
    res.send(buffer);
  }

  /** Export rekap jawaban per nomor ke .xlsx (baris KUNCI + sel benar/salah berwarna). */
  @Get('exam/:examId/answer-recap.xlsx')
  @RequirePermissions(PERMISSION_CODES.ANALYTICS_EXAM_VIEW)
  async exportExamAnswerRecap(
    @Param('examId') examId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { buffer, filename } = await this.analytics.exportExamAnswerRecapXlsx(examId);
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.length),
    });
    res.send(buffer);
  }

  /**
   * Dokumen cetak HTML siap-print (auto window.print):
   * part=questions (lembar soal, +key=1 untuk kunci) | answers (rekap jawaban) | scores (rekap nilai).
   */
  @Get('exam/:examId/print')
  @RequirePermissions(PERMISSION_CODES.ANALYTICS_EXAM_VIEW)
  async printExam(
    @Param('examId') examId: string,
    @Query('part') part: string,
    @Query('key') key: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    let html: string;
    if (part === 'answers') {
      const recap = await this.analytics.getExamAnswerRecap(examId);
      html = this.analytics.renderAnswerRecapHtml(recap);
    } else if (part === 'scores') {
      const recap = await this.analytics.getExamScoreRecap(examId);
      html = this.analytics.renderScoreRecapHtml(recap);
    } else {
      const sheet = await this.analytics.getExamQuestionSheet(examId, key === '1');
      html = this.analytics.renderQuestionSheetHtml(sheet);
    }
    res.set({ 'Content-Type': 'text/html; charset=utf-8' });
    res.send(html);
  }

  /**
   * Laporan hasil belajar siswa per tipe ujian (mis. TO/TKA/UTBK): matriks
   * nilai per mapel lintas beberapa ujian + opsi "Tes Kemampuan Dasar"
   * (basic=kategori lain). JSON untuk pratinjau, /print untuk dokumen cetak.
   * Access: Admin Academic / Tutor (performa siswa).
   */
  /**
   * Daftar ujian yang pernah dikerjakan siswa (attempt SUBMITTED) — untuk
   * pemilih "ujian yang disertakan" di halaman Laporan Hasil Belajar.
   */
  /** Siswa yang diampu tutor — pemilih siswa di halaman laporan tutor. */
  @Get('my-students')
  @RequirePermissions(PERMISSION_CODES.ANALYTICS_TUTOR_GROUP_VIEW)
  myStudents(@CurrentUser() user: AuthenticatedUser) {
    return this.analytics.myStudents(user);
  }

  @Get('student/:studentId/report-exams')
  @RequireAnyPermissions(
    PERMISSION_CODES.ANALYTICS_STUDENT_PERFORMANCE_VIEW,
    PERMISSION_CODES.ANALYTICS_TUTOR_GROUP_VIEW,
  )
  async listStudentReportExams(
    @CurrentUser() user: AuthenticatedUser,
    @Param('studentId') studentId: string,
  ) {
    await this.analytics.assertStudentPerformanceAccess(user, studentId);
    return this.analytics.listReportExams(studentId);
  }

  @Get('parent/child/:studentId/report-exams')
  @RequirePermissions(PERMISSION_CODES.ANALYTICS_PARENT_CHILD_VIEW)
  async listChildReportExams(
    @CurrentUser() user: AuthenticatedUser,
    @Param('studentId') studentId: string,
  ) {
    await this.analytics.assertParentOwnsChild(user.id, studentId);
    return this.analytics.listReportExams(studentId);
  }

  @Get('my-report-exams')
  @RequirePermissions(PERMISSION_CODES.ANALYTICS_MY_PERFORMANCE_VIEW)
  async listMyReportExams(@CurrentUser() user: AuthenticatedUser) {
    const studentId = await this.analytics.studentIdForUser(user.id);
    return this.analytics.listReportExams(studentId);
  }

  @Get('student/:studentId/learning-report')
  @RequireAnyPermissions(
    PERMISSION_CODES.ANALYTICS_STUDENT_PERFORMANCE_VIEW,
    PERMISSION_CODES.ANALYTICS_TUTOR_GROUP_VIEW,
  )
  async getStudentLearningReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('studentId') studentId: string,
    @Query('category') category = '',
    @Query('basic') basic?: string,
    @Query('exams') exams?: string,
  ) {
    await this.analytics.assertStudentPerformanceAccess(user, studentId);
    return this.analytics.getStudentLearningReport(
      studentId,
      category,
      basic,
      parseExamIds(exams),
    );
  }

  @Get('student/:studentId/learning-report/print')
  @RequireAnyPermissions(
    PERMISSION_CODES.ANALYTICS_STUDENT_PERFORMANCE_VIEW,
    PERMISSION_CODES.ANALYTICS_TUTOR_GROUP_VIEW,
  )
  async printStudentLearningReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('studentId') studentId: string,
    @Query('category') category = '',
    @Query('basic') basic: string | undefined,
    @Query('exams') exams: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.analytics.assertStudentPerformanceAccess(user, studentId);
    const report = await this.analytics.getStudentLearningReport(
      studentId,
      category,
      basic,
      parseExamIds(exams),
    );
    res.set({ 'Content-Type': 'text/html; charset=utf-8' });
    res.send(await this.analytics.renderLearningReportHtml(report));
  }

  /**
   * Laporan hasil belajar anak — ortu (scope lewat parentStudents).
   */
  @Get('parent/child/:studentId/learning-report/print')
  @RequirePermissions(PERMISSION_CODES.ANALYTICS_PARENT_CHILD_VIEW)
  async printChildLearningReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('studentId') studentId: string,
    @Query('category') category = '',
    @Query('basic') basic: string | undefined,
    @Query('exams') exams: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const report = await this.analytics.getChildLearningReport(
      user.id,
      studentId,
      category,
      basic,
      parseExamIds(exams),
    );
    res.set({ 'Content-Type': 'text/html; charset=utf-8' });
    res.send(await this.analytics.renderLearningReportHtml(report));
  }

  /** Laporan hasil belajar mandiri — siswa (data sendiri). */
  @Get('my-learning-report/print')
  @RequirePermissions(PERMISSION_CODES.ANALYTICS_MY_PERFORMANCE_VIEW)
  async printMyLearningReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query('category') category = '',
    @Query('basic') basic: string | undefined,
    @Query('exams') exams: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const report = await this.analytics.getMyLearningReport(
      user.id,
      category,
      basic,
      parseExamIds(exams),
    );
    res.set({ 'Content-Type': 'text/html; charset=utf-8' });
    res.send(await this.analytics.renderLearningReportHtml(report));
  }

  /**
   * Laporan bulanan anak (kehadiran + nilai ujian + latsol + poin).
   * Access: Parent (own children only). period=YYYY-MM, default bulan berjalan.
   */
  @Get('parent/child/:studentId/monthly')
  @RequirePermissions(PERMISSION_CODES.ANALYTICS_PARENT_CHILD_VIEW)
  async getChildMonthlyReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('studentId') studentId: string,
    @Query('period') period?: string,
  ) {
    return this.analytics.getChildMonthlyReport(user.id, studentId, period ?? '');
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
