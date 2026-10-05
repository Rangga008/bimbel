/**
 * Include standar LearningGroup: relasi Program/Level + counter + detail
 * anggota & tutor dengan nama user. Counter `_count` dipakai di daftar
 * admin/owner supaya tidak perlu memuat seluruh anggota per baris.
 */
const packageSelect = {
  select: { id: true, name: true, code: true, totalSessions: true },
} as const;

export const groupListInclude = {
  program: { select: { id: true, name: true, code: true } },
  level: { select: { id: true, name: true } },
  package: packageSelect,
  _count: { select: { members: true, tutors: true } },
} as const;

export const groupDetailInclude = {
  program: {
    select: {
      id: true,
      name: true,
      code: true,
      subjectId: true,
      subject: { select: { id: true, code: true, name: true } },
    },
  },
  level: {
    select: {
      id: true,
      name: true,
      subjectId: true,
      subject: { select: { id: true, code: true, name: true } },
      levelSubjects: {
        select: { subject: { select: { id: true, code: true, name: true } } },
      },
    },
  },
  package: packageSelect,
  members: {
    orderBy: { joinedAt: 'asc' as const },
    include: {
      student: {
        include: {
          user: { select: { id: true, email: true, name: true, phone: true, avatarUrl: true } },
        },
      },
    },
  },
  tutors: {
    orderBy: { assignedAt: 'asc' as const },
    include: {
      tutor: {
        include: {
          user: { select: { id: true, email: true, name: true, phone: true, avatarUrl: true } },
        },
      },
    },
  },
  _count: { select: { members: true, tutors: true } },
} as const;
