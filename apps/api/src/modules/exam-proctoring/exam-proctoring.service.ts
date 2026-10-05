import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { TutorScopeService } from '../../common/tutor-scope/tutor-scope.service';
import { ReportViolationDto, ProctoringViolationType, UnlockAttemptDto } from './dto/exam-proctoring.dto';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';

/**
 * Fase 3d — Proctoring & Anti-Leak
 * 
 * Fitur:
 * - Record violation (fullscreen exit, visibility change, blur, tab leave)
 * - Auto-lock attempt when violation threshold reached (default: 3 violations)
 * - Unlock attempt hanya oleh user dengan permission exam_proctor.unlock
 * - Unlock lintas kelompok/program (berdasarkan permission, bukan relasi tutor-siswa)
 * - Semua LOCK/UNLOCK wajib masuk audit log
 */
@Injectable()
export class ExamProctoringService {
  private readonly VIOLATION_THRESHOLD = 3; // Default: lock after 3 violations

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tutorScope: TutorScopeService,
  ) {}

  /**
   * Overview peserta ujian per kelompok untuk pengawas.
   * Kelompok yang ditampilkan = kelompok aktif dengan jenjang sama seperti
   * ujian (peserta eligible) ∪ kelompok yang anggotanya punya attempt.
   * Member tanpa attempt ditandai BELUM_MULAI. Attempt siswa yang tidak
   * ada di kelompok manapun masuk daftar `ungrouped`.
   */
  async examOverview(examId: string, actor: AuthenticatedUser) {
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      include: {
        program: { select: { id: true, name: true } },
        level: { select: { id: true, name: true } },
        subject: { select: { id: true, name: true } },
        _count: { select: { items: true } },
      },
    });
    if (!exam) throw new NotFoundException('Ujian tidak ditemukan.');

    const scope = await this.tutorScope.for(actor);
    if (scope) {
      this.tutorScope.assertContentRef(
        scope,
        exam.programId,
        exam.levelId,
        exam.subjectId,
      );
    }

    const studentSelect = {
      id: true,
      user: { select: { name: true, email: true } },
    } as const;

    const attempts = await this.prisma.examAttempt.findMany({
      where: { examId },
      include: {
        student: {
          select: {
            ...studentSelect,
            groupMembers: {
              where: { group: { isActive: true } },
              select: { group: { select: { id: true, name: true } } },
            },
          },
        },
      },
      orderBy: { startedAt: 'asc' },
    });

    // attempt terakhir per siswa (list asc → yang terakhir menimpa)
    const attemptByStudent = new Map<string, (typeof attempts)[number]>();
    for (const a of attempts) attemptByStudent.set(a.studentId, a);
    const attemptGroupIds = new Set<string>();
    for (const a of attempts)
      for (const m of a.student.groupMembers) attemptGroupIds.add(m.group.id);

    // Kelompok eligible: jenjang sama dengan ujian (bila ujian punya jenjang).
    const levelGroups = exam.levelId
      ? await this.prisma.learningGroup.findMany({
          where: { levelId: exam.levelId, isActive: true },
          select: {
            id: true,
            name: true,
            members: {
              include: { student: { select: studentSelect } },
            },
          },
        })
      : [];

    // Kelompok lain yang anggotanya ikut ujian tapi beda jenjang / ujian tanpa jenjang.
    const extraIds = [...attemptGroupIds].filter(
      (id) => !levelGroups.some((g) => g.id === id),
    );
    const extraGroups = extraIds.length
      ? await this.prisma.learningGroup.findMany({
          where: { id: { in: extraIds } },
          select: {
            id: true,
            name: true,
            members: {
              include: { student: { select: studentSelect } },
            },
          },
        })
      : [];

    const mapAttempt = (a: (typeof attempts)[number] | undefined) =>
      a
        ? {
            id: a.id,
            status: a.status,
            score: a.score,
            maxScore: a.maxScore,
            violationCount: a.violationCount,
            startedAt: a.startedAt,
            submittedAt: a.submittedAt,
            lateByMs: a.lateByMs,
            lockedAt: a.lockedAt,
            lockedReason: a.lockedReason,
          }
        : null;

    const groupedStudentIds = new Set<string>();
    const groups = [...levelGroups, ...extraGroups].map((g) => {
      const members = g.members.map((m) => {
        groupedStudentIds.add(m.studentId);
        return {
          studentId: m.studentId,
          name: m.student.user.name,
          email: m.student.user.email,
          attempt: mapAttempt(attemptByStudent.get(m.studentId)),
        };
      });
      members.sort((a, b) => a.name.localeCompare(b.name, 'id'));
      return { id: g.id, name: g.name, members };
    });

    const ungrouped = attempts
      .filter((a) => !groupedStudentIds.has(a.studentId))
      .map((a) => ({
        studentId: a.studentId,
        name: a.student.user.name,
        email: a.student.user.email,
        attempt: mapAttempt(a),
      }));

    const count = (s: string) =>
      attempts.filter((a) => a.status === s).length;
    const belumMulai =
      groups.reduce((n, g) => n + g.members.filter((m) => !m.attempt).length, 0);

    return {
      exam: {
        id: exam.id,
        title: exam.title,
        status: exam.status,
        category: exam.category,
        maxScore: exam.maxScore,
        durationMinutes: exam.durationMinutes,
        scheduledStartAt: exam.scheduledStartAt,
        scheduledEndAt: exam.scheduledEndAt,
        totalQuestions: exam._count.items,
        program: exam.program,
        level: exam.level,
        subject: exam.subject,
      },
      stats: {
        totalAttempts: attempts.length,
        inProgress: count('IN_PROGRESS'),
        submitted: count('SUBMITTED'),
        locked: count('LOCKED'),
        notStarted: belumMulai,
        violations: attempts.reduce((n, a) => n + a.violationCount, 0),
      },
      groups,
      ungrouped,
    };
  }

  /**
   * Record proctoring violation from client.
   * Validasi: attempt IN_PROGRESS milik pelapor, increment violation count.
   * Auto-lock jika mencapai threshold.
   */
  async reportViolation(userId: string, attemptId: string, dto: ReportViolationDto) {
    const attempt = await this.prisma.examAttempt.findUnique({
      where: { id: attemptId },
      include: { exam: true, student: { select: { userId: true } } },
    });

    if (!attempt) {
      throw new NotFoundException('Attempt tidak ditemukan.');
    }

    if (attempt.student.userId !== userId) {
      throw new ForbiddenException('Attempt ini bukan milik Anda.');
    }

    if (attempt.status !== 'IN_PROGRESS') {
      throw new BadRequestException('Attempt ini sudah selesai atau dikunci.');
    }

    // Increment violation count
    const updated = await this.prisma.examAttempt.update({
      where: { id: attemptId },
      data: {
        violationCount: { increment: 1 },
      },
    });

    // Check if should auto-lock
    if (updated.violationCount >= this.VIOLATION_THRESHOLD) {
      await this.lockAttempt(attemptId, 'SYSTEM', `Auto-lock due to ${dto.violationType} (threshold: ${this.VIOLATION_THRESHOLD})`);
      return {
        success: true,
        violationCount: updated.violationCount,
        locked: true,
        message: `Attempt dikunci karena mencapai ${this.VIOLATION_THRESHOLD} pelanggaran.`,
      };
    }

    return {
      success: true,
      violationCount: updated.violationCount,
      locked: false,
      message: `Pelanggaran tercatat (${updated.violationCount}/${this.VIOLATION_THRESHOLD}).`,
    };
  }

  /**
   * Lock attempt (manual or auto).
   * Wajib log ke audit.
   */
  private async lockAttempt(attemptId: string, lockedBy: string, reason: string) {
    const attempt = await this.prisma.examAttempt.findUnique({
      where: { id: attemptId },
    });

    if (!attempt) {
      throw new NotFoundException('Attempt tidak ditemukan.');
    }

    if (attempt.status === 'LOCKED') {
      throw new BadRequestException('Attempt sudah dikunci.');
    }

    const updated = await this.prisma.examAttempt.update({
      where: { id: attemptId },
      data: {
        status: 'LOCKED',
        lockedAt: new Date(),
        lockedBy,
        lockedReason: reason,
      },
    });

    // Audit log
    await this.audit.log({
      actorId: lockedBy === 'SYSTEM' ? null : lockedBy,
      action: 'exam_attempt.lock',
      entity: 'ExamAttempt',
      entityId: attemptId,
      oldData: { status: attempt.status },
      newData: { status: 'LOCKED', lockedBy, lockedReason: reason },
    });

    return updated;
  }

  /**
   * Unlock attempt.
   * Hanya user dengan permission exam_proctor.unlock yang bisa.
   * Lintas kelompok/program (tidak ada batasan relasi tutor-siswa).
   * Wajib log ke audit.
   */
  async unlockAttempt(userId: string, attemptId: string, dto: UnlockAttemptDto) {
    const attempt = await this.prisma.examAttempt.findUnique({
      where: { id: attemptId },
      include: { student: true },
    });

    if (!attempt) {
      throw new NotFoundException('Attempt tidak ditemukan.');
    }

    if (attempt.status !== 'LOCKED') {
      throw new BadRequestException('Attempt tidak dalam status LOCKED.');
    }

    const updated = await this.prisma.examAttempt.update({
      where: { id: attemptId },
      data: {
        status: 'IN_PROGRESS',
        unlockedAt: new Date(),
        unlockedBy: userId,
      },
    });

    // Audit log
    await this.audit.log({
      actorId: userId,
      action: 'exam_attempt.unlock',
      entity: 'ExamAttempt',
      entityId: attemptId,
      oldData: { status: 'LOCKED', lockedBy: attempt.lockedBy, lockedReason: attempt.lockedReason },
      newData: { status: 'IN_PROGRESS', unlockedBy: userId, reason: dto.reason },
    });

    return updated;
  }

  /**
   * Get proctoring status for an attempt.
   * Hanya pemilik attempt atau pemegang exam.view / exam_proctor.unlock.
   */
  async getProctoringStatus(userId: string, attemptId: string, canViewAll: boolean) {
    const attempt = await this.prisma.examAttempt.findUnique({
      where: { id: attemptId },
      select: {
        id: true,
        status: true,
        student: { select: { userId: true } },
        violationCount: true,
        lockedAt: true,
        lockedBy: true,
        lockedReason: true,
        unlockedAt: true,
        unlockedBy: true,
      },
    });

    if (!attempt) {
      throw new NotFoundException('Attempt tidak ditemukan.');
    }

    if (attempt.student.userId !== userId && !canViewAll) {
      throw new ForbiddenException('Anda tidak berhak melihat status attempt ini.');
    }

    return {
      id: attempt.id,
      status: attempt.status,
      violationCount: attempt.violationCount,
      lockedAt: attempt.lockedAt,
      lockedBy: attempt.lockedBy,
      lockedReason: attempt.lockedReason,
      unlockedAt: attempt.unlockedAt,
      unlockedBy: attempt.unlockedBy,
      violationThreshold: this.VIOLATION_THRESHOLD,
      canBeLocked: attempt.status === 'IN_PROGRESS' && attempt.violationCount < this.VIOLATION_THRESHOLD,
    };
  }
}
