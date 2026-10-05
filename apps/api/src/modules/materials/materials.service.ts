import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ContentCategoriesService } from '../content-categories/content-categories.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TutorScopeService } from '../../common/tutor-scope/tutor-scope.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { CreateMaterialDto, UpdateMaterialDto } from './dto/material.dto';

/**
 * Fase 3a — Materials management.
 * Upload/kelola materi per Program/Level/Kelompok.
 */
@Injectable()
export class MaterialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tutorScope: TutorScopeService,
    private readonly contentCategories: ContentCategoriesService,
  ) {}

  async list(
    actor: AuthenticatedUser,
    query: { programId?: string; levelId?: string; groupId?: string; subjectId?: string; category?: string; search?: string },
  ) {
    const where: Record<string, unknown> = {};
    if (query.programId) where.programId = query.programId;
    if (query.levelId) where.levelId = query.levelId;
    if (query.groupId) where.groupId = query.groupId;
    if (query.subjectId) where.subjectId = query.subjectId;
    if (query.category) where.category = query.category;
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    // Tutor hanya melihat materi program/level/kelompok yang dia ampu,
    // plus materi se-mapel (tutor lintas level tetap saling lihat).
    const scope = await this.tutorScope.for(actor);
    if (scope) {
      const base = this.tutorScope.contentWhere(scope);
      where.AND = [{ OR: [...base.OR, { subjectId: { in: scope.subjectIds } }] }];
    }
    // Siswa hanya melihat materi jenjang/mapel/kelompok yang dia ikuti.
    const sScope = await this.tutorScope.forStudent(actor);
    if (sScope) {
      where.AND = [...((where.AND as unknown[]) ?? []), this.tutorScope.studentContentWhere(sScope)];
    }
    return this.prisma.material.findMany({
      where,
      include: {
        program: { select: { id: true, name: true, code: true } },
        level: { select: { id: true, name: true, code: true } },
        group: { select: { id: true, name: true, code: true } },
        subject: { select: { id: true, name: true, code: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async get(id: string, actor?: AuthenticatedUser) {
    const material = await this.prisma.material.findUnique({
      where: { id },
      include: {
        program: { select: { id: true, name: true, code: true } },
        level: { select: { id: true, name: true, code: true } },
        group: { select: { id: true, name: true, code: true } },
        subject: { select: { id: true, name: true, code: true } },
      },
    });
    if (!material) throw new NotFoundException('Materi tidak ditemukan.');
    if (actor) {
      const scope = await this.tutorScope.for(actor);
      if (scope) {
        const ok =
          (material.programId && scope.programIds.includes(material.programId)) ||
          (material.levelId && scope.levelIds.includes(material.levelId)) ||
          (material.groupId && scope.groupIds.includes(material.groupId)) ||
          (material.subjectId && scope.subjectIds.includes(material.subjectId));
        if (!ok) throw new NotFoundException('Materi tidak ditemukan.');
      }
      const sScope = await this.tutorScope.forStudent(actor);
      if (sScope) {
        try {
          this.tutorScope.assertStudentRef(sScope, material);
        } catch {
          throw new NotFoundException('Materi tidak ditemukan.');
        }
      }
    }
    return material;
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

  async create(dto: CreateMaterialDto) {
    // Validasi: minimal salah satu dari programId, levelId, groupId, atau subjectId
    if (!dto.programId && !dto.levelId && !dto.groupId && !dto.subjectId) {
      throw new BadRequestException('Minimal salah satu dari program, level, kelompok, atau mapel harus diisi.');
    }

    // Validasi foreign keys jika ada
    if (dto.programId) {
      const program = await this.prisma.program.findUnique({ where: { id: dto.programId } });
      if (!program) throw new BadRequestException('Program tidak ditemukan.');
    }
    if (dto.levelId) {
      const level = await this.prisma.level.findUnique({ where: { id: dto.levelId } });
      if (!level) throw new BadRequestException('Level tidak ditemukan.');
    }
    if (dto.groupId) {
      const group = await this.prisma.learningGroup.findUnique({ where: { id: dto.groupId } });
      if (!group) throw new BadRequestException('Kelompok tidak ditemukan.');
    }

    const subjectId = await this.resolveSubjectId(dto.subjectId, dto.levelId, dto.programId);
    await this.contentCategories.assertUsable(dto.category);

    return this.prisma.material.create({
      data: {
        programId: dto.programId,
        levelId: dto.levelId,
        groupId: dto.groupId,
        subjectId,
        category: dto.category,
        title: dto.title.trim(),
        description: dto.description?.trim(),
        content: dto.content?.trim() || null,
        imageUrl: dto.imageUrl || null,
        fileUrl: dto.fileUrl,
        fileType: dto.fileType,
        fileSize: dto.fileSize,
      },
      include: {
        program: { select: { id: true, name: true, code: true } },
        level: { select: { id: true, name: true, code: true } },
        group: { select: { id: true, name: true, code: true } },
        subject: { select: { id: true, name: true, code: true } },
      },
    });
  }

  async update(id: string, dto: UpdateMaterialDto) {
    const material = await this.prisma.material.findUnique({ where: { id } });
    if (!material) throw new NotFoundException('Materi tidak ditemukan.');

    // Validasi foreign keys jika berubah
    if (dto.programId && dto.programId !== material.programId) {
      const program = await this.prisma.program.findUnique({ where: { id: dto.programId } });
      if (!program) throw new BadRequestException('Program tidak ditemukan.');
    }
    if (dto.levelId && dto.levelId !== material.levelId) {
      const level = await this.prisma.level.findUnique({ where: { id: dto.levelId } });
      if (!level) throw new BadRequestException('Level tidak ditemukan.');
    }
    if (dto.groupId && dto.groupId !== material.groupId) {
      const group = await this.prisma.learningGroup.findUnique({ where: { id: dto.groupId } });
      if (!group) throw new BadRequestException('Kelompok tidak ditemukan.');
    }

    // subjectId eksplisit → validasi; kalau tidak dikirim tapi level/program
    // berubah → derive ulang agar tetap sinkron.
    const subjectId =
      dto.subjectId !== undefined
        ? await this.resolveSubjectId(dto.subjectId || undefined)
        : dto.levelId !== undefined || dto.programId !== undefined
          ? await this.resolveSubjectId(
              undefined,
              dto.levelId !== undefined ? (dto.levelId || undefined) : (material.levelId ?? undefined),
              dto.programId !== undefined ? (dto.programId || undefined) : (material.programId ?? undefined),
            )
          : undefined;

    await this.contentCategories.assertUsable(dto.category);

    return this.prisma.material.update({
      where: { id },
      data: {
        programId: dto.programId,
        levelId: dto.levelId,
        groupId: dto.groupId,
        ...(subjectId !== undefined ? { subjectId } : {}),
        category: dto.category,
        title: dto.title?.trim(),
        description: dto.description?.trim(),
        content: dto.content?.trim() || null,
        imageUrl: dto.imageUrl || null,
        fileUrl: dto.fileUrl,
        fileType: dto.fileType,
        fileSize: dto.fileSize,
        isActive: dto.isActive,
      },
      include: {
        program: { select: { id: true, name: true, code: true } },
        level: { select: { id: true, name: true, code: true } },
        group: { select: { id: true, name: true, code: true } },
        subject: { select: { id: true, name: true, code: true } },
      },
    });
  }

  async delete(id: string) {
    const material = await this.prisma.material.findUnique({ where: { id } });
    if (!material) throw new NotFoundException('Materi tidak ditemukan.');

    await this.prisma.material.delete({ where: { id } });
    return { success: true };
  }
}