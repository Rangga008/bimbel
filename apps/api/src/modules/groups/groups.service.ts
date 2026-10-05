import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TutorScopeService } from '../../common/tutor-scope/tutor-scope.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { AssignStudentDto } from './dto/assign-student.dto';
import { AssignTutorDto } from './dto/assign-tutor.dto';
import { groupDetailInclude, groupListInclude } from './groups.includes';
import { SchedulesService, parseDateOnly } from '../schedules/schedules.service';

@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tutorScope: TutorScopeService,
    private readonly schedules: SchedulesService,
  ) {}

  async list(
    actor: AuthenticatedUser,
    query: { search?: string; programId?: string; levelId?: string; isActive?: string },
  ) {
    const where: Record<string, unknown> = {};
    if (query.isActive === 'true') where.isActive = true;
    if (query.isActive === 'false') where.isActive = false;
    if (query.programId) where.programId = query.programId;
    if (query.levelId) where.levelId = query.levelId;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { code: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    // Tutor hanya melihat kelompok yang dia ampu.
    const scope = await this.tutorScope.for(actor);
    if (scope) where.id = { in: scope.groupIds };
    return this.prisma.learningGroup.findMany({
      where,
      include: groupListInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async get(id: string, actor?: AuthenticatedUser) {
    const group = await this.prisma.learningGroup.findUnique({
      where: { id },
      include: groupDetailInclude,
    });
    if (!group) throw new NotFoundException('Kelompok tidak ditemukan.');
    if (actor) {
      const scope = await this.tutorScope.for(actor);
      // Detail kelompok di luar ampunan → sembunyikan (404, jangan bocorkan ada/tidak).
      if (scope && !scope.groupIds.includes(group.id)) {
        throw new NotFoundException('Kelompok tidak ditemukan.');
      }
    }
    return group;
  }

  listMine(userId: string) {
    return this.prisma.learningGroup.findMany({
      where: { tutors: { some: { tutor: { userId } } } },
      include: groupListInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async getMine(id: string, userId: string) {
    const group = await this.get(id);
    const ampu = group.tutors.some((t) => t.tutor.userId === userId);
    if (!ampu) throw new ForbiddenException('Anda tidak mengampu kelompok ini.');
    return group;
  }

  async create(dto: CreateGroupDto) {
    if (dto.code) {
      const clash = await this.prisma.learningGroup.findUnique({ where: { code: dto.code } });
      if (clash) throw new ConflictException('Kode kelompok sudah dipakai.');
    }
    const program = await this.prisma.program.findUnique({ where: { id: dto.programId } });
    if (!program) throw new BadRequestException('Program tidak ditemukan.');
    if (dto.levelId) {
      const level = await this.prisma.level.findUnique({ where: { id: dto.levelId } });
      if (!level) throw new BadRequestException('Level tidak ditemukan.');
      if (level.programId !== dto.programId) {
        throw new BadRequestException('Level tersebut bukan bagian dari program yang dipilih.');
      }
    }
    const hasSchedule = dto.dayOfWeek !== undefined || dto.startMin !== undefined || dto.endMin !== undefined;
    if (hasSchedule && (dto.dayOfWeek === undefined || dto.startMin === undefined || dto.endMin === undefined)) {
      throw new BadRequestException('Jadwal awal butuh hari, jam mulai, dan jam selesai.');
    }
    if (dto.tutorId) {
      const tutor = await this.prisma.tutor.findUnique({ where: { id: dto.tutorId } });
      if (!tutor) throw new BadRequestException('Tutor tidak ditemukan.');
      if (!tutor.isActive) throw new BadRequestException('Tutor nonaktif.');
    }
    if (dto.roomId) {
      const room = await this.prisma.room.findUnique({ where: { id: dto.roomId } });
      if (!room) throw new BadRequestException('Ruangan tidak ditemukan.');
      if (!room.isActive) throw new BadRequestException('Ruangan nonaktif.');
    }
    const today = new Date();
    const validFrom = dto.validFrom ?? `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    // Validasi jadwal SEBELUM menulis — kalau tutor/ruangan bentrok, grup tidak
    // jadi dibuat sama sekali (tidak ada tulisan parsial).
    if (hasSchedule) {
      this.schedules.assertTimeRange(dto.startMin!, dto.endMin!);
      const vf = parseDateOnly(validFrom);
      const vt = dto.validTo ? parseDateOnly(dto.validTo) : null;
      if (vt && vt < vf) throw new BadRequestException('validTo harus setelah validFrom.');
      await this.schedules.assertNoScheduleConflict({
        tutorId: dto.tutorId ?? null, roomId: dto.roomId ?? null,
        dayOfWeek: dto.dayOfWeek!, startMin: dto.startMin!, endMin: dto.endMin!,
        validFrom: vf, validTo: vt,
      });
    }
    const group = await this.prisma.learningGroup.create({
      data: {
        name: dto.name,
        code: dto.code,
        programId: dto.programId,
        levelId: dto.levelId,
        capacity: dto.capacity,
        isActive: dto.isActive ?? true,
      },
      include: groupListInclude,
    });
    try {
      // Tutor lead opsional — langsung ditugaskan sebagai tutor kelompok.
      if (dto.tutorId) {
        await this.prisma.groupTutor.create({
          data: { groupId: group.id, tutorId: dto.tutorId, isLead: true },
        });
      }
      // Jadwal mingguan awal otomatis dibuat mulai tanggal assign (default hari
      // ini) — sesinya tinggal di-generate dari halaman Jadwal & Sesi.
      if (hasSchedule) {
        await this.schedules.create({
          groupId: group.id,
          tutorId: dto.tutorId ?? null,
          roomId: dto.roomId ?? null,
          subjectId: dto.subjectId ?? null,
          dayOfWeek: dto.dayOfWeek!,
          startMin: dto.startMin!,
          endMin: dto.endMin!,
          validFrom,
          validTo: dto.validTo ?? null,
        });
      }
    } catch (e) {
      // Rollback manual: hapus grup agar tidak tersisa tanpa jadwal.
      await this.prisma.learningGroup.delete({ where: { id: group.id } }).catch(() => undefined);
      throw e;
    }
    return group;
  }

  async update(id: string, dto: UpdateGroupDto) {
    const existing = await this.prisma.learningGroup.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Kelompok tidak ditemukan.');
    if (dto.code) {
      const clash = await this.prisma.learningGroup.findFirst({
        where: { code: dto.code, id: { not: id } },
      });
      if (clash) throw new ConflictException('Kode kelompok sudah dipakai.');
    }
    const nextProgramId = dto.programId ?? existing.programId;
    const nextLevelId = dto.levelId !== undefined ? dto.levelId : existing.levelId;
    if (dto.programId) {
      const program = await this.prisma.program.findUnique({ where: { id: dto.programId } });
      if (!program) throw new BadRequestException('Program tidak ditemukan.');
    }
    if (nextLevelId) {
      const level = await this.prisma.level.findUnique({ where: { id: nextLevelId } });
      if (!level) throw new BadRequestException('Level tidak ditemukan.');
      if (level.programId !== nextProgramId) {
        throw new BadRequestException('Level tersebut bukan bagian dari program yang dipilih.');
      }
    }
    return this.prisma.learningGroup.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.code !== undefined ? { code: dto.code } : {}),
        ...(dto.programId !== undefined ? { programId: dto.programId } : {}),
        ...(dto.levelId !== undefined ? { levelId: dto.levelId } : {}),
        ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      include: groupListInclude,
    });
  }

  /**
   * Hapus kelompok. Anggota, tutor, jadwal, sesi, dan referensi materi/enrollment
   * ikut terhapus/terlepas lewat FK. Ditolak bila ada sesi yang sudah berisi
   * absensi — nonaktifkan saja agar riwayat kehadiran tetap utuh.
   */
  async remove(id: string) {
    const group = await this.prisma.learningGroup.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        _count: { select: { members: true, sessions: true, schedules: true } },
      },
    });
    if (!group) throw new NotFoundException('Kelompok tidak ditemukan.');
    if (group._count.sessions > 0) {
      const withAttendance = await this.prisma.attendance.count({
        where: { session: { groupId: id } },
      });
      if (withAttendance > 0) {
        throw new BadRequestException(
          `Kelompok ini memiliki ${withAttendance} catatan absensi — nonaktifkan saja agar riwayat kehadiran tetap utuh.`,
        );
      }
    }
    await this.prisma.learningGroup.delete({ where: { id } });
    return { id: group.id, name: group.name };
  }

  async assignStudent(groupId: string, dto: AssignStudentDto) {
    const group = await this.prisma.learningGroup.findUnique({ where: { id: groupId } });
    if (!group) throw new NotFoundException('Kelompok tidak ditemukan.');
    const student = await this.prisma.student.findUnique({ where: { id: dto.studentId } });
    if (!student) throw new NotFoundException('Data siswa tidak ditemukan.');
    if (!student.isActive) {
      throw new BadRequestException('Siswa nonaktif — aktifkan dulu sebelum masuk kelompok.');
    }
    if (group.capacity != null) {
      const [count, already] = await Promise.all([
        this.prisma.groupMember.count({ where: { groupId } }),
        this.prisma.groupMember.findUnique({
          where: { groupId_studentId: { groupId, studentId: dto.studentId } },
        }),
      ]);
      if (!already && count >= group.capacity) {
        throw new BadRequestException('Kapasitas kelompok sudah penuh.');
      }
    }
    return this.prisma.groupMember.upsert({
      where: { groupId_studentId: { groupId, studentId: dto.studentId } },
      create: { groupId, studentId: dto.studentId },
      update: {},
    });
  }

  async unassignStudent(groupId: string, studentId: string) {
    await this.prisma.groupMember.deleteMany({ where: { groupId, studentId } });
    return { success: true };
  }

  async assignTutor(groupId: string, dto: AssignTutorDto) {
    const group = await this.prisma.learningGroup.findUnique({ where: { id: groupId } });
    if (!group) throw new NotFoundException('Kelompok tidak ditemukan.');
    const tutor = await this.prisma.tutor.findUnique({ where: { id: dto.tutorId } });
    if (!tutor) throw new NotFoundException('Data tutor tidak ditemukan.');
    if (!tutor.isActive) {
      throw new BadRequestException('Tutor nonaktif — aktifkan dulu sebelum ditugaskan.');
    }
    return this.prisma.groupTutor.upsert({
      where: { groupId_tutorId: { groupId, tutorId: dto.tutorId } },
      create: { groupId, tutorId: dto.tutorId, isLead: dto.isLead ?? false },
      update: { ...(dto.isLead !== undefined ? { isLead: dto.isLead } : {}) },
    });
  }

  async unassignTutor(groupId: string, tutorId: string) {
    await this.prisma.groupTutor.deleteMany({ where: { groupId, tutorId } });
    return { success: true };
  }
}
