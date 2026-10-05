import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../../modules/auth/types/authenticated-user.type';
import { PERMISSION_CODES } from '../../modules/rbac/permissions.constants';

export interface TutorScope {
  /** programId yang diampu tutor (dari kelompok yang di-assign). */
  programIds: string[];
  /** groupId yang diampu tutor. */
  groupIds: string[];
  /** levelId dari program yang diampu tutor. */
  levelIds: string[];
  /** subjectId mapel yang diampu tutor — untuk berbagi bank soal se-mapel
   *  antar-tutor walau beda level mengajar. */
  subjectIds: string[];
  tutorId: string;
}

/** Scope konten untuk SISWA — dari enrollment aktif + keanggotaan kelompok. */
export interface StudentScope {
  programIds: string[];
  groupIds: string[];
  levelIds: string[];
  subjectIds: string[];
}

/**
 * Scope data kurikulum untuk peran TUTOR — tutor hanya boleh melihat/mengelola
 * program, level, dan kelompok yang dia ampu (via GroupTutor atau sesi yang
 * diajarnya). Peran lain (admin/owner/dll) mengembalikan null = tanpa batas.
 */
@Injectable()
export class TutorScopeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `null` = tidak dibatasi. Terapkan hanya bila user adalah tutor DAN tidak
   * punya permission admin (people.view menandakan akses kurikulum penuh).
   */
  async for(actor: {
    id: string;
    roles: string[];
    permissions: string[];
  }): Promise<TutorScope | null> {
    if (!actor.roles.includes('TUTOR')) return null;
    if (actor.permissions.includes(PERMISSION_CODES.PEOPLE_VIEW)) return null;
    const tutor = await this.prisma.tutor.findUnique({
      where: { userId: actor.id },
      select: { id: true },
    });
    if (!tutor) return null;

    const [assigned, taughtSessions] = await Promise.all([
      this.prisma.groupTutor.findMany({
        where: { tutorId: tutor.id },
        select: { groupId: true },
      }),
      // Sesi yang diajar tutor tapi (belum) masuk GroupTutor tetap masuk scope.
      this.prisma.session.findMany({
        where: { tutorId: tutor.id },
        select: { groupId: true },
      }),
    ]);
    const groupIds = [
      ...new Set([
        ...assigned.map((a) => a.groupId),
        ...taughtSessions.map((s) => s.groupId),
      ]),
    ];
    const groups = await this.prisma.learningGroup.findMany({
      where: { id: { in: groupIds } },
      select: {
        programId: true,
        levelId: true,
        program: { select: { subjectId: true } },
        level: { select: { subjectId: true } },
      },
    });
    const programIds = [...new Set(groups.map((g) => g.programId))];
    const levelIds = [
      ...new Set(groups.map((g) => g.levelId).filter((x): x is string => !!x)),
    ];
    // Mapel yang diampu tutor = mapel level kelompoknya, fallback mapel program.
    const subjectIds = [
      ...new Set(
        groups
          .map((g) => g.level?.subjectId ?? g.program?.subjectId)
          .filter((x): x is string => !!x),
      ),
    ];
    // Level dari program yang diampu juga masuk scope (tutor bikin latsol per level).
    if (programIds.length) {
      const levels = await this.prisma.level.findMany({
        where: { programId: { in: programIds } },
        select: { id: true, subjectId: true },
      });
      for (const l of levels) {
        if (!levelIds.includes(l.id)) levelIds.push(l.id);
        if (l.subjectId && !subjectIds.includes(l.subjectId)) subjectIds.push(l.subjectId);
      }
    }
    // Mapel program yang diampu juga masuk (program tanpa level spesifik).
    if (programIds.length) {
      const programs = await this.prisma.program.findMany({
        where: { id: { in: programIds }, subjectId: { not: null } },
        select: { subjectId: true },
      });
      for (const p of programs)
        if (p.subjectId && !subjectIds.includes(p.subjectId)) subjectIds.push(p.subjectId);
    }
    return { programIds, groupIds, levelIds, subjectIds, tutorId: tutor.id };
  }

  /** Prisma `where` tambahan untuk entitas ber-programId/levelId/groupId. */
  contentWhere(scope: TutorScope) {
    return {
      OR: [
        { programId: { in: scope.programIds } },
        { levelId: { in: scope.levelIds } },
        { groupId: { in: scope.groupIds } },
      ],
    };
  }

  /**
   * Scope konten untuk peran SISWA — siswa hanya boleh melihat konten
   * (materi/latsol/ujian) yang terikat jenjang/kelompok/mapel dari
   * enrollment-nya (ACCEPTED/PLACED) atau kelompok tempat dia ditempatkan.
   * `null` = bukan siswa / tidak dibatasi. `[]`-scope = siswa tanpa
   * enrollment aktif → tak boleh melihat konten bertarget.
   */
  async forStudent(actor: {
    id: string;
    roles: string[];
  }): Promise<StudentScope | null> {
    if (!actor.roles.includes('SISWA')) return null;
    const student = await this.prisma.student.findUnique({
      where: { userId: actor.id },
      select: { id: true },
    });
    if (!student) return { programIds: [], groupIds: [], levelIds: [], subjectIds: [] };

    const [enrollments, memberships] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { studentId: student.id, status: { in: ['ACCEPTED', 'PLACED'] } },
        select: { programId: true, levelId: true, groupId: true },
      }),
      this.prisma.groupMember.findMany({
        where: { studentId: student.id },
        select: {
          groupId: true,
          group: { select: { programId: true, levelId: true } },
        },
      }),
    ]);

    const programIds = [
      ...new Set([
        ...enrollments.map((e) => e.programId),
        ...memberships.map((m) => m.group.programId),
      ]),
    ];
    const levelIds = [
      ...new Set([
        ...enrollments.map((e) => e.levelId),
        ...memberships.map((m) => m.group.levelId).filter((x): x is string => !!x),
      ]),
    ];
    const groupIds = [
      ...new Set([
        ...enrollments.map((e) => e.groupId).filter((x): x is string => !!x),
        ...memberships.map((m) => m.groupId),
      ]),
    ];

    // Mapel siswa = mapel jenjangnya (levelSubjects + level.subjectId)
    // + mapel program yang dia ikuti.
    const [levelSubs, levels, programs] = await Promise.all([
      levelIds.length
        ? this.prisma.levelSubject.findMany({
            where: { levelId: { in: levelIds } },
            select: { subjectId: true },
          })
        : Promise.resolve([]),
      levelIds.length
        ? this.prisma.level.findMany({
            where: { id: { in: levelIds } },
            select: { subjectId: true },
          })
        : Promise.resolve([]),
      programIds.length
        ? this.prisma.program.findMany({
            where: { id: { in: programIds } },
            select: { subjectId: true },
          })
        : Promise.resolve([]),
    ]);
    const subjectIds = [
      ...new Set(
        [
          ...levelSubs.map((s) => s.subjectId),
          ...levels.map((l) => l.subjectId),
          ...programs.map((p) => p.subjectId),
        ].filter((x): x is string => !!x),
      ),
    ];

    return { programIds, groupIds, levelIds, subjectIds };
  }

  /**
   * Prisma `where` konten untuk siswa: cocok bila salah satu taksonomi
   * konten masuk scope. Konten tanpa taksonomi sama sekali (umum) tetap
   * terlihat oleh semua siswa.
   */
  studentContentWhere(scope: StudentScope) {
    return {
      OR: [
        { programId: { in: scope.programIds } },
        { levelId: { in: scope.levelIds } },
        { groupId: { in: scope.groupIds } },
        { subjectId: { in: scope.subjectIds } },
        // Konten umum — tidak menargetkan jenjang/mapel/kelompok tertentu.
        {
          AND: [
            { programId: null },
            { levelId: null },
            { groupId: null },
            { subjectId: null },
          ],
        },
      ],
    };
  }

  /** Lempar Forbidden bila konten bertarget di luar scope siswa. */
  assertStudentRef(
    scope: StudentScope,
    refs: {
      programId?: string | null;
      levelId?: string | null;
      groupId?: string | null;
      subjectId?: string | null;
    },
  ) {
    const targeted =
      !!refs.programId || !!refs.levelId || !!refs.groupId || !!refs.subjectId;
    if (!targeted) return; // konten umum
    const inScope =
      (!!refs.programId && scope.programIds.includes(refs.programId)) ||
      (!!refs.levelId && scope.levelIds.includes(refs.levelId)) ||
      (!!refs.groupId && scope.groupIds.includes(refs.groupId)) ||
      (!!refs.subjectId && scope.subjectIds.includes(refs.subjectId));
    if (!inScope) {
      throw new ForbiddenException(
        'Konten ini di luar jenjang/mapel yang Anda ikuti.',
      );
    }
  }

  /**
   * Lempar Forbidden bila referensi program/level/mapel di luar scope tutor.
   * Dipakai saat tutor membuat/mengubah konten (paket latsol, dsb).
   * Mapel dihitung terpisah: tutor Matematika SMP boleh membuat konten
   * mapel Matematika walau levelnya di luar kelompok yang dia ampu.
   */
  assertContentRef(
    scope: TutorScope,
    programId?: string | null,
    levelId?: string | null,
    subjectId?: string | null,
  ) {
    const inProgram = !!programId && scope.programIds.includes(programId);
    const inLevel = !!levelId && scope.levelIds.includes(levelId);
    const inSubject = !!subjectId && scope.subjectIds.includes(subjectId);
    // Boleh bila salah satu ref ada di scope; semua ref di luar → tolak.
    if ((programId || levelId || subjectId) && !inProgram && !inLevel && !inSubject) {
      throw new ForbiddenException(
        'Program/level/mapel ini di luar kelompok yang Anda ampu.',
      );
    }
  }
}
