import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { ReportViolationDto, ProctoringViolationType, UnlockAttemptDto } from './dto/exam-proctoring.dto';

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
  ) {}

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
