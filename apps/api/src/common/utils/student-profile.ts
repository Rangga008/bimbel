import { ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { ROLE_NAMES } from '../../modules/rbac/permissions.constants';

/**
 * Ambil profil siswa milik user — bila akun punya role SISWA tapi baris
 * `students` belum ada (akun lama dari build sebelum profil otomatis
 * dibuat, atau data hasil import), profil dipulihkan otomatis supaya
 * akun tidak nyangkut di error "tidak terhubung ke data siswa".
 * Akun tanpa role SISWA tetap ditolak seperti biasa.
 */
export async function ensureStudentProfile(
  prisma: PrismaService,
  userId: string,
) {
  const existing = await prisma.student.findUnique({ where: { userId } });
  if (existing) return existing;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      userRoles: { select: { role: { select: { name: true } } } },
    },
  });
  const hasSiswaRole = user?.userRoles.some(
    (ur) => ur.role.name === ROLE_NAMES.SISWA,
  );
  if (!hasSiswaRole) {
    throw new ForbiddenException('Akun ini tidak terhubung ke data siswa.');
  }
  return prisma.student.upsert({
    where: { userId },
    create: { userId, isExternal: true },
    update: {},
  });
}
