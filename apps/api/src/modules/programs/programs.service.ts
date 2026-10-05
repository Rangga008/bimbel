import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TutorScopeService } from '../../common/tutor-scope/tutor-scope.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { CreateProgramDto } from './dto/create-program.dto';
import { UpdateProgramDto } from './dto/update-program.dto';

const programListInclude = {
  _count: { select: { levels: true } },
  subject: { select: { id: true, code: true, name: true } },
  levels: {
    orderBy: [{ sortOrder: 'asc' as const }, { name: 'asc' as const }],
    include: {
      _count: { select: { packages: true } },
      gradeLevel: { select: { id: true, code: true, name: true } },
      subject: { select: { id: true, code: true, name: true } },
      levelSubjects: {
        include: { subject: { select: { id: true, code: true, name: true } } },
      },
    },
  },
};

/** CRUD Program (induk dari Level -> Package). */
@Injectable()
export class ProgramsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tutorScope: TutorScopeService,
  ) {}

  async list(
    actor: AuthenticatedUser,
    query: { search?: string; isActive?: string },
  ) {
    const where: Record<string, unknown> = {};
    if (query.isActive === 'true') where.isActive = true;
    if (query.isActive === 'false') where.isActive = false;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { code: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    // Tutor hanya melihat program yang dia ampu.
    const scope = await this.tutorScope.for(actor);
    if (scope) where.id = { in: scope.programIds };
    return this.prisma.program.findMany({
      where,
      include: programListInclude,
      orderBy: { name: 'asc' },
      take: 100,
    });
  }

  async options(actor?: AuthenticatedUser) {
    const scope = actor ? await this.tutorScope.for(actor) : null;
    return this.prisma.program.findMany({
      where: {
        isActive: true,
        ...(scope ? { id: { in: scope.programIds } } : {}),
      },
      select: {
        id: true,
        name: true,
        code: true,
        category: true,
        levels: {
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            price: true,
            priceUnit: true,
            fullPayPrice: true,
            installment2x: true,
            monthlyAmount: true,
            monthlyCount: true,
            promoPrice: true,
            sessionPrices: true,
            sessionDurationMin: true,
            registrationFee: true,
            gradeLevel: { select: { id: true, code: true, name: true } },
            levelSubjects: {
              select: {
                subject: { select: { id: true, name: true } },
              },
            },
            packages: {
              where: { isActive: true },
              select: { id: true, name: true, totalSessions: true },
              orderBy: { name: 'asc' },
            },
          },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Katalog publik internal (halaman "Program" Orang Tua): program/level/paket
   * aktif lengkap dengan harga & jumlah sesi. Cukup JWT — semua akun dibuat
   * oleh admin sehingga tidak ada akses anonim.
   */
  catalog() {
    return this.prisma.program.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        code: true,
        description: true,
        category: true,
        registrationFee: true,
        levels: {
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            price: true,
            priceUnit: true,
            fullPayPrice: true,
            installment2x: true,
            monthlyAmount: true,
            monthlyCount: true,
            promoPrice: true,
            sessionPrices: true,
            sessionDurationMin: true,
            registrationFee: true,
            gradeLevel: { select: { id: true, code: true, name: true } },
            levelSubjects: {
              select: {
                subject: { select: { id: true, code: true, name: true } },
              },
            },
            packages: {
              where: { isActive: true },
              select: {
                id: true,
                name: true,
                totalSessions: true,
                durationWeeks: true,
                price: true,
                description: true,
              },
              orderBy: { name: 'asc' },
            },
          },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async get(id: string) {
    const program = await this.prisma.program.findUnique({
      where: { id },
      include: {
        subject: { select: { id: true, code: true, name: true } },
        levels: {
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          include: {
            packages: { orderBy: { name: 'asc' } },
            gradeLevel: { select: { id: true, code: true, name: true } },
            subject: { select: { id: true, code: true, name: true } },
            levelSubjects: {
              include: {
                subject: { select: { id: true, code: true, name: true } },
              },
            },
          },
        },
      },
    });
    if (!program) throw new NotFoundException('Program tidak ditemukan.');
    return program;
  }

  /**
   * Hapus program. Level & paket di bawahnya ikut terhapus (FK cascade).
   * Ditolak bila masih ada kelompok yang merujuk (FK Restrict) — sarankan
   * nonaktifkan program supaya riwayat kelompok/sesi/absensi tetap utuh.
   * Materi, soal, dan paket latsol otomatis lepas referensi (SetNull).
   */
  async remove(id: string) {
    const program = await this.prisma.program.findUnique({
      where: { id },
      include: { _count: { select: { groups: true, levels: true } } },
    });
    if (!program) throw new NotFoundException('Program tidak ditemukan.');
    if (program._count.groups > 0) {
      throw new BadRequestException(
        `Program ini masih dipakai ${program._count.groups} kelompok — nonaktifkan saja agar riwayat kelompok, sesi, dan absensi tetap utuh.`,
      );
    }
    await this.prisma.program.delete({ where: { id } });
    return { deleted: true, name: program.name, removedLevels: program._count.levels };
  }

  private async assertSubject(subjectId?: string | null) {
    if (!subjectId) return;
    const found = await this.prisma.subject.findUnique({
      where: { id: subjectId },
    });
    if (!found) throw new BadRequestException('Mapel tidak ditemukan.');
  }

  async create(dto: CreateProgramDto) {
    const clash = await this.prisma.program.findUnique({
      where: { code: dto.code },
    });
    if (clash) throw new ConflictException('Kode program sudah dipakai.');
    await this.assertSubject(dto.subjectId);
    return this.prisma.program.create({ data: dto });
  }

  async update(id: string, dto: UpdateProgramDto) {
    await this.get(id);
    if (dto.code) {
      const clash = await this.prisma.program.findFirst({
        where: { code: dto.code, id: { not: id } },
      });
      if (clash) throw new ConflictException('Kode program sudah dipakai.');
    }
    if (dto.subjectId) await this.assertSubject(dto.subjectId);
    return this.prisma.program.update({ where: { id }, data: dto });
  }
}
