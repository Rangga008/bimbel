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

/** Include subtes (urut) + kelompok target — dipakai semua endpoint baca ujian. */
const SUBTES_GROUPS_INCLUDE = {
  subtes: {
    orderBy: { sortOrder: 'asc' as const },
    include: { subject: { select: { id: true, name: true } } },
  },
  groups: {
    include: { group: { select: { id: true, name: true, code: true } } },
  },
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
        ...SUBTES_GROUPS_INCLUDE,
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
        ...SUBTES_GROUPS_INCLUDE,
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

  /**
   * Normalisasi item soal — `items` (ber-subtes) menang bila dikirim,
   * fallback ke questionIds+points lama. Mengembalikan daftar
   * {questionId, points, subtesIdx} tervalidasi + total maxScore.
   */
  private async prepareItems(dto: {
    questionIds?: string[];
    items?: { questionId: string; points?: number; subtesIdx?: number | null }[];
    points?: number[];
  }) {
    const effective: { questionId: string; points?: number; subtesIdx?: number | null }[] =
      dto.items && dto.items.length
        ? dto.items
        : (dto.questionIds ?? []).map((questionId, i) => ({
            questionId,
            points: dto.points?.[i],
            subtesIdx: null,
          }));
    if (!effective.length) {
      throw new BadRequestException('Ujian minimal berisi 1 soal.');
    }
    const qids = [...new Set(effective.map((i) => i.questionId))];
    const found = await this.prisma.question.findMany({
      where: { id: { in: qids }, isActive: true },
      select: { id: true, points: true },
    });
    if (found.length !== qids.length) {
      throw new BadRequestException('Salah satu soal tidak ditemukan atau nonaktif.');
    }
    const qPoints = new Map(found.map((q) => [q.id, q.points || 1]));
    const items = effective.map((it, idx) => ({
      questionId: it.questionId,
      sortOrder: idx,
      points: it.points ?? qPoints.get(it.questionId) ?? 1,
      subtesIdx: it.subtesIdx ?? null,
    }));
    const maxScore = items.reduce((s, i) => s + i.points, 0);
    return { items, maxScore };
  }

  /**
   * Tulis ulang subtes + item + kelompok ujian dalam satu transaksi.
   * `subtesIdx` pada item dipetakan ke id subtes yang baru dibuat.
   * Bagian yang tidak dikirim dibiarkan utuh (null = jangan sentuh).
   */
  private async replaceStructure(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    examId: string,
    dto: {
      items?: { questionId: string; sortOrder: number; points: number; subtesIdx: number | null }[];
      subtes?: { name: string; subjectId?: string; sortOrder?: number; durationMinutes: number }[];
      groupIds?: string[];
      maxScore?: number;
    },
  ) {
    if (dto.subtes) {
      // Item lama menunjuk subtes lama — subtes dihapus (SetNull) lalu dibuat ulang.
      await tx.examSubtes.deleteMany({ where: { examId } });
      for (const [idx, s] of dto.subtes.entries()) {
        await tx.examSubtes.create({
          data: {
            examId,
            name: s.name.trim(),
            subjectId: s.subjectId || null,
            sortOrder: s.sortOrder ?? idx,
            durationMinutes: s.durationMinutes,
          },
        });
      }
    }
    const subtesRows = await tx.examSubtes.findMany({
      where: { examId },
      orderBy: { sortOrder: 'asc' },
      select: { id: true },
    });
    if (dto.items) {
      await tx.examItem.deleteMany({ where: { examId } });
      await tx.examItem.createMany({
        data: dto.items.map((it) => ({
          examId,
          questionId: it.questionId,
          sortOrder: it.sortOrder,
          points: it.points,
          subtesId:
            it.subtesIdx !== null && it.subtesIdx !== undefined
              ? subtesRows[it.subtesIdx]?.id ?? null
              : null,
        })),
      });
      if (dto.maxScore !== undefined) {
        await tx.exam.update({ where: { id: examId }, data: { maxScore: dto.maxScore } });
      }
    }
    if (dto.groupIds) {
      await tx.examGroup.deleteMany({ where: { examId } });
      if (dto.groupIds.length) {
        await tx.examGroup.createMany({
          data: dto.groupIds.map((groupId) => ({ examId, groupId })),
          skipDuplicates: true,
        });
      }
    }
  }

  /** Kode akses ujian 6 karakter (tanpa O/0/I/1) — dipakai peserta luar. */
  private async newAccessCode(tx?: {
    exam: { findUnique: (a: { where: { accessCode: string } }) => Promise<unknown> };
  }) {
    const db = tx ?? this.prisma;
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let attempt = 0; attempt < 20; attempt += 1) {
      let code = '';
      for (let i = 0; i < 6; i += 1) code += chars[Math.floor(Math.random() * chars.length)];
      const clash = await db.exam.findUnique({ where: { accessCode: code } });
      if (!clash) return code;
    }
    throw new BadRequestException('Gagal membuat kode akses — coba lagi.');
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

  async create(actor: AuthenticatedUser, dto: CreateExamDto) {
    // Validasi scheduledEndAt > scheduledStartAt
    const start = new Date(dto.scheduledStartAt);
    const end = new Date(dto.scheduledEndAt);
    if (end <= start) {
      throw new BadRequestException('Waktu selesai harus setelah waktu mulai.');
    }
    await this.assertRefs(dto);
    await this.contentCategories.assertUsable(dto.category);
    // Tutor hanya boleh membuat ujian dalam program/jenjang/mapel yang dia ampu.
    const scope = await this.tutorScope.for(actor);
    if (scope) {
      this.tutorScope.assertContentRef(scope, dto.programId, dto.levelId, dto.subjectId);
    }

    const { items, maxScore } = await this.prepareItems(dto);

    return this.prisma.$transaction(async (tx) => {
      const exam = await tx.exam.create({
        data: {
          accessCode: await this.newAccessCode(tx),
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
          showResultImmediately: dto.showResultImmediately ?? false,
          notes: dto.notes?.trim(),
          createdBy: actor.id,
        },
      });

      await this.replaceStructure(tx, exam.id, {
        items,
        subtes: dto.subtes,
        groupIds: dto.groupIds,
      });

      return tx.exam.findUniqueOrThrow({
        where: { id: exam.id },
        include: {
          ...SUBTES_GROUPS_INCLUDE,
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
    // Ujian LOCKED/ENDED tetap bisa diedit kontennya (judul, jadwal, soal)
    // — yang dilarang hanya transisi status keluar dari LOCKED/ENDED.
    if (
      (exam.status === 'LOCKED' || exam.status === 'ENDED') &&
      dto.status &&
      dto.status !== exam.status
    ) {
      throw new BadRequestException(
        'Ujian yang sudah LOCKED/ENDED tidak bisa diubah statusnya.',
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

    // Item/subtes/kelompok diubah → tulis ulang struktur dalam transaksi.
    const structureChanged = !!(dto.questionIds || dto.items || dto.subtes || dto.groupIds);
    if (structureChanged) {
      const prep =
        dto.questionIds || dto.items
          ? await this.prepareItems(dto)
          : { items: undefined, maxScore: undefined };

      return this.prisma.$transaction(async (tx) => {
        await this.replaceStructure(tx, id, {
          items: prep.items,
          subtes: dto.subtes,
          groupIds: dto.groupIds,
          maxScore: prep.maxScore,
        });

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
            durationMinutes: dto.durationMinutes,
            proctoringEnabled: dto.proctoringEnabled,
            showResultImmediately: dto.showResultImmediately,
            notes: dto.notes?.trim(),
          },
          include: {
            ...SUBTES_GROUPS_INCLUDE,
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

    // Update tanpa mengubah struktur soal/subtes/kelompok
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
        showResultImmediately: dto.showResultImmediately,
        notes: dto.notes?.trim(),
      },
      include: {
        ...SUBTES_GROUPS_INCLUDE,
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
        ...SUBTES_GROUPS_INCLUDE,
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
    // Siswa hanya boleh mengerjakan ujian jenjang/mapel/kelompoknya —
    // kecuali dia membuka akses lewat kode ujian (ExamParticipant).
    if (actor) {
      const sScope = await this.tutorScope.forStudent(actor);
      if (sScope) {
        const student = await this.prisma.student.findUnique({
          where: { userId: actor.id },
          select: { id: true },
        });
        const isParticipant = student
          ? await this.prisma.examParticipant.findUnique({
              where: { examId_studentId: { examId: exam.id, studentId: student.id } },
            })
          : null;
        if (!isParticipant) {
          // Ujian yang ditargetkan ke kelompok tertentu hanya untuk anggotanya.
          if (
            exam.groups.length > 0 &&
            !exam.groups.some((g) => sScope.groupIds.includes(g.groupId))
          ) {
            throw new NotFoundException('Ujian tidak ditemukan.');
          }
          try {
            this.tutorScope.assertStudentRef(sScope, exam);
          } catch {
            throw new NotFoundException('Ujian tidak ditemukan.');
          }
        }
      }
    }

    return exam;
  }

  /**
   * Tukar kode akses ujian menjadi hak ikut (ExamParticipant) — dipakai
   * siswa luar/mandiri: daftar akun → masukkan kode → kerjakan ujian.
   * Mengembalikan ringkasan ujian supaya UI bisa langsung membukanya.
   */
  async redeemAccessCode(actor: AuthenticatedUser, rawCode: string) {
    const student = await this.prisma.student.findUnique({
      where: { userId: actor.id },
      select: { id: true },
    });
    if (!student) throw new NotFoundException('Profil siswa tidak ditemukan.');
    const code = rawCode.trim().toUpperCase();
    if (!code) throw new BadRequestException('Kode ujian wajib diisi.');
    const exam = await this.prisma.exam.findUnique({
      where: { accessCode: code },
      select: {
        id: true,
        title: true,
        status: true,
        scheduledStartAt: true,
        scheduledEndAt: true,
      },
    });
    if (!exam) throw new NotFoundException('Kode ujian tidak dikenali.');
    if (exam.status === 'DRAFT') {
      throw new BadRequestException('Ujian belum dipublikasikan.');
    }
    await this.prisma.examParticipant.upsert({
      where: { examId_studentId: { examId: exam.id, studentId: student.id } },
      create: { examId: exam.id, studentId: student.id },
      update: {},
    });
    return { exam, joined: true };
  }

  /** Buat ulang kode akses ujian (admin/tutor pengelola ujian). */
  async regenerateAccessCode(id: string, actor?: AuthenticatedUser) {
    const exam = await this.prisma.exam.findUnique({ where: { id } });
    if (!exam) throw new NotFoundException('Ujian tidak ditemukan.');
    if (actor) {
      const scope = await this.tutorScope.for(actor);
      if (scope)
        this.tutorScope.assertContentRef(scope, exam.programId, exam.levelId, exam.subjectId);
    }
    const accessCode = await this.newAccessCode();
    return this.prisma.exam.update({
      where: { id },
      data: { accessCode },
      include: { ...SUBTES_GROUPS_INCLUDE, ...TAXONOMY_INCLUDE },
    });
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
    const statusOr: Record<string, unknown>[] = [
      { status: 'PUBLISHED' },
      ...(studentId
        ? [{ status: 'ENDED', attempts: { some: { studentId } } }]
        : []),
    ];
    // Ujian yang dibuka via kode akses mem-bypass seluruh scope
    // jenjang/mapel/kelompok — itulah jalur peserta luar.
    const where: Record<string, unknown> = {
      OR: [
        { OR: statusOr },
        ...(studentId
          ? [{ AND: [{ OR: statusOr }, { participants: { some: { studentId } } }] }]
          : []),
      ],
    };
    if (sScope) {
      const scopeAnd = [
        {
          OR: [
            { programId: { in: sScope.programIds } },
            { levelId: { in: sScope.levelIds } },
            { subjectId: { in: sScope.subjectIds } },
            { AND: [{ programId: null }, { levelId: null }, { subjectId: null }] },
          ],
        },
        // Ujian bertarget kelompok hanya tampil untuk anggota kelompok tsb;
        // tanpa target = terbuka sesuai scope taksonomi.
        {
          OR: [
            { groups: { none: {} } },
            { groups: { some: { groupId: { in: sScope.groupIds } } } },
          ],
        },
      ];
      // Gabungkan scope ke cabang pertama (status umum); cabang
      // participant sengaja tanpa scope.
      (where.OR as Record<string, unknown>[])[0] = {
        AND: [{ OR: statusOr }, ...scopeAnd],
      };
    } else {
      (where.OR as Record<string, unknown>[])[0] = { OR: statusOr };
    }
    return this.prisma.exam.findMany({
      where,
      select: {
        id: true,
        category: true,
        level: { select: { id: true, name: true } },
        subject: { select: { id: true, name: true } },
        showResultImmediately: true,
        groups: {
          select: { groupId: true, group: { select: { id: true, name: true } } },
        },
        subtes: {
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            name: true,
            sortOrder: true,
            durationMinutes: true,
            subject: { select: { id: true, name: true } },
          },
        },
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
