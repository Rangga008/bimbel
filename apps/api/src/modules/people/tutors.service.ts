import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ROLE_NAMES } from '../rbac/permissions.constants';
import { UsersService } from '../users/users.service';
import { CreateTutorDto } from './dto/create-tutor.dto';
import { UpdateTutorDto } from './dto/update-tutor.dto';
import { tutorInclude } from './people.includes';

/** CRUD Tutor (profil 1:1 dengan User role TUTOR). Akun via UsersService (Fase 0b). */
@Injectable()
export class TutorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  list(query: { search?: string; isActive?: string }) {
    const where: Record<string, unknown> = {};
    if (query.isActive === 'true') where.isActive = true;
    if (query.isActive === 'false') where.isActive = false;
    if (query.search) {
      where.user = {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
        ],
      };
    }
    return this.prisma.tutor.findMany({
      where,
      include: tutorInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async get(id: string) {
    const tutor = await this.prisma.tutor.findUnique({
      where: { id },
      include: tutorInclude,
    });
    if (!tutor) throw new NotFoundException('Data tutor tidak ditemukan.');
    return tutor;
  }

  async create(dto: CreateTutorDto) {
    return this.prisma.$transaction(async (tx) => {
      const createdUser = await this.users.createUserForPersonInTx(tx, {
        email: dto.email,
        name: dto.name,
        phone: dto.phone,
        roleName: ROLE_NAMES.TUTOR,
        tempPassword: dto.password,
      });
      const tutor = await tx.tutor.create({
        data: {
          userId: createdUser.userId,
          specialization: dto.specialization,
          bio: dto.bio,
        },
      });
      const full = await tx.tutor.findUniqueOrThrow({
        where: { id: tutor.id },
        include: tutorInclude,
      });
      return { ...full, tempPassword: createdUser.tempPassword };
    });
  }

  async update(id: string, dto: UpdateTutorDto) {
    const tutor = await this.prisma.tutor.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!tutor) throw new NotFoundException('Data tutor tidak ditemukan.');
    if (dto.email && dto.email !== tutor.user.email) {
      const clash = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (clash) throw new ConflictException('Email sudah dipakai akun lain.');
    }
    return this.prisma.$transaction(async (tx) => {
      if (dto.name !== undefined || dto.email !== undefined || dto.phone !== undefined) {
        await tx.user.update({
          where: { id: tutor.userId },
          data: {
            ...(dto.name !== undefined ? { name: dto.name } : {}),
            ...(dto.email !== undefined ? { email: dto.email } : {}),
            ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
          },
        });
      }
      return tx.tutor.update({
        where: { id },
        data: {
          ...(dto.specialization !== undefined ? { specialization: dto.specialization } : {}),
          ...(dto.bio !== undefined ? { bio: dto.bio } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
        include: tutorInclude,
      });
    });
  }

  /**
   * Hapus tutor beserta akunnya. Keanggotaan kelompok ikut terlepas; jadwal &
   * sesi yang menunjuk tutor ini otomatis jadi "tutor menyusul" (FK SetNull).
   * Ditolak bila tutor sudah punya riwayat (absensi mengajar / item kerja /
   * payroll) — nonaktifkan saja agar data historis utuh.
   */
  async remove(id: string) {
    const tutor = await this.prisma.tutor.findUnique({
      where: { id },
      select: { id: true, userId: true, user: { select: { name: true } } },
    });
    if (!tutor) throw new NotFoundException('Data tutor tidak ditemukan.');
    const [attCount, workCount, payrollCount] = await Promise.all([
      this.prisma.tutorAttendance.count({ where: { tutorId: id } }),
      this.prisma.tutorWorkItem.count({ where: { tutorId: id } }),
      this.prisma.payrollRun.count({ where: { tutorId: id } }),
    ]);
    const total = attCount + workCount + payrollCount;
    if (total > 0) {
      throw new BadRequestException(
        `Tutor memiliki ${total} riwayat (absensi/item kerja/payroll) — nonaktifkan saja agar data historis tetap utuh.`,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.groupTutor.deleteMany({ where: { tutorId: id } });
      await tx.userRole.deleteMany({ where: { userId: tutor.userId } });
      // Tutor cascade dari User; schedule/session tutorId SetNull.
      await tx.user.delete({ where: { id: tutor.userId } });
    });
    return { id: tutor.id, name: tutor.user.name };
  }
}
