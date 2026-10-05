// Include standar Schedule & Session.
export const scheduleListInclude = {
  group: {
    select: {
      id: true, name: true, code: true,
      package: { select: { id: true, name: true, totalSessions: true } },
    },
  },
  tutor: { select: { id: true, user: { select: { name: true } } } },
  room: { select: { id: true, name: true } },
  subject: { select: { id: true, code: true, name: true } },
  _count: { select: { sessions: true } },
} as const;

export const scheduleDetailInclude = {
  group: {
    select: {
      id: true, name: true, code: true,
      package: { select: { id: true, name: true, totalSessions: true } },
    },
  },
  tutor: { select: { id: true, user: { select: { name: true } } } },
  room: { select: { id: true, name: true } },
  subject: { select: { id: true, code: true, name: true } },
} as const;

export const sessionListInclude = {
  group: {
    select: {
      id: true,
      name: true,
      code: true,
      level: { select: { id: true, name: true, subject: { select: { code: true, name: true } } } },
      program: { select: { id: true, name: true, subject: { select: { code: true, name: true } } } },
    },
  },
  schedule: { select: { id: true, subject: { select: { code: true, name: true } } } },
  subject: { select: { id: true, code: true, name: true } },
  // phone ikut — ortu/siswa melihat kontak tutor pengajar sesinya.
  tutor: { select: { id: true, user: { select: { name: true, phone: true } } } },
  room: { select: { id: true, name: true } },
  _count: { select: { overrides: true } },
} as const;

export const sessionDetailInclude = {
  group: {
    select: {
      id: true,
      name: true,
      code: true,
      members: {
        orderBy: { joinedAt: 'asc' as const },
        select: { studentId: true, student: { select: { id: true, user: { select: { name: true } } } } },
      },
      tutors: {
        orderBy: { assignedAt: 'asc' as const },
        select: { tutorId: true, isLead: true, tutor: { select: { isActive: true, user: { select: { name: true } } } } },
      },
    },
  },
  schedule: { select: { id: true, dayOfWeek: true, startMin: true, endMin: true, subject: { select: { code: true, name: true } } } },
  subject: { select: { id: true, code: true, name: true } },
  tutor: { select: { id: true, user: { select: { name: true, phone: true } } } },
  room: { select: { id: true, name: true } },
  overrides: {
    include: {
      student: { select: { id: true, user: { select: { name: true } } } },
      room: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
} as const;
