import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ContentCategoriesService } from '../content-categories/content-categories.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TutorScopeService } from '../../common/tutor-scope/tutor-scope.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { CreateExamDto, UpdateExamDto } from './dto/exam.dto';
import { PERMISSION_CODES } from '../rbac/permissions.constants';

/**
 * Fase 3c — Exam management dengan timing global server-side.
 * scheduled_start_at & scheduled_end_at GLOBAL untuk semua peserta.
 */
const TAXONOMY_INCLUDE = {
  program: { select: { id: true, name: true, code: true } },
  level: { select: { id: true, name: true, code: true } },
  subject: { select: { id: true, name: true, code: true } },
};

@Injectable()
export class ExamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tutorScope: TutorScopeService,
    private readonly contentCategories: ContentCategoriesService,
  ) {}

  async list(actor: AuthenticatedUser, query: { status?: string; programId?: string; levelId?: string; subjectId?: string; category?: string; all?: string } = {}) {
    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.programId) where.programId = query.programId;
    if (query.levelId) where.levelId = query.levelId;
    if (query.subjectId) where.subjectId = query.subjectId;
    if (query.category) where.category = query.category;

    // Tutor hanya melihat ujian program/jenjang kelompok yang dia ampu +
    // ujian yang dia buat sendiri. Mapel saja tidak cukup — ujian mapel
    // yang sama di jenjang lain bukan tanggung jawabnya.
    // `all=1` melewati scope ini — hanya untuk pengawas proctoring
    // (tutor bisa ditugasi mengawas ujian di luar kelompoknya).
    const scope = await this.tutorScope.for(actor);
    if (scope) {
      const asProctor =
        query.all === '1' &&
        actor.permissions.includes(PERMISSION_CODES.EXAM_PROCTOR_UNLOCK);
      if (!asProctor) {
        where.AND = [
          {
            OR: [
              { programId: { in: scope.programIds } },
              { levelId: { in: scope.levelIds } },
              { createdBy: actor.id },
            ],
          },
        ];
      }
    }
    // Siswa hanya melihat ujian jenjang/mapel/kelompok yang dia ikuti
    // (ujian tanpa taksonomi = umum, tetap terlihat).
    const sScope = await this.tutorScope.forStudent(actor);
    if (sScope) {
      where.AND = [
        ...((where.AND as unknown[]) ?? []),
        {
          OR: [
            { programId: { in: sScope.programIds } },
            { levelId: { in: sScope.levelIds } },
            { subjectId: { in: sScope.subjectIds } },
            { AND: [{ programId: null }, { levelId: null }, { subjectId: null }] },
          ],
        },
      ];
    }

    return this.prisma.exam.findMany({
      where,
      include: {
        ...TAXONOMY_INCLUDE,
        items: {
          include: {
            question: {
              select: { id: true, type: true, content: true, points: true },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
        _count: {
          select: { attempts: true },
        },
      },
      orderBy: { scheduledStartAt: 'desc' },
      take: 50,
    });
  }

  async get(id: string, actor?: AuthenticatedUser) {
    const exam = await this.prisma.exam.findUnique({
      where: { id },
      include: {
        ...TAXONOMY_INCLUDE,
        items: {
          include: {
            question: {
              select: {
                id: true,
                type: true,
                content: true,
                imageUrl: true,
                points: true,
                answerKey: true, // Admin/tutor can see answer key
                options: {
                  orderBy: { sortOrder: 'asc' },
                  select: {
                    id: true,
                    content: true,
                    sortOrder: true,
                    isCorrect: true, // Admin/tutor can see correct answers
                  },
                },
              },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
        _count: {
          select: { attempts: true },
        },
      },
    });
    if (!exam) throw new NotFoundException('Ujian tidak ditemukan.');
    if (actor) {
      const scope = await this.tutorScope.for(actor);
      if (scope)
        this.tutorScope.assertContentRef(scope, exam.programId, exam.levelId, exam.subjectId);
    }
    return exam;
  }

  /** Validasi referensi jenjang/mapel/program ujian bila diisi. */
  private async assertRefs(dto: { programId?: string; levelId?: string; subjectId?: string }) {
    if (dto.programId) {
      const p = await this.prisma.program.findUnique({ where: { id: dto.programId }, select: { id: true } });
      if (!p) throw new BadRequestException('Program tidak ditemukan.');
    }
    if (dto.levelId) {
      const l = await this.prisma.level.findUnique({ where: { id: dto.levelId }, select: { id: true } });
      if (!l) throw new BadRequestException('Level tidak ditemukan.');
    }
    if (dto.subjectId) {
      const s = await this.prisma.subject.findUnique({ where: { id: dto.subjectId }, select: { id: true } });
      if (!s) throw new BadRequestException('Mapel tidak ditemukan.');
    }
  }

  async create(actorId: string, dto: CreateExamDto) {
    // Validasi scheduledEndAt > scheduledStartAt
    const start = new Date(dto.scheduledStartAt);
    const end = new Date(dto.scheduledEndAt);
    if (end <= start) {
      throw new BadRequestException('Waktu selesai harus setelah waktu mulai.');
    }
    await this.assertRefs(dto);
    await this.contentCategories.assertUsable(dto.category);

    // Validasi questionIds
    if (!dto.questionIds.length) {
      throw new BadRequestException('Ujian minimal berisi 1 soal.');
    }

    const uniq = [...new Set(dto.questionIds)];
    const found = await this.prisma.question.findMany({
      where: { id: { in: uniq }, isActive: true },
      select: { id: true, points: true },
    });
    if (found.length !== uniq.length) {
      throw new BadRequestException('Salah satu soal tidak ditemukan atau nonaktif.');
    }

    // Calculate maxScore
    const pointsMap = new Map<string, number>();
    if (dto.points && dto.points.length === uniq.length) {
      uniq.forEach((qid, idx) => pointsMap.set(qid, dto.points![idx] || 1));
    } else {
      found.forEach((q) => pointsMap.set(q.id, q.points || 1));
    }
    const maxScore = Array.from(pointsMap.values()).reduce((sum, p) => sum + p, 0);

    return this.prisma.$transaction(async (tx) => {
      const exam = await tx.exam.create({
        data: {
          programId: dto.programId,
          levelId: dto.levelId,
          subjectId: dto.subjectId,
          category: dto.category,
          title: dto.title.trim(),
          description: dto.description?.trim(),
          scheduledStartAt: start,
          scheduledEndAt: end,
          status: 'DRAFT',
          maxScore,
          durationMinutes: dto.durationMinutes,
          proctoringEnabled: dto.proctoringEnabled ?? true,
          notes: dto.notes?.trim(),
          createdBy: actorId,
        },
      });

      // Create exam items
      await tx.examItem.createMany({
        data: uniq.map((questionId, idx) => ({
          examId: exam.id,
          questionId,
          sortOrder: idx,
          points: pointsMap.get(questionId) || 1,
        })),
        skipDuplicates: true,
      });

      return tx.exam.findUniqueOrThrow({
        where: { id: exam.id },
        include: {
          items: {
            include: {
              question: {
                select: { id: true, type: true, content: true, points: true },
              },
            },
            orderBy: { sortOrder: 'asc' },
          },
        },
      });
    });
  }

  /**
   * Publish ujian DRAFT → PUBLISHED. Wajib punya ≥1 soal dan jadwal belum
   * lewat — ujian yang sudah melewati scheduled_end_at percuma dipublish.
   */
  async publish(id: string, actor?: AuthenticatedUser) {
    const exam = await this.prisma.exam.findUnique({
      where: { id },
      include: { _count: { select: { items: true } } },
    });
    if (!exam) throw new NotFoundException('Ujian tidak ditemukan.');
    if (actor) {
      const scope = await this.tutorScope.for(actor);
      if (scope)
        this.tutorScope.assertContentRef(scope, exam.programId, exam.levelId, exam.subjectId);
    }
    if (exam.status !== 'DRAFT') {
      throw new BadRequestException('Hanya ujian berstatus Draft yang bisa dipublikasikan.');
    }
    if (exam._count.items === 0) {
      throw new BadRequestException('Ujian belum memiliki soal — tambahkan soal dulu.');
    }
    if (exam.scheduledEndAt <= new Date()) {
      throw new BadRequestException(
        'Waktu selesai ujian sudah lewat — atur ulang jadwal dulu.',
      );
    }
    return this.prisma.exam.update({
      where: { id },
      data: { status: 'PUBLISHED' },
      include: TAXONOMY_INCLUDE,
    });
  }

  async update(id: string, dto: UpdateExamDto) {
    const exam = await this.prisma.exam.findUnique({ where: { id } });
    if (!exam) throw new NotFoundException('Ujian tidak ditemukan.');

    // Validasi status transition
    if (dto.status === 'ENDED') {
      throw new BadRequestException(
        'Status Berakhir hanya via aksi "Akhiri Ujian" (auto-submit semua peserta).',
      );
    }
    if (dto.status === 'LOCKED' && exam.status !== 'PUBLISHED') {
      throw new BadRequestException('Hanya ujian PUBLISHED yang bisa di-LOCKED.');
    }
    if (
      (exam.status === 'LOCKED' || exam.status === 'ENDED') &&
      dto.status !== exam.status
    ) {
      throw new BadRequestException(
        'Ujian yang sudah LOCKED/ENDED tidak bisa diubah.',
      );
    }

    await this.assertRefs(dto);
    await this.contentCategories.assertUsable(dto.category);

    // Validasi timing jika berubah
    if (dto.scheduledStartAt || dto.scheduledEndAt) {
      const start = dto.scheduledStartAt ? new Date(dto.scheduledStartAt) : exam.scheduledStartAt;
      const end = dto.scheduledEndAt ? new Date(dto.scheduledEndAt) : exam.scheduledEndAt;
      if (end <= start) {
        throw new BadRequestException('Waktu selesai harus setelah waktu mulai.');
      }
    }

    // Validasi questionIds jika berubah
    if (dto.questionIds) {
      if (!dto.questionIds.length) {
        throw new BadRequestException('Ujian minimal berisi 1 soal.');
      }

      const uniq = [...new Set(dto.questionIds)];
      const found = await this.prisma.question.findMany({
        where: { id: { in: uniq }, isActive: true },
        select: { id: true, points: true },
      });
      if (found.length !== uniq.length) {
        throw new BadRequestException('Salah satu soal tidak ditemukan atau nonaktif.');
      }

      // Calculate new maxScore
      const pointsMap = new Map<string, number>();
      if (dto.points && dto.points.length === uniq.length) {
        uniq.forEach((qid, idx) => pointsMap.set(qid, dto.points![idx] || 1));
      } else {
        found.forEach((q) => pointsMap.set(q.id, q.points || 1));
      }
      const maxScore = Array.from(pointsMap.values()).reduce((sum, p) => sum + p, 0);

      return this.prisma.$transaction(async (tx) => {
        // Delete existing items
        await tx.examItem.deleteMany({ where: { examId: id } });

        // Create new items
        await tx.examItem.createMany({
          data: uniq.map((questionId, idx) => ({
            examId: id,
            questionId,
            sortOrder: idx,
            points: pointsMap.get(questionId) || 1,
          })),
        });

        // Update exam
        const updated = await tx.exam.update({
          where: { id },
          data: {
            programId: dto.programId,
            levelId: dto.levelId,
            subjectId: dto.subjectId,
            category: dto.category,
            title: dto.title?.trim(),
            description: dto.description?.trim(),
            scheduledStartAt: dto.scheduledStartAt ? new Date(dto.scheduledStartAt) : undefined,
            scheduledEndAt: dto.scheduledEndAt ? new Date(dto.scheduledEndAt) : undefined,
            status: dto.status,
            maxScore,
            durationMinutes: dto.durationMinutes,
            proctoringEnabled: dto.proctoringEnabled,
            notes: dto.notes?.trim(),
          },
          include: {
            items: {
              include: {
                question: {
                  select: { id: true, type: true, content: true, points: true },
                },
              },
              orderBy: { sortOrder: 'asc' },
            },
          },
        });

        return updated;
      });
    }

    // Update without changing questions
    return this.prisma.exam.update({
      where: { id },
      data: {
        programId: dto.programId,
        levelId: dto.levelId,
        subjectId: dto.subjectId,
        category: dto.category,
        title: dto.title?.trim(),
        description: dto.description?.trim(),
        scheduledStartAt: dto.scheduledStartAt ? new Date(dto.scheduledStartAt) : undefined,
        scheduledEndAt: dto.scheduledEndAt ? new Date(dto.scheduledEndAt) : undefined,
        status: dto.status,
        durationMinutes: dto.durationMinutes,
        proctoringEnabled: dto.proctoringEnabled,
        notes: dto.notes?.trim(),
      },
      include: {
        items: {
          include: {
            question: {
              select: { id: true, type: true, content: true, points: true },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
  }

  async delete(id: string) {
    const exam = await this.prisma.exam.findUnique({ where: { id } });
    if (!exam) throw new NotFoundException('Ujian tidak ditemukan.');

    if (exam.status !== 'DRAFT') {
      throw new BadRequestException('Hanya ujian berstatus Draft yang bisa dihapus.');
    }

    await this.prisma.exam.delete({ where: { id } });
    return { success: true };
  }

  /**
   * Get exam for student taking the exam (no answers shown).
   * Fase 3d anti-leak: pastikan tidak ada isCorrect di options.
   */
  async getForStudent(examId: string, actor?: AuthenticatedUser) {
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      include: {
        items: {
          include: {
            question: {
              select: {
                id: true,
                type: true,
                content: true,
                imageUrl: true,
                points: true,
                // Fase 3d anti-leak: jangan kirim answerKey ke student
                answerKey: false,
                options: {
                  orderBy: { sortOrder: 'asc' },
                  select: {
                    id: true,
                    content: true,
                    sortOrder: true,
                    // Fase 3d anti-leak: jangan kirim isCorrect ke student
                    isCorrect: false,
                  },
                },
              },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    if (!exam) throw new NotFoundException('Ujian tidak ditemukan.');
    if (exam.status !== 'PUBLISHED') {
      throw new BadRequestException('Ujian belum tersedia untuk dikerjakan.');
    }

    const now = new Date();
    if (now < exam.scheduledStartAt) {
      throw new BadRequestException('Ujian belum dimulai.');
    }
    if (now > exam.scheduledEndAt) {
      throw new BadRequestException('Ujian sudah selesai.');
    }
    // Siswa hanya boleh mengerjakan ujian jenjang/mapel/kelompoknya.
    if (actor) {
      const sScope = await this.tutorScope.forStudent(actor);
      if (sScope) {
        try {
          this.tutorScope.assertStudentRef(sScope, exam);
        } catch {
          throw new NotFoundException('Ujian tidak ditemukan.');
        }
      }
    }

    return exam;
  }

  /**
   * Get exam for pembahasan (tutor/admin) - includes answer key and explanation.
   * Fase 3e: Untuk halaman Pembahasan tutor.
   */
  async getForPembahasan(examId: string, actor?: AuthenticatedUser) {
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      include: {
        items: {
          include: {
            question: {
              select: {
                id: true,
                type: true,
                content: true,
                imageUrl: true,
                points: true,
                answerKey: true, // Kunci jawaban untuk pembahasan
                explanation: true, // Pembahasan/solusi
                explanationImageUrl: true, // Gambar pembahasan
                options: {
                  orderBy: { sortOrder: 'asc' },
                  select: {
                    id: true,
                    content: true,
                    sortOrder: true,
                    isCorrect: true, // Jawaban benar untuk pembahasan
                  },
                },
              },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    if (!exam) throw new NotFoundException('Ujian tidak ditemukan.');
    // Pembahasan tutor: hanya untuk ujian dalam scope ampunannya.
    if (actor) {
      const scope = await this.tutorScope.for(actor);
      if (scope)
        this.tutorScope.assertContentRef(scope, exam.programId, exam.levelId, exam.subjectId);
    }

    return exam;
  }

  /**
   * Daftar ujian aman untuk siswa (dipakai dropdown/list tanpa kunci).
   * Hanya PUBLISHED, tanpa answerKey/isCorrect/explanation.
   */
  async listAvailableForStudent(actor: AuthenticatedUser) {
    // Siswa hanya melihat ujian jenjang/mapel/kelompoknya + ujian umum.
    const sScope = await this.tutorScope.forStudent(actor);
    // Ujian ENDED tetap terlihat bila siswa punya attempt — supaya hasil
    // yang sudah dirilis masih bisa dibuka dari daftar.
    let studentId: string | undefined;
    if (sScope) {
      const s = await this.prisma.student.findUnique({
        where: { userId: actor.id },
        select: { id: true },
      });
      studentId = s?.id;
    }
    const where: Record<string, unknown> = {
      OR: [
        { status: 'PUBLISHED' },
        ...(studentId
          ? [{ status: 'ENDED', attempts: { some: { studentId } } }]
          : []),
      ],
    };
    if (sScope) {
      where.AND = [
        {
          OR: [
            { programId: { in: sScope.programIds } },
            { levelId: { in: sScope.levelIds } },
            { subjectId: { in: sScope.subjectIds } },
            { AND: [{ programId: null }, { levelId: null }, { subjectId: null }] },
          ],
        },
      ];
    }
    return this.prisma.exam.findMany({
      where,
      select: {
        id: true,
        category: true,
        level: { select: { id: true, name: true } },
        subject: { select: { id: true, name: true } },
        title: true,
        description: true,
        scheduledStartAt: true,
        scheduledEndAt: true,
        status: true,
        maxScore: true,
        durationMinutes: true,
        proctoringEnabled: true,
        items: {
          select: {
            id: true,
            questionId: true,
            sortOrder: true,
            points: true,
            question: {
              select: { id: true, type: true, points: true },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
        _count: { select: { attempts: true } },
      },
      orderBy: { scheduledStartAt: 'desc' },
      take: 50,
    });
  }
}
