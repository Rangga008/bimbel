import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ROLE_NAMES } from '../rbac/permissions.constants';
import { UsersService } from '../users/users.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import {
  studentInclude,
} from './people.includes';

/**
 * Fase 1a — People (Student/Parent/Tutor + relasi parent_students).
 * Pembuatan profil memakai UsersService.createUserForPersonInTx() (Fase 0b)
 * supaya tidak ada duplikasi logic User+Role; pembuatan User dan profil
 * selalu dalam 1 transaksi (tidak ada profil yatim tanpa akun login).
 */
@Injectable()
export class PeopleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  // ---------------------------------------------------------------- students
  async listStudents(query: { search?: string; isActive?: string }) {
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
    return this.prisma.student.findMany({
      where,
      include: studentInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async getStudent(id: string) {
    const student = await this.prisma.student.findUnique({
      where: { id },
      include: {
        ...studentInclude,
        groupMembers: {
          orderBy: { joinedAt: 'asc' as const },
          include: {
            group: {
              select: {
                id: true,
                name: true,
                code: true,
                isActive: true,
                program: { select: { id: true, name: true, code: true, subject: { select: { code: true, name: true } } } },
                level: { select: { id: true, name: true } },
                _count: { select: { members: true, tutors: true } },
              },
            },
          },
        },
      },
    });
    if (!student) throw new NotFoundException('Data siswa tidak ditemukan.');
    return student;
  }

  async createStudent(dto: CreateStudentDto) {
    if (dto.parentIds?.length) {
      const parents = await this.prisma.parent.findMany({
        where: { id: { in: dto.parentIds } },
      });
      if (parents.length !== dto.parentIds.length) {
        throw new BadRequestException('Salah satu data orang tua tidak ada.');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const createdUser = await this.users.createUserForPersonInTx(tx, {
        email: dto.email,
        name: dto.name,
        phone: dto.phone,
        roleName: ROLE_NAMES.SISWA,
        tempPassword: dto.password,
      });
      const student = await tx.student.create({
        data: {
          userId: createdUser.userId,
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
          address: dto.address,
          schoolOrigin: dto.schoolOrigin,
          gender: dto.gender,
        },
      });
      if (dto.parentIds?.length) {
        await tx.parentStudent.createMany({
          data: dto.parentIds.map((parentId) => ({
            parentId,
            studentId: student.id,
          })),
          skipDuplicates: true,
        });
      }
      const full = await tx.student.findUniqueOrThrow({
        where: { id: student.id },
        include: studentInclude,
      });
      return { ...full, tempPassword: createdUser.tempPassword };
    });
  }

  async updateStudent(id: string, dto: UpdateStudentDto) {
    const student = await this.prisma.student.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!student) throw new NotFoundException('Data siswa tidak ditemukan.');
    if (dto.email && dto.email !== student.user.email) {
      const clash = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (clash) throw new ConflictException('Email sudah dipakai akun lain.');
    }
    return this.prisma.$transaction(async (tx) => {
      if (
        dto.name !== undefined ||
        dto.email !== undefined ||
        dto.phone !== undefined
      ) {
        await tx.user.update({
          where: { id: student.userId },
          data: {
            ...(dto.name !== undefined ? { name: dto.name } : {}),
            ...(dto.email !== undefined ? { email: dto.email } : {}),
            ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
          },
        });
      }
      return tx.student.update({
        where: { id },
        data: {
          ...(dto.dateOfBirth !== undefined
            ? { dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null }
            : {}),
          ...(dto.address !== undefined ? { address: dto.address } : {}),
          ...(dto.schoolOrigin !== undefined ? { schoolOrigin: dto.schoolOrigin } : {}),
          ...(dto.gender !== undefined ? { gender: dto.gender } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
        include: studentInclude,
      });
    });
  }

  /**
   * Hapus siswa — hanya bila belum ada jejak akademik/finance
   * (absensi, invoice, pendaftaran, ujian, latsol). Kalau ada,
   * admin diarahkan menonaktifkan supaya histori tetap utuh.
   */
  async deleteStudent(id: string) {
    const student = await this.prisma.student.findUnique({ where: { id } });
    if (!student) throw new NotFoundException('Data siswa tidak ditemukan.');
    const [attendances, invoices, enrollments, examAttempts, latsolAttempts] =
      await Promise.all([
        this.prisma.attendance.count({ where: { studentId: id } }),
        this.prisma.invoice.count({ where: { studentId: id } }),
        this.prisma.enrollment.count({ where: { studentId: id } }),
        this.prisma.examAttempt.count({ where: { studentId: id } }),
        this.prisma.latsolAttempt.count({ where: { studentId: id } }),
      ]);
    const total =
      attendances + invoices + enrollments + examAttempts + latsolAttempts;
    if (total > 0) {
      throw new BadRequestException(
        `Siswa masih punya ${total} jejak data (absensi/invoice/pendaftaran/ujian). Nonaktifkan saja agar histori tidak hilang.`,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.groupMember.deleteMany({ where: { studentId: id } });
      await tx.sessionStudentOverride.deleteMany({ where: { studentId: id } });
      await tx.parentStudent.deleteMany({ where: { studentId: id } });
      await tx.feedbackEntry.deleteMany({ where: { studentId: id } });
      await tx.pointTransaction.deleteMany({ where: { studentId: id } });
      await tx.student.delete({ where: { id } });
      await tx.user.delete({ where: { id: student.userId } });
    });
    return { deleted: true };
  }

  /**
   * Log aktivitas siswa untuk halaman detail admin — gabungan absensi,
   * attempt ujian, dan attempt latsol diurut terbaru.
   */
  async studentActivity(id: string) {
    const student = await this.prisma.student.findUnique({ where: { id } });
    if (!student) throw new NotFoundException('Data siswa tidak ditemukan.');
    const [attendances, exams, latsols] = await Promise.all([
      this.prisma.attendance.findMany({
        where: { studentId: id },
        select: {
          id: true,
          status: true,
          note: true,
          markedAt: true,
          markedBy: true,
          session: {
            select: {
              startsAt: true,
              group: { select: { name: true } },
              tutor: { select: { user: { select: { name: true } } } },
            },
          },
        },
        orderBy: { markedAt: 'desc' },
        take: 30,
      }),
      this.prisma.examAttempt.findMany({
        where: { studentId: id },
        select: {
          id: true,
          status: true,
          score: true,
          maxScore: true,
          startedAt: true,
          submittedAt: true,
          exam: { select: { title: true } },
        },
        orderBy: { startedAt: 'desc' },
        take: 30,
      }),
      this.prisma.latsolAttempt.findMany({
        where: { studentId: id },
        select: {
          id: true,
          status: true,
          score: true,
          maxScore: true,
          startedAt: true,
          submittedAt: true,
          package: { select: { title: true } },
        },
        orderBy: { startedAt: 'desc' },
        take: 30,
      }),
    ]);
    const items = [
      ...attendances.map((a) => ({
        kind: 'ABSENSI' as const,
        at: a.session.startsAt,
        title: `Absensi ${a.session.group.name}`,
        detail: a.session.tutor?.user.name
          ? `Diabsen oleh ${a.session.tutor.user.name}${a.note ? ` — ${a.note}` : ''}`
          : a.note,
        status: a.status,
        score: null as number | null,
        maxScore: null as number | null,
      })),
      ...exams.map((e) => ({
        kind: 'UJIAN' as const,
        at: e.submittedAt ?? e.startedAt,
        title: `Ujian — ${e.exam.title}`,
        detail: null as string | null,
        status: e.status,
        score: e.score,
        maxScore: e.maxScore,
      })),
      ...latsols.map((l) => ({
        kind: 'LATSOL' as const,
        at: l.submittedAt ?? l.startedAt,
        title: `Latihan Soal — ${l.package.title}`,
        detail: null as string | null,
        status: l.status,
        score: l.score,
        maxScore: l.maxScore,
      })),
    ];
    items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    return items.slice(0, 40);
  }
}
