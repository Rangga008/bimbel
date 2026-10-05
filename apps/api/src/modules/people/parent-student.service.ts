import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { studentInclude } from './people.includes';

/** Relasi many-to-many parent_students + daftar anak milik orang tua login. */
@Injectable()
export class ParentStudentService {
  constructor(private readonly prisma: PrismaService) {}

  async link(parentId: string, studentId: string) {
    const [parent, student] = await Promise.all([
      this.prisma.parent.findUnique({ where: { id: parentId } }),
      this.prisma.student.findUnique({ where: { id: studentId } }),
    ]);
    if (!parent) throw new NotFoundException('Data orang tua tidak ditemukan.');
    if (!student) throw new NotFoundException('Data siswa tidak ditemukan.');
    return this.prisma.parentStudent.upsert({
      where: { parentId_studentId: { parentId, studentId } },
      create: { parentId, studentId },
      update: {},
    });
  }

  async unlink(parentId: string, studentId: string) {
    await this.prisma.parentStudent.deleteMany({
      where: { parentId, studentId },
    });
    return { success: true };
  }

  async myChildren(userId: string) {
    const parent = await this.prisma.parent.findUnique({
      where: { userId },
      include: {
        parentStudents: { include: { student: { include: studentInclude } } },
      },
    });
    if (!parent) return [];
    return parent.parentStudents.map((link) => link.student);
  }
}
