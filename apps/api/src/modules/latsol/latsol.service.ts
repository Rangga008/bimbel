import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TutorScopeService } from '../../common/tutor-scope/tutor-scope.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import {
  CreateLatsolPackageDto,
  UpdateLatsolPackageDto,
} from './dto/latsol.dto';

const LIST_INCLUDE = {
  program: { select: { id: true, name: true, code: true } },
  level: { select: { id: true, name: true, code: true } },
  subject: { select: { id: true, name: true, code: true } },
  _count: { select: { items: true, attempts: true } },
} as const;

const DETAIL_INCLUDE = {
  program: { select: { id: true, name: true, code: true } },
  level: { select: { id: true, name: true, code: true } },
  subject: { select: { id: true, name: true, code: true } },
  items: {
    orderBy: { sortOrder: 'asc' as const },
    include: {
      question: {
        include: {
          program: { select: { id: true, name: true, code: true } },
          level: { select: { id: true, name: true, code: true } },
          options: { orderBy: { sortOrder: 'asc' as const } },
        },
      },
    },
  },
} as const;

/** Fase 3b — CRUD paket latsol (dipilih dari bank soal 3a). */
@Injectable()
export class LatsolService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tutorScope: TutorScopeService,
  ) {}

  detailInclude() {
    return DETAIL_INCLUDE;
  }

  async listPackages(
    actor: AuthenticatedUser,
    q: {
      programId?: string;
      levelId?: string;
      subjectId?: string;
      category?: string;
      search?: string;
      includeInactive?: boolean;
    },
  ) {
    const where: Record<string, unknown> = {};
    if (q.programId) where.programId = q.programId;
    if (q.levelId) where.levelId = q.levelId;
    if (q.subjectId) where.subjectId = q.subjectId;
    if (q.category) where.category = q.category;
    if (!q.includeInactive) where.isActive = true;
    if (q.search) {
      where.OR = [
        { title: { contains: q.search, mode: 'insensitive' } },
        { description: { contains: q.search, mode: 'insensitive' } },
      ];
    }
    // Tutor hanya melihat paket program/level/mapel yang dia ampu
    // (se-mapel lintas level tetap terlihat) + paket yang dia buat.
    const scope = await this.tutorScope.for(actor);
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
    // Siswa hanya melihat paket jenjang/mapel/kelompok yang dia ikuti.
    // LatsolPackage tidak punya kolom groupId — filter kelompok dilewati.
    const sScope = await this.tutorScope.forStudent(actor);
    if (sScope) {
      where.AND = [
        ...((where.AND as unknown[]) ?? []),
        this.tutorScope.studentContentWhere(sScope, { group: false }),
      ];
    }
    return this.prisma.latsolPackage.findMany({
      where,
      include: LIST_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async getPackage(id: string, actor?: AuthenticatedUser) {
    const pkg = await this.prisma.latsolPackage.findUnique({
      where: { id },
      include: DETAIL_INCLUDE,
    });
    if (!pkg) throw new NotFoundException('Paket latsol tidak ditemukan.');
    if (actor) {
      const scope = await this.tutorScope.for(actor);
      if (scope)
        this.tutorScope.assertContentRef(scope, pkg.programId, pkg.levelId, pkg.subjectId);
    }
    return pkg;
  }

  async getPackageForStudent(id: string, actor?: AuthenticatedUser) {
    const pkg = await this.prisma.latsolPackage.findUnique({
      where: { id },
      include: {
        program: { select: { id: true, name: true, code: true } },
        level: { select: { id: true, name: true, code: true } },
        items: {
          orderBy: { sortOrder: 'asc' },
          include: {
            question: {
              // Anti-leak: select eksplisit — TANPA answerKey/explanation, dan opsi TANPA isCorrect.
              // Jangan ganti ke `include` polos di sini karena Prisma include tanpa select akan
              // mengembalikan seluruh kolom Question (termasuk kunci & solusi) ke siswa.
              select: {
                id: true,
                type: true,
                content: true,
                imageUrl: true,
                points: true,
                options: {
                  orderBy: { sortOrder: 'asc' },
                  select: { id: true, content: true, imageUrl: true, sortOrder: true },
                },
              },
            },
          },
        },
      },
    });
    if (!pkg || !pkg.isActive)
      throw new NotFoundException('Paket latsol tidak ditemukan.');
    // Siswa hanya boleh membuka paket jenjang/mapel/kelompoknya.
    if (actor) {
      const sScope = await this.tutorScope.forStudent(actor);
      if (sScope) {
        try {
          this.tutorScope.assertStudentRef(sScope, pkg);
        } catch {
          throw new NotFoundException('Paket latsol tidak ditemukan.');
        }
      }
    }
    return pkg;
  }

  /**
   * Validasi referensi program/level. Untuk tutor: ref harus berada di
   * kelompok yang dia ampu (mencegah tutor membuat paket untuk program lain).
   */
  async assertRefs(
    programId?: string,
    levelId?: string,
    actor?: AuthenticatedUser,
    subjectId?: string,
  ) {
    if (programId) {
      const p = await this.prisma.program.findUnique({
        where: { id: programId },
      });
      if (!p) throw new BadRequestException('Program tidak ditemukan.');
    }
    if (levelId) {
      const l = await this.prisma.level.findUnique({ where: { id: levelId } });
      if (!l) throw new BadRequestException('Level tidak ditemukan.');
    }
    if (subjectId) {
      const s = await this.prisma.subject.findUnique({ where: { id: subjectId } });
      if (!s) throw new BadRequestException('Mapel tidak ditemukan.');
    }
    if (actor) {
      const scope = await this.tutorScope.for(actor);
      if (scope) this.tutorScope.assertContentRef(scope, programId, levelId, subjectId);
    }
  }

  /** Turunkan subjectId paket dari level → program bila tidak diisi eksplisit. */
  async resolveSubjectId(
    subjectId?: string,
    levelId?: string,
    programId?: string,
  ): Promise<string | null> {
    if (subjectId) return subjectId;
    if (levelId) {
      const l = await this.prisma.level.findUnique({
        where: { id: levelId },
        select: { subjectId: true },
      });
      if (l?.subjectId) return l.subjectId;
    }
    if (programId) {
      const p = await this.prisma.program.findUnique({
        where: { id: programId },
        select: { subjectId: true },
      });
      if (p?.subjectId) return p.subjectId;
    }
    return null;
  }
}
