import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContentCategoriesService } from '../content-categories/content-categories.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PointTransactionsService } from '../point-transactions/point-transactions.service';
import { gradeLatsolQuestion } from './latsol-grading';
import { sanitizeQuestion, toFeedbackAnswer } from './latsol-feedback.service';
import {
  CreateLatsolPackageDto,
  GradeEssayDto,
  SaveAnswerDto,
  SubmitLatsolDto,
  UpdateLatsolPackageDto,
} from './dto/latsol.dto';
import { LatsolService } from './latsol.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';

/** Tulis latsol: paket + attempt + koreksi (dipisah dari read agar file kecil). */
@Injectable()
export class LatsolWriteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly read: LatsolService,
    private readonly pointTransactions: PointTransactionsService,
    private readonly contentCategories: ContentCategoriesService,
  ) {}

  async createPackage(actor: AuthenticatedUser, dto: CreateLatsolPackageDto) {
    if (!dto.questionIds.length)
      throw new BadRequestException('Paket latsol minimal berisi 1 soal.');
    await this.read.assertRefs(dto.programId, dto.levelId, actor, dto.subjectId);
    await this.contentCategories.assertUsable(dto.category);
    const subjectId = await this.read.resolveSubjectId(dto.subjectId, dto.levelId, dto.programId);
    const uniq = [...new Set(dto.questionIds)];
    const found = await this.prisma.question.findMany({
      where: { id: { in: uniq }, isActive: true },
      select: { id: true },
    });
    if (found.length !== uniq.length)
      throw new BadRequestException(
        'Salah satu soal tidak ditemukan atau nonaktif.',
      );
    return this.prisma.$transaction(async (tx) => {
      const pkg = await tx.latsolPackage.create({
        data: {
          programId: dto.programId,
          levelId: dto.levelId,
          subjectId,
          category: dto.category,
          title: dto.title.trim(),
          description: dto.description?.trim(),
          createdBy: actor.id,
        },
      });
      await tx.latsolPackageItem.createMany({
        data: uniq.map((questionId, idx) => ({
          packageId: pkg.id,
          questionId,
          sortOrder: idx,
        })),
        skipDuplicates: true,
      });
      return tx.latsolPackage.findUniqueOrThrow({
        where: { id: pkg.id },
        include: this.read.detailInclude(),
      });
    });
  }

  async updatePackage(
    id: string,
    dto: UpdateLatsolPackageDto,
    actor: AuthenticatedUser,
  ) {
    const pkg = await this.prisma.latsolPackage.findUnique({ where: { id } });
    if (!pkg) throw new NotFoundException('Paket latsol tidak ditemukan.');
    const newSubjectId =
      dto.subjectId !== undefined
        ? await this.read.resolveSubjectId(dto.subjectId || undefined)
        : await this.read.resolveSubjectId(
            undefined,
            dto.levelId ?? pkg.levelId ?? undefined,
            dto.programId ?? pkg.programId ?? undefined,
          );
    await this.read.assertRefs(
      dto.programId ?? pkg.programId ?? undefined,
      dto.levelId ?? pkg.levelId ?? undefined,
      actor,
      newSubjectId ?? undefined,
    );
    await this.contentCategories.assertUsable(dto.category);

    return this.prisma.$transaction(async (tx) => {
      if (dto.questionIds) {
        if (!dto.questionIds.length)
          throw new BadRequestException('Paket latsol minimal berisi 1 soal.');
        const uniq = [...new Set(dto.questionIds)];
        const found = await tx.question.findMany({
          where: { id: { in: uniq }, isActive: true },
          select: { id: true },
        });
        if (found.length !== uniq.length)
          throw new BadRequestException(
            'Salah satu soal tidak ditemukan atau nonaktif.',
          );
        await tx.latsolPackageItem.deleteMany({ where: { packageId: id } });
        await tx.latsolPackageItem.createMany({
          data: uniq.map((questionId, idx) => ({
            packageId: id,
            questionId,
            sortOrder: idx,
          })),
        });
      }
      return tx.latsolPackage.update({
        where: { id },
        data: {
          programId: dto.programId,
          levelId: dto.levelId,
          subjectId: newSubjectId,
          category: dto.category,
          title: dto.title?.trim(),
          description: dto.description?.trim(),
          isActive: dto.isActive,
        },
        include: this.read.detailInclude(),
      });
    });
  }

  async deletePackage(id: string, actor: AuthenticatedUser) {
    const pkg = await this.prisma.latsolPackage.findUnique({ where: { id } });
    if (!pkg) throw new NotFoundException('Paket latsol tidak ditemukan.');
    await this.read.assertRefs(
      pkg.programId ?? undefined,
      pkg.levelId ?? undefined,
      actor,
      pkg.subjectId ?? undefined,
    );
    await this.prisma.latsolPackage.delete({ where: { id } });
    return { success: true };
  }

  async requireStudent(userId: string) {
    const s = await this.prisma.student.findUnique({ where: { userId } });
    if (!s)
      throw new ForbiddenException('Akun ini tidak terhubung ke data siswa.');
    return s;
  }

  async start(userId: string, packageId: string) {
    const student = await this.requireStudent(userId);
    const pkg = await this.prisma.latsolPackage.findUnique({
      where: { id: packageId },
      include: {
        items: {
          include: { question: { select: { id: true, points: true } } },
        },
      },
    });
    if (!pkg || !pkg.isActive)
      throw new NotFoundException('Paket latsol tidak ditemukan.');
    if (!pkg.items.length)
      throw new BadRequestException('Paket latsol belum berisi soal.');
    const maxScore = pkg.items.reduce(
      (s, it) => s + (it.question.points ?? 1),
      0,
    );
    return this.prisma.latsolAttempt.create({
      data: { packageId, studentId: student.id, maxScore },
      include: { package: { select: { id: true, title: true } } },
    });
  }

  async myAttempts(userId: string, packageId?: string) {
    const student = await this.requireStudent(userId);
    return this.prisma.latsolAttempt.findMany({
      where: { studentId: student.id, ...(packageId ? { packageId } : {}) },
      include: {
        package: { select: { id: true, title: true } },
        _count: { select: { answers: true } },
      },
      orderBy: { startedAt: 'desc' },
      take: 50,
    });
  }

  async packageAttempts(packageId: string, actor: AuthenticatedUser) {
    const pkg = await this.prisma.latsolPackage.findUnique({
      where: { id: packageId },
      select: { programId: true, levelId: true, subjectId: true },
    });
    if (!pkg) throw new NotFoundException('Paket latsol tidak ditemukan.');
    await this.read.assertRefs(
      pkg.programId ?? undefined,
      pkg.levelId ?? undefined,
      actor,
      pkg.subjectId ?? undefined,
    );
    return this.prisma.latsolAttempt.findMany({
      where: { packageId },
      include: {
        student: {
          select: { id: true, user: { select: { name: true, email: true } } },
        },
        _count: { select: { answers: true } },
      },
      orderBy: { startedAt: 'desc' },
      take: 100,
    });
  }

  async attemptDetail(userId: string, attemptId: string) {
    const student = await this.requireStudent(userId);
    const attempt = await this.prisma.latsolAttempt.findUnique({
      where: { id: attemptId },
      include: {
        package: { select: { id: true, title: true, description: true } },
      },
    });
    if (!attempt || attempt.studentId !== student.id)
      throw new NotFoundException('Attempt tidak ditemukan.');
    const [items, answers] = await Promise.all([
      this.prisma.latsolPackageItem.findMany({
        where: { packageId: attempt.packageId },
        orderBy: { sortOrder: 'asc' },
        include: {
          question: { include: { options: { orderBy: { sortOrder: 'asc' } } } },
        },
      }),
      this.prisma.latsolAnswer.findMany({
        where: { attemptId },
        include: {
          question: { include: { options: { orderBy: { sortOrder: 'asc' } } } },
        },
      }),
    ]);
    const byQ = new Map(answers.map((a) => [a.questionId, a]));
    return {
      id: attempt.id,
      status: attempt.status,
      score: attempt.score,
      maxScore: attempt.maxScore,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      package: attempt.package,
      items: items.map((it) => {
        const ans = byQ.get(it.questionId);
        if (!ans)
          return {
            questionId: it.questionId,
            sortOrder: it.sortOrder,
            answered: false as const,
            question: sanitizeQuestion(it.question),
          };
        return {
          questionId: it.questionId,
          sortOrder: it.sortOrder,
          answered: true as const,
          answer: toFeedbackAnswer(ans),
        };
      }),
    };
  }

  async saveAnswer(
    userId: string,
    attemptId: string,
    qid: string,
    dto: SaveAnswerDto,
  ) {
    const student = await this.requireStudent(userId);
    const attempt = await this.prisma.latsolAttempt.findUnique({
      where: { id: attemptId },
    });
    if (!attempt || attempt.studentId !== student.id)
      throw new NotFoundException('Attempt tidak ditemukan.');
    if (attempt.status !== 'IN_PROGRESS')
      throw new BadRequestException('Attempt ini sudah dikumpulkan.');
    const item = await this.prisma.latsolPackageItem.findUnique({
      where: {
        packageId_questionId: { packageId: attempt.packageId, questionId: qid },
      },
      include: { question: { include: { options: true } } },
    });
    if (!item)
      throw new BadRequestException('Soal tersebut bukan bagian paket ini.');
    const g = gradeLatsolQuestion(item.question, {
      selectedOptionIds: dto.selectedOptionIds,
      textAnswer: dto.textAnswer,
    });
    const saved = await this.prisma.latsolAnswer.upsert({
      where: { attemptId_questionId: { attemptId, questionId: qid } },
      create: {
        attemptId,
        questionId: qid,
        selectedOptionIds: dto.selectedOptionIds ?? [],
        textAnswer: dto.textAnswer,
        isCorrect: g.isCorrect,
        score: g.score,
      },
      update: {
        selectedOptionIds: dto.selectedOptionIds ?? [],
        textAnswer: dto.textAnswer,
        isCorrect: g.isCorrect,
        score: g.score,
      },
      include: {
        question: { include: { options: { orderBy: { sortOrder: 'asc' } } } },
      },
    });
    const all = await this.prisma.latsolAnswer.findMany({
      where: { attemptId },
      select: { score: true },
    });
    await this.prisma.latsolAttempt.update({
      where: { id: attemptId },
      data: { score: all.reduce((s, a) => s + a.score, 0) },
    });
    return toFeedbackAnswer(saved);
  }

  async submit(userId: string, attemptId: string, dto: SubmitLatsolDto) {
    const student = await this.requireStudent(userId);
    const attempt = await this.prisma.latsolAttempt.findUnique({
      where: { id: attemptId },
    });
    if (!attempt || attempt.studentId !== student.id)
      throw new NotFoundException('Attempt tidak ditemukan.');
    if (attempt.status !== 'IN_PROGRESS')
      throw new BadRequestException('Attempt ini sudah dikumpulkan.');
    const items = await this.prisma.latsolPackageItem.findMany({
      where: { packageId: attempt.packageId },
      orderBy: { sortOrder: 'asc' },
      include: { question: { include: { options: true } } },
    });
    if (!items.length)
      throw new BadRequestException('Paket latsol belum berisi soal.');
    const byQ = new Map((dto.answers ?? []).map((a) => [a.questionId, a]));
    for (const item of items) {
      const inc = byQ.get(item.questionId);
      if (!inc) continue;
      const g = gradeLatsolQuestion(item.question, {
        selectedOptionIds: inc.selectedOptionIds,
        textAnswer: inc.textAnswer,
      });
      await this.prisma.latsolAnswer.upsert({
        where: {
          attemptId_questionId: { attemptId, questionId: item.questionId },
        },
        create: {
          attemptId,
          questionId: item.questionId,
          selectedOptionIds: inc.selectedOptionIds ?? [],
          textAnswer: inc.textAnswer,
          isCorrect: g.isCorrect,
          score: g.score,
        },
        update: {
          selectedOptionIds: inc.selectedOptionIds ?? [],
          textAnswer: inc.textAnswer,
          isCorrect: g.isCorrect,
          score: g.score,
        },
      });
    }
    const all = await this.prisma.latsolAnswer.findMany({
      where: { attemptId },
      select: { score: true },
    });
    await this.prisma.latsolAttempt.update({
      where: { id: attemptId },
      data: {
        status: 'SUBMITTED',
        submittedAt: new Date(),
        score: all.reduce((s, a) => s + a.score, 0),
      },
    });
    // Fase 4b: catat poin berdasar score_rules aktif (idempotent; kegagalan
    // poin tidak boleh menggagalkan submit yang sudah final).
    try {
      await this.pointTransactions.createLatsolTransaction(attemptId);
    } catch (error) {
      console.error(
        `[LatsolWrite] Gagal mencatat poin untuk attempt ${attemptId}:`,
        error,
      );
    }
    return this.attemptDetail(userId, attemptId);
  }

  async gradeAnswer(answerId: string, dto: GradeEssayDto) {
    const ans = await this.prisma.latsolAnswer.findUnique({
      where: { id: answerId },
      include: { question: { select: { points: true } } },
    });
    if (!ans) throw new NotFoundException('Jawaban tidak ditemukan.');
    const maxScore = ans.question.points ?? 1;
    const score = dto.score ?? (dto.isCorrect ? maxScore : 0);
    if (score < 0 || score > maxScore)
      throw new BadRequestException(`Skor harus 0–${maxScore} untuk soal ini.`);
    const updated = await this.prisma.latsolAnswer.update({
      where: { id: answerId },
      data: { score, isCorrect: dto.isCorrect ?? score === maxScore },
      include: {
        question: { include: { options: { orderBy: { sortOrder: 'asc' } } } },
      },
    });
    const all = await this.prisma.latsolAnswer.findMany({
      where: { attemptId: updated.attemptId },
      select: { score: true },
    });
    await this.prisma.latsolAttempt.update({
      where: { id: updated.attemptId },
      data: { score: all.reduce((s, a) => s + a.score, 0) },
    });
    return toFeedbackAnswer(updated);
  }
}
