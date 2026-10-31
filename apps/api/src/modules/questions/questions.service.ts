import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
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
   * Dedup opsi berdasar identitas baris penuh (konten persis + gambar +
   * posisi). Melindungi dari payload dobel (bug klien/data korup lama)
   * TANPA membuang opsi yang memang sengaja dibuat sama — dua opsi dengan
   * teks sama (atau hanya beda kapital) di posisi berbeda tetap disimpan.
   */
  private dedupOptions<T extends { content?: string; imageUrl?: string; sortOrder?: number }>(
    options: T[],
  ): T[] {
    const seen = new Set<string>();
    return options.filter((o, idx) => {
      const content = (o.content ?? '').trim();
      const image = (o.imageUrl ?? '').trim();
      const hasSort = typeof o.sortOrder === 'number';
      const key = `${content}|${image}|${hasSort ? o.sortOrder : idx}`;
      if (key === '||' || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /** Normalisasi teks untuk fingerprint dedup. */
  private normText(s?: string | null): string {
    return (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  /**
   * Fingerprint identitas soal — konten + tipe + gambar + kunci + seluruh
   * opsi (teks/gambar/status-benar, urutan tak berpengaruh). Dua soal dengan
   * fingerprint sama di jenjang/mapel/kategori/program yang sama = duplikat.
   */
  fingerprintOf(q: {
    type: QuestionType;
    content: string;
    stimulus?: string | null;
    imageUrl?: string | null;
    answerKey?: string | null;
    options?: { content?: string | null; imageUrl?: string | null; isCorrect?: boolean }[];
  }): string {
    const opts = (q.options ?? [])
      .map(
        (o) =>
          `${this.normText(o.content)}|${this.normText(o.imageUrl)}|${o.isCorrect ? 1 : 0}`,
      )
      .sort();
    return createHash('sha1')
      .update(
        [
          q.type,
          this.normText(q.stimulus),
          this.normText(q.content),
          this.normText(q.imageUrl),
          this.normText(q.answerKey),
          ...opts,
        ].join(''),
      )
      .digest('hex');
  }

  /**
   * Fingerprint semua soal dalam satu scope taksonomi — dipakai untuk
   * menandai baris import yang duplikat.
   */
  async existingFingerprints(scope: {
    programId?: string | null;
    levelId?: string | null;
    subjectId?: string | null;
    category?: string | null;
  }): Promise<Map<string, string>> {
    const existing = await this.prisma.question.findMany({
      where: {
        programId: scope.programId ?? null,
        levelId: scope.levelId ?? null,
        subjectId: scope.subjectId ?? null,
        category: scope.category ?? null,
        // Soal soft-deleted tidak ikut fingerprint — re-import membuat
        // soal baru alih-alih "menghidupkan" yang sudah dihapus.
        deletedAt: null,
      },
      include: { options: true },
    });
    // fingerprint → id soal yang sudah ada — dipakai import untuk menandai
    // baris duplikat sekaligus mengembalikan id-nya ke pemilih soal.
    return new Map(existing.map((q) => [this.fingerprintOf(q), q.id]));
  }

  /** Konsistensi opsi vs tipe soal:
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
      /** Daftar id eksplisit (dipisah koma) — untuk menampilkan soal terpilih
       * di pemilih soal walau di luar filter taksonomi saat ini. */
      ids?: string;
    },
  ) {
    const where: Record<string, unknown> = { deletedAt: null };
    if (query.ids) {
      where.id = {
        in: query.ids
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      };
    }
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

  async create(actor: AuthenticatedUser, dto: CreateQuestionDto) {
    const actorId = actor.id;
    // Tutor hanya membuat soal di program/level/mapel yang dia ampu.
    const scope = await this.tutorScope.for(actor);
    if (scope) {
      this.tutorScope.assertContentRef(scope, dto.programId, dto.levelId, dto.subjectId);
    }
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

    // Tolak soal duplikat — konten+tipe+opsi identik dalam jenjang/mapel/
    // kategori/program yang sama (mis. import file yang sama dua kali).
    const fingerprints = await this.existingFingerprints({
      programId: dto.programId,
      levelId: dto.levelId,
      subjectId,
      category: dto.category,
    });
    const fp = this.fingerprintOf({
      type: dto.type,
      content: dto.content,
      imageUrl: dto.imageUrl,
      answerKey: dto.answerKey,
      options: optionsToCreate,
    });
    if (fingerprints.has(fp)) {
      throw new ConflictException(
        'Soal ini identik dengan soal yang sudah ada di jenjang/mapel/kategori ini — tidak dibuat ulang.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const question = await tx.question.create({
        data: {
          programId: dto.programId,
          levelId: dto.levelId,
          subjectId,
          category: dto.category,
          type: dto.type,
          content: dto.content.trim(),
          stimulus: dto.stimulus?.trim() || null,
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

  async update(id: string, dto: UpdateQuestionDto, actor?: AuthenticatedUser) {
    const question = await this.prisma.question.findUnique({ where: { id } });
    if (!question) throw new NotFoundException('Soal tidak ditemukan.');
    // Tutor hanya mengubah soal dalam scope-nya atau buatannya sendiri.
    if (actor) {
      const scope = await this.tutorScope.for(actor);
      if (scope) {
        const ok =
          (question.programId && scope.programIds.includes(question.programId)) ||
          (question.levelId && scope.levelIds.includes(question.levelId)) ||
          (question.subjectId && scope.subjectIds.includes(question.subjectId)) ||
          question.createdBy === actor.id;
        if (!ok) throw new ForbiddenException('Soal ini di luar kelompok yang Anda ampu.');
        this.tutorScope.assertContentRef(
          scope,
          dto.programId ?? question.programId,
          dto.levelId ?? question.levelId,
          dto.subjectId ?? question.subjectId,
        );
      }
    }

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
          stimulus: dto.stimulus === undefined ? undefined : dto.stimulus?.trim() || null,
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
        const keepIds = new Set<string>();
        // Pencocokan konten bersifat konsumtif — dua opsi dengan teks yang
        // sama (mis. beda kapital atau memang kembar) masing-masing dipasangkan
        // ke baris opsi berbeda, bukan menimpa satu baris yang sama.
        const keyPool = new Map<string, typeof existing>();
        for (const o of existing) {
          const k = `${o.content.trim().toLowerCase()}|${(o.imageUrl ?? '').trim()}`;
          const arr = keyPool.get(k) ?? [];
          arr.push(o);
          keyPool.set(k, arr);
        }

        for (const [idx, opt] of options.entries()) {
          const content = (opt.content ?? '').trim();
          const imageUrl = opt.imageUrl || null;
          const key = `${content.toLowerCase()}|${(imageUrl ?? '').trim()}`;
          const pool = keyPool.get(key);
          const match =
            (opt.id ? byId.get(opt.id) : undefined) ??
            (pool && pool.length ? pool.shift() : undefined);
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

  async delete(id: string, actor?: AuthenticatedUser) {
    const question = await this.prisma.question.findUnique({ where: { id } });
    if (!question) throw new NotFoundException('Soal tidak ditemukan.');
    if (actor) {
      const scope = await this.tutorScope.for(actor);
      if (scope && question.createdBy !== actor.id) {
        const ok =
          (question.programId && scope.programIds.includes(question.programId)) ||
          (question.levelId && scope.levelIds.includes(question.levelId)) ||
          (question.subjectId && scope.subjectIds.includes(question.subjectId));
        if (!ok) throw new ForbiddenException('Soal ini di luar kelompok yang Anda ampu.');
      }
    }

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
      // Soft-delete — soal hilang dari bank soal/pemilih, tapi ujian, latsol,
      // dan riwayat attempt yang sudah memakainya tetap utuh.
      await this.prisma.question.update({
        where: { id },
        data: { deletedAt: new Date(), isActive: false },
      });
      return { success: true, softDeleted: true };
    }

    await this.prisma.question.delete({ where: { id } });
    return { success: true, softDeleted: false };
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
    const where: Record<string, unknown> = { isActive: true, deletedAt: null };
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
