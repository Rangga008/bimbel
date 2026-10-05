import { PrismaService } from '../../common/prisma/prisma.service';

const userBrief = { id: true, email: true, name: true, phone: true, avatarUrl: true } as const;

export const studentInclude = {
  user: { select: userBrief },
  parentStudents: {
    include: {
      parent: {
        include: {
          user: { select: userBrief },
        },
      },
    },
  },
} as const;

export const parentInclude = {
  user: { select: userBrief },
  parentStudents: {
    include: {
      student: {
        include: {
          user: { select: userBrief },
        },
      },
    },
  },
} as const;

export const tutorInclude = {
  user: { select: userBrief },
  groupTutors: {
    orderBy: { assignedAt: 'asc' as const },
    select: {
      groupId: true,
      isLead: true,
      group: { select: { id: true, name: true, code: true, isActive: true } },
    },
  },
} as const;

export type Tx = Omit<
  PrismaService,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;
