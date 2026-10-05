import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ROLE_NAMES } from '../rbac/permissions.constants';
import { UsersService } from '../users/users.service';
import { CreateParentDto } from './dto/create-parent.dto';
import { UpdateParentDto } from './dto/update-parent.dto';
import { parentInclude } from './people.includes';

/** CRUD Parent + relasi parent_students (sisi parent). Akun via UsersService (Fase 0b). */
@Injectable()
export class ParentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  list(query: { search?: string }) {
    const where: Record<string, unknown> = {};
    if (query.search) {
      where.user = {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
        ],
      };
    }
    return this.prisma.parent.findMany({
      where,
      include: parentInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async get(id: string) {
    const parent = await this.prisma.parent.findUnique({
      where: { id },
      include: {
        user: parentInclude.user,
        parentStudents: {
          include: {
            student: {
              include: {
                user: parentInclude.parentStudents.include.student.include.user,
                groupMembers: {
                  include: {
                    group: {
                      select: {
                        id: true,
                        name: true,
                        code: true,
                        isActive: true,
                        program: { select: { id: true, name: true, code: true, subject: { select: { code: true, name: true } } } },
                        level: { select: { id: true, name: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!parent) throw new NotFoundException('Data orang tua tidak ditemukan.');
    return parent;
  }

  async create(dto: CreateParentDto) {
    if (dto.studentIds?.length) {
      const n = await this.prisma.student.count({
        where: { id: { in: dto.studentIds } },
      });
      if (n !== dto.studentIds.length) {
        throw new BadRequestException('Salah satu data siswa tidak ada.');
      }
    }
    return this.prisma.$transaction(async (tx) => {
      const createdUser = await this.users.createUserForPersonInTx(tx, {
        email: dto.email,
        name: dto.name,
        phone: dto.phone,
        roleName: ROLE_NAMES.ORANG_TUA,
        tempPassword: dto.password,
      });
      const parent = await tx.parent.create({
        data: { userId: createdUser.userId },
      });
      if (dto.studentIds?.length) {
        await tx.parentStudent.createMany({
          data: dto.studentIds.map((studentId) => ({
            parentId: parent.id,
            studentId,
          })),
          skipDuplicates: true,
        });
      }
      const full = await tx.parent.findUniqueOrThrow({
        where: { id: parent.id },
        include: parentInclude,
      });
      return { ...full, tempPassword: createdUser.tempPassword };
    });
  }

  async update(id: string, dto: UpdateParentDto) {
    const parent = await this.prisma.parent.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!parent) throw new NotFoundException('Data orang tua tidak ditemukan.');
    if (dto.email && dto.email !== parent.user.email) {
      const clash = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (clash) throw new ConflictException('Email sudah dipakai akun lain.');
    }
    return this.prisma.$transaction(async (tx) => {
      if (dto.name !== undefined || dto.email !== undefined || dto.phone !== undefined) {
        await tx.user.update({
          where: { id: parent.userId },
          data: {
            ...(dto.name !== undefined ? { name: dto.name } : {}),
            ...(dto.email !== undefined ? { email: dto.email } : {}),
            ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
          },
        });
      }
      if (dto.isActive !== undefined) {
        await tx.parent.update({ where: { id }, data: { isActive: dto.isActive } });
      }
      return tx.parent.findUniqueOrThrow({ where: { id }, include: parentInclude });
    });
  }

  /**
   * Hapus ortu — hanya bila tidak lagi terhubung ke anak & tanpa
   * riwayat pendaftaran. Tautan anak dilepas dulu via Hubungkan Anak.
   */
  async remove(id: string) {
    const parent = await this.prisma.parent.findUnique({ where: { id } });
    if (!parent) throw new NotFoundException('Data orang tua tidak ditemukan.');
    const [links, enrollments] = await Promise.all([
      this.prisma.parentStudent.count({ where: { parentId: id } }),
      this.prisma.enrollment.count({ where: { parentId: id } }),
    ]);
    if (links > 0) {
      throw new BadRequestException(
        `Orang tua masih terhubung ke ${links} anak — lepaskan dulu tautannya.`,
      );
    }
    if (enrollments > 0) {
      throw new BadRequestException(
        `Orang tua punya ${enrollments} riwayat pendaftaran — nonaktifkan saja agar histori tidak hilang.`,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.feedbackEntry.deleteMany({ where: { parentId: id } });
      await tx.parent.delete({ where: { id } });
      await tx.user.delete({ where: { id: parent.userId } });
    });
    return { deleted: true };
  }
}
