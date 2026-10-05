import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContentCategoriesService } from '../content-categories/content-categories.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { QuestionType } from '@prisma/client';
import { TutorScopeService } from '../../common/tutor-scope/tutor-scope.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { CreateQuestionDto, UpdateQuestionDto } from './dto/question.dto';

/**
 * Fase 3a — Question Bank management.
 * 5 tipe soal (SINGLE_CHOICE, MULTIPLE_CHOICE, TRUE_FALSE, SHORT_ANSWER, ESSAY).
 * Mendukung teks, KaTeX, dan gambar.
 */
@Injectable()
export class QuestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tutorScope: TutorScopeService,
    private readonly contentCategories: ContentCategoriesService,
  ) {}

  /**
   * Dedup opsi berdasar konten (pertahankan kemunculan pertama). Melindungi
   * dari payload dobel (bug klien/data korup lama) — opsi identik memang
   * tidak pernah bermakna ganda dalam satu soal.
   */
  private dedupOptions<T extends { content?: string; imageUrl?: string }>(options: T[]): T[] {
    const seen = new Set<string>();
    return options.filter((o) => {
      const key = `${(o.content ?? '').trim().toLowerCase()}|${(o.imageUrl ?? '').trim()}`;
      if (key === '|' || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Konsistensi opsi vs tipe soal:
   * - Pilihan tunggal (SINGLE_CHOICE/TRUE_FALSE): maks 1 jawaban benar —
   *   >1 berarti soal seharusnya bertipe pilihan ganda majemuk.
   * - ESSAY/SHORT_ANSWER tidak memakai opsi (diabaikan).
   */
  private assertOptionConsistency(
    type: QuestionType,
    options: { isCorrect?: boolean }[],
  ) {
    if (type === 'SINGLE_CHOICE' || type === 'TRUE_FALSE') {
      const correct = options.filter((o) => o.isCorrect).length;
      if (correct > 1) {
        throw new BadRequestException(
          'Soal pilihan tunggal hanya boleh punya 1 jawaban benar — gunakan tipe "Pilihan Ganda (Majemuk)" untuk jawaban lebih dari satu.',
        );
      }
    }
  }

  /** Turunkan subjectId dari level → program bila tidak diisi eksplisit. */
  private async resolveSubjectId(
    subjectId?: string,
    levelId?: string,
    programId?: string,
  ): Promise<string | null> {
    if (subjectId) {
      const subject = await this.prisma.subject.findUnique({ where: { id: subjectId } });
      if (!subject) throw new BadRequestException('Mapel tidak ditemukan.');
      return subjectId;
    }
    if (levelId) {
      const level = await this.prisma.level.findUnique({
        where: { id: levelId },
        select: { subjectId: true },
      });
      if (level?.subjectId) return level.subjectId;
    }
    if (programId) {
      const program = await this.prisma.program.findUnique({
        where: { id: programId },
        select: { subjectId: true },
      });
      if (program?.subjectId) return program.subjectId;
    }
    return null;
  }

  async list(
    actor: AuthenticatedUser,
    query: {
      programId?: string;
      levelId?: string;
      subjectId?: string;
      category?: string;
      type?: string;
      difficulty?: string;
      search?: string;
    },
  ) {
    const where: Record<string, unknown> = {};
    if (query.programId) where.programId = query.programId;
    if (query.levelId) where.levelId = query.levelId;
    if (query.subjectId) where.subjectId = query.subjectId;
    if (query.category) where.category = query.category;
    if (query.type) where.type = query.type;
    if (query.difficulty) where.difficulty = query.difficulty;
    if (query.search) {
      where.OR = [
        { content: { contains: query.search, mode: 'insensitive' } },
        { explanation: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    // Tutor hanya melihat bank soal program/level yang dia ampu.
    const scope = await this.tutorScope.for(actor);
    if (scope) {
      // Tutor melihat soal program/level yang dia ampu, soal se-mapel
      // (tutor lain beda level tapi mapel sama tetap saling lihat),
      // dan soal yang dia buat sendiri.
      where.AND = [
        {
          OR: [
            { programId: { in: scope.programIds } },
            { levelId: { in: scope.levelIds } },
            { subjectId: { in: scope.subjectIds } },
            { createdBy: actor.id },
          ],
        },
      ];
    }
    return this.prisma.question.findMany({
      where,
      include: {
        program: { select: { id: true, name: true, code: true } },
        level: { select: { id: true, name: true, code: true } },
        subject: { select: { id: true, name: true, code: true } },
        options: { orderBy: { sortOrder: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async get(id: string, actor?: AuthenticatedUser) {
    const question = await this.prisma.question.findUnique({
      where: { id },
      include: {
        program: { select: { id: true, name: true, code: true } },
        level: { select: { id: true, name: true, code: true } },
        subject: { select: { id: true, name: true, code: true } },
        options: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!question) throw new NotFoundException('Soal tidak ditemukan.');
    if (actor) {
      const scope = await this.tutorScope.for(actor);
      if (scope) {
        const ok =
          (question.programId && scope.programIds.includes(question.programId)) ||
          (question.levelId && scope.levelIds.includes(question.levelId)) ||
          (question.subjectId && scope.subjectIds.includes(question.subjectId)) ||
          question.createdBy === actor.id;
        if (!ok) throw new NotFoundException('Soal tidak ditemukan.');
      }
    }
    return question;
  }

  async create(actorId: string, dto: CreateQuestionDto) {
    // Validasi foreign keys jika ada
    if (dto.programId) {
      const program = await this.prisma.program.findUnique({
        where: { id: dto.programId },
      });
      if (!program) throw new BadRequestException('Program tidak ditemukan.');
    }
    if (dto.levelId) {
      const level = await this.prisma.level.findUnique({
        where: { id: dto.levelId },
      });
      if (!level) throw new BadRequestException('Level tidak ditemukan.');
    }
    const subjectId = await this.resolveSubjectId(dto.subjectId, dto.levelId, dto.programId);

    // Untuk TRUE_FALSE, generate otomatis 2 opsi (Benar, Salah).
    // PENTING: admin/tutor wajib menandai mana yang benar via update;
    // default keduanya false agar tidak ada jawaban benar "bawaan".
    let optionsToCreate = this.dedupOptions(dto.options || []);
    if (dto.type === 'TRUE_FALSE' && optionsToCreate.length === 0) {
      optionsToCreate = [
        { content: 'Benar', isCorrect: false, sortOrder: 0 },
        { content: 'Salah', isCorrect: false, sortOrder: 1 },
      ];
    }
    this.assertOptionConsistency(dto.type, optionsToCreate);
    await this.contentCategories.assertUsable(dto.category);

    return this.prisma.$transaction(async (tx) => {
      const question = await tx.question.create({
        data: {
          programId: dto.programId,
          levelId: dto.levelId,
          subjectId,
          category: dto.category,
          type: dto.type,
          content: dto.content.trim(),
          imageUrl: dto.imageUrl,
          difficulty: dto.difficulty,
          points: dto.points,
          explanation: dto.explanation?.trim(),
          explanationImageUrl: dto.explanationImageUrl?.trim() || null,
          answerKey: dto.answerKey?.trim(),
          createdBy: actorId,
        },
      });

      // Create options
      if (optionsToCreate.length > 0) {
        await tx.questionOption.createMany({
          data: optionsToCreate.map((opt, idx) => ({
            questionId: question.id,
            content: (opt.content ?? '').trim(),
            imageUrl: opt.imageUrl || null,
            isCorrect: opt.isCorrect,
            sortOrder: opt.sortOrder ?? idx,
          })),
        });
      }

      return tx.question.findUniqueOrThrow({
        where: { id: question.id },
        include: {
          program: { select: { id: true, name: true, code: true } },
          level: { select: { id: true, name: true, code: true } },
          subject: { select: { id: true, name: true, code: true } },
          options: { orderBy: { sortOrder: 'asc' } },
        },
      });
    });
  }

  async update(id: string, dto: UpdateQuestionDto) {
    const question = await this.prisma.question.findUnique({ where: { id } });
    if (!question) throw new NotFoundException('Soal tidak ditemukan.');

    // Validasi foreign keys jika berubah
    if (dto.programId && dto.programId !== question.programId) {
      const program = await this.prisma.program.findUnique({
        where: { id: dto.programId },
      });
      if (!program) throw new BadRequestException('Program tidak ditemukan.');
    }
    if (dto.levelId && dto.levelId !== question.levelId) {
      const level = await this.prisma.level.findUnique({
        where: { id: dto.levelId },
      });
      if (!level) throw new BadRequestException('Level tidak ditemukan.');
    }
    const subjectId = dto.subjectId
      ? await this.resolveSubjectId(dto.subjectId)
      : dto.levelId || dto.programId
        ? await this.resolveSubjectId(undefined, dto.levelId ?? undefined, dto.programId ?? undefined)
        : undefined;

    await this.contentCategories.assertUsable(dto.category);

    return this.prisma.$transaction(async (tx) => {
      await tx.question.update({
        where: { id },
        data: {
          programId: dto.programId,
          levelId: dto.levelId,
          ...(subjectId !== undefined ? { subjectId } : {}),
          category: dto.category,
          type: dto.type,
          content: dto.content?.trim(),
          imageUrl: dto.imageUrl,
          difficulty: dto.difficulty,
          points: dto.points,
          explanation: dto.explanation?.trim(),
          explanationImageUrl: dto.explanationImageUrl === undefined ? undefined : dto.explanationImageUrl.trim() || null,
          answerKey: dto.answerKey?.trim(),
          isActive: dto.isActive,
        },
      });

      // Update opsi secara stabil: opsi existing (dikenali via id, atau
      // konten+gambar yang sama) di-update di tempat — ID tidak berubah
      // sehingga jawaban siswa (selectedOptionIds) tetap menunjuk opsi
      // yang sama. Opsi yang dihapus dari payload baru dihapus; yang
      // baru dibuat.
      if (dto.options) {
        const effectiveType = dto.type ?? question.type;
        this.assertOptionConsistency(effectiveType, dto.options);
        const options = this.dedupOptions(dto.options);
        const existing = await tx.questionOption.findMany({ where: { questionId: id } });
        const byId = new Map(existing.map((o) => [o.id, o]));
        const byKey = new Map(
          existing.map((o) => [`${o.content.trim().toLowerCase()}|${(o.imageUrl ?? '').trim()}`, o]),
        );
        const keepIds = new Set<string>();

        for (const [idx, opt] of options.entries()) {
          const content = (opt.content ?? '').trim();
          const imageUrl = opt.imageUrl || null;
          const key = `${content.toLowerCase()}|${(imageUrl ?? '').trim()}`;
          const match = (opt.id ? byId.get(opt.id) : undefined) ?? byKey.get(key);
          if (match) {
            keepIds.add(match.id);
            await tx.questionOption.update({
              where: { id: match.id },
              data: {
                content,
                imageUrl,
                isCorrect: !!opt.isCorrect,
                sortOrder: opt.sortOrder ?? idx,
              },
            });
          } else {
            const created = await tx.questionOption.create({
              data: {
                questionId: id,
                content,
                imageUrl,
                isCorrect: !!opt.isCorrect,
                sortOrder: opt.sortOrder ?? idx,
              },
            });
            keepIds.add(created.id);
          }
        }
        await tx.questionOption.deleteMany({
          where: { questionId: id, id: { notIn: [...keepIds] } },
        });
      }

      return tx.question.findUniqueOrThrow({
        where: { id },
        include: {
          program: { select: { id: true, name: true, code: true } },
          level: { select: { id: true, name: true, code: true } },
          subject: { select: { id: true, name: true, code: true } },
          options: { orderBy: { sortOrder: 'asc' } },
        },
      });
    });
  }

  async delete(id: string) {
    const question = await this.prisma.question.findUnique({ where: { id } });
    if (!question) throw new NotFoundException('Soal tidak ditemukan.');

    // Soal yang sudah dipakai tidak boleh di-hard-delete (FK onDelete: Restrict di
    // ExamItem/LatsolPackageItem/ExamAnswer/LatsolAnswer) — tolak dengan pesan jelas
    // daripada membiarkan error constraint Prisma bocor jadi 500.
    const [examItems, latsolItems, examAnswers, latsolAnswers] =
      await Promise.all([
        this.prisma.examItem.count({ where: { questionId: id } }),
        this.prisma.latsolPackageItem.count({ where: { questionId: id } }),
        this.prisma.examAnswer.count({ where: { questionId: id } }),
        this.prisma.latsolAnswer.count({ where: { questionId: id } }),
      ]);
    if (examItems + latsolItems + examAnswers + latsolAnswers > 0) {
      throw new BadRequestException(
        'Soal tidak bisa dihapus karena sudah dipakai di paket latsol, ujian, atau attempt siswa. Nonaktifkan soal ini sebagai gantinya.',
      );
    }

    await this.prisma.question.delete({ where: { id } });
    return { success: true };
  }

  /**
   * Summary untuk dashboard.
   */
  async getSummary(
    actor: AuthenticatedUser,
    query: { programId?: string; levelId?: string; subjectId?: string } = {},
  ) {
    // Tutor: ringkasan hanya untuk soal program/level/mapel yang dia ampu.
    const scope = await this.tutorScope.for(actor);
    const where: Record<string, unknown> = { isActive: true };
    if (query.programId) where.programId = query.programId;
    if (query.levelId) where.levelId = query.levelId;
    if (query.subjectId) where.subjectId = query.subjectId;
    if (scope) {
      where.AND = [
        {
          OR: [
            { programId: { in: scope.programIds } },
            { levelId: { in: scope.levelIds } },
            { subjectId: { in: scope.subjectIds } },
            { createdBy: actor.id },
          ],
        },
      ];
    }
    const [total, byType, byDifficulty] = await Promise.all([
      this.prisma.question.count({ where }),
      this.prisma.question.groupBy({
        by: ['type'],
        where,
        _count: true,
      }),
      this.prisma.question.groupBy({
        by: ['difficulty'],
        where,
        _count: true,
      }),
    ]);

    return {
      total,
      byType: byType.reduce(
        (acc, item) => ({ ...acc, [String(item.type)]: item._count }),
        {} as Record<string, number>,
      ),
      byDifficulty: byDifficulty.reduce(
        (acc, item) => ({ ...acc, [String(item.difficulty)]: item._count }),
        {} as Record<string, number>,
      ),
    };
  }
}
