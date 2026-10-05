import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

/** Ringkasan angka Fase 1a untuk dashboard admin/owner (opsional, non-kritis). */
@Injectable()
export class PeopleOverviewService {
  constructor(private readonly prisma: PrismaService) {}

  async overview() {
    const [totalStudents, totalParents, totalTutors, recentStudents] =
      await Promise.all([
        this.prisma.student.count({ where: { isActive: true } }),
        this.prisma.parent.count({ where: { isActive: true } }),
        this.prisma.tutor.count({ where: { isActive: true } }),
        this.prisma.student.findMany({
          include: {
            user: {
              select: { id: true, email: true, name: true, phone: true },
            },
            parentStudents: {
              include: {
                parent: {
                  include: {
                    user: {
                      select: { id: true, email: true, name: true, phone: true },
                    },
                  },
                },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
      ]);
    return { totalStudents, totalParents, totalTutors, recentStudents };
  }
}
