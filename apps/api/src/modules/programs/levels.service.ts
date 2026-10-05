import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TutorScopeService } from '../../common/tutor-scope/tutor-scope.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { CreateLevelDto } from './dto/create-level.dto';
import { UpdateLevelDto } from './dto/update-level.dto';

const levelInclude = {
  program: {
    select: {
      id: true,
      name: true,
      code: true,
      category: true,
      registrationFee: true,
      subject: { select: { id: true, code: true, name: true } },
    },
  },
  gradeLevel: { select: { id: true, code: true, name: true, sortOrder: true } },
  subject: { select: { id: true, code: true, name: true } },
  levelSubjects: {
    include: { subject: { select: { id: true, code: true, name: true } } },
  },
  packages: { orderBy: { name: 'asc' as const } },
};

/** CRUD Level (anak dari Program, induk dari Package). */
@Injectable()
export class LevelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tutorScope: TutorScopeService,
  ) {}

  async list(actor: AuthenticatedUser, query: { programId?: string }) {
    const scope = await this.tutorScope.for(actor);
    const where: Record<string, unknown> = {};
    if (query.programId) where.programId = query.programId;
    // Tutor hanya melihat level dari program yang dia ampu.
    if (scope) {
      where.OR = [
        { programId: { in: scope.programIds } },
        { id: { in: scope.levelIds } },
      ];
    }
    return this.prisma.level.findMany({
      where,
      include: levelInclude,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      take: 200,
    });
  }

  async get(id: string) {
    const level = await this.prisma.level.findUnique({
      where: { id },
      include: levelInclude,
    });
    if (!level) throw new NotFoundException('Level tidak ditemukan.');
    return level;
  }

  async create(dto: CreateLevelDto) {
    const program = await this.prisma.program.findUnique({
      where: { id: dto.programId },
    });
    if (!program) throw new NotFoundException('Program tidak ditemukan.');

    // Bila memilih dari master level kelas, nama/kode/urutan diambil dari
    // master (name manual tetap boleh sebagai override).
    let name = dto.name?.trim();
    let code = dto.code;
    let sortOrder = dto.sortOrder;
    if (dto.gradeLevelId) {
      const gl = await this.prisma.gradeLevel.findUnique({
        where: { id: dto.gradeLevelId },
      });
      if (!gl) throw new BadRequestException('Level kelas tidak ditemukan.');
      name = name || gl.name;
      code = code ?? gl.code;
      sortOrder = sortOrder ?? gl.sortOrder;
    }
    if (!name || name.length < 2) {
      throw new BadRequestException(
        'Nama level wajib — pilih dari master level kelas atau isi manual.',
      );
    }
    if (dto.subjectId) {
      const subject = await this.prisma.subject.findUnique({
        where: { id: dto.subjectId },
      });
      if (!subject) throw new BadRequestException('Mapel tidak ditemukan.');
    }
    if (dto.subjectIds?.length) {
      const n = await this.prisma.subject.count({
        where: { id: { in: dto.subjectIds } },
      });
      if (n !== dto.subjectIds.length) {
        throw new BadRequestException('Salah satu mapel jenjang tidak ditemukan.');
      }
    }

    const clash = await this.prisma.level.findFirst({
      where: { programId: dto.programId, name },
    });
    if (clash) {
      throw new ConflictException('Nama level sudah ada di program ini.');
    }
    const { subjectIds, ...data } = dto;
    return this.prisma.level.create({
      data: {
        ...(data as Prisma.LevelUncheckedCreateInput),
        name,
        code,
        sortOrder,
        levelSubjects: subjectIds?.length
          ? { create: subjectIds.map((subjectId) => ({ subjectId })) }
          : undefined,
      },
      include: levelInclude,
    });
  }

  async update(id: string, dto: UpdateLevelDto) {
    const level = await this.get(id);
    if (dto.name && dto.name !== level.name) {
      const clash = await this.prisma.level.findFirst({
        where: { programId: level.programId, name: dto.name, id: { not: id } },
      });
      if (clash) {
        throw new ConflictException('Nama level sudah ada di program ini.');
      }
    }
    if (dto.gradeLevelId) {
      const gl = await this.prisma.gradeLevel.findUnique({
        where: { id: dto.gradeLevelId },
      });
      if (!gl) throw new BadRequestException('Level kelas tidak ditemukan.');
    }
    if (dto.subjectId) {
      const subject = await this.prisma.subject.findUnique({
        where: { id: dto.subjectId },
      });
      if (!subject) throw new BadRequestException('Mapel tidak ditemukan.');
    }
    if (dto.subjectIds?.length) {
      const n = await this.prisma.subject.count({
        where: { id: { in: dto.subjectIds } },
      });
      if (n !== dto.subjectIds.length) {
        throw new BadRequestException('Salah satu mapel jenjang tidak ditemukan.');
      }
    }
    const { subjectIds, ...rest } = dto;
    const data = { ...rest } as Record<string, unknown>;
    if (data.sessionPrices === null) data.sessionPrices = Prisma.DbNull;
    return this.prisma.$transaction(async (tx) => {
      // Sync mapel jenjang bila dikirim — set penuh menggantikan daftar lama.
      if (subjectIds !== undefined) {
        await tx.levelSubject.deleteMany({ where: { levelId: id } });
        if (subjectIds.length) {
          await tx.levelSubject.createMany({
            data: subjectIds.map((subjectId) => ({ levelId: id, subjectId })),
          });
        }
      }
      return tx.level.update({
        where: { id },
        data: data as Prisma.LevelUpdateInput,
        include: levelInclude,
      });
    });
  }

  /**
   * Set harga jenjang saja — untuk Admin Finance (`price.manage`) tanpa
   * memberi akses ke struktur program/level. Field tidak dikirim = tak diubah.
   */
  async setPricing(id: string, dto: UpdateLevelDto) {
    await this.get(id);
    const pricingKeys = [
      'price',
      'priceUnit',
      'fullPayPrice',
      'installment2x',
      'monthlyAmount',
      'monthlyCount',
      'promoPrice',
      'sessionPrices',
      'sessionDurationMin',
    ] as const;
    const data: Record<string, unknown> = {};
    for (const k of pricingKeys) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    if (!Object.keys(data).length) {
      throw new BadRequestException('Tidak ada field harga yang dikirim.');
    }
    // Prisma: menghapus nilai kolom JSON = Prisma.DbNull (bukan null biasa).
    if (data.sessionPrices === null) data.sessionPrices = Prisma.DbNull;
    return this.prisma.level.update({
      where: { id },
      data: data as Prisma.LevelUpdateInput,
      include: levelInclude,
    });
  }
}
