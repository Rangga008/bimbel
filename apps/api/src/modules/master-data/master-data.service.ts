// Master data kurikulum: Mapel (subjects) & Level Kelas (grade_levels).
// Dipakai sebagai dropdown saat membuat Program/Level/Kelompok supaya data
// sinkron — bukan teks bebas yang bisa typo.
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface MasterRowInput {
  code?: string;
  name?: string;
  sortOrder?: number;
  isActive?: boolean;
}

@Injectable()
export class MasterDataService {
  constructor(private readonly prisma: PrismaService) {}

  listSubjects(includeInactive = false) {
    return this.prisma.subject.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  listGradeLevels(includeInactive = false) {
    return this.prisma.gradeLevel.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async createSubject(dto: MasterRowInput) {
    this.assertCodeName(dto);
    return this.prisma.subject.create({
      data: {
        code: dto.code!.trim().toUpperCase(),
        name: dto.name!.trim(),
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateSubject(id: string, dto: MasterRowInput) {
    await this.assertExists('subject', id);
    return this.prisma.subject.update({
      where: { id },
      data: {
        ...(dto.code !== undefined
          ? { code: dto.code.trim().toUpperCase() }
          : {}),
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async createGradeLevel(dto: MasterRowInput) {
    this.assertCodeName(dto);
    return this.prisma.gradeLevel.create({
      data: {
        code: dto.code!.trim().toUpperCase(),
        name: dto.name!.trim(),
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateGradeLevel(id: string, dto: MasterRowInput) {
    await this.assertExists('gradeLevel', id);
    return this.prisma.gradeLevel.update({
      where: { id },
      data: {
        ...(dto.code !== undefined
          ? { code: dto.code.trim().toUpperCase() }
          : {}),
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  private assertCodeName(dto: MasterRowInput) {
    if (!dto.code?.trim() || !dto.name?.trim()) {
      throw new BadRequestException('Kolom code dan name wajib diisi.');
    }
  }

  private async assertExists(kind: 'subject' | 'gradeLevel', id: string) {
    const found =
      kind === 'subject'
        ? await this.prisma.subject.findUnique({ where: { id } })
        : await this.prisma.gradeLevel.findUnique({ where: { id } });
    if (!found) {
      throw new NotFoundException(
        kind === 'subject' ? 'Mapel tidak ditemukan.' : 'Level tidak ditemukan.',
      );
    }
  }
}
