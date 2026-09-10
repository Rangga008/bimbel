import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import {
  PERMISSION_CODES,
  ROLE_NAMES,
} from '../src/modules/rbac/permissions.constants';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const SEED_PASSWORD_SALT_ROUNDS = 12;

/** Satu permission dashboard per role + satu permission pengelolaan role (khusus Owner). */
const ROLE_PERMISSION_MAP: Record<string, string[]> = {
  [ROLE_NAMES.SISWA]: [PERMISSION_CODES.DASHBOARD_SISWA_VIEW],
  [ROLE_NAMES.ORANG_TUA]: [PERMISSION_CODES.DASHBOARD_ORANG_TUA_VIEW],
  [ROLE_NAMES.TUTOR]: [PERMISSION_CODES.DASHBOARD_TUTOR_VIEW],
  [ROLE_NAMES.ADMIN_FINANCE]: [PERMISSION_CODES.DASHBOARD_ADMIN_FINANCE_VIEW],
  [ROLE_NAMES.ADMIN_ACADEMIC]: [PERMISSION_CODES.DASHBOARD_ADMIN_ACADEMIC_VIEW],
  [ROLE_NAMES.OWNER]: [
    PERMISSION_CODES.DASHBOARD_OWNER_VIEW,
    PERMISSION_CODES.DASHBOARD_SISWA_VIEW,
    PERMISSION_CODES.DASHBOARD_ORANG_TUA_VIEW,
    PERMISSION_CODES.DASHBOARD_TUTOR_VIEW,
    PERMISSION_CODES.DASHBOARD_ADMIN_FINANCE_VIEW,
    PERMISSION_CODES.DASHBOARD_ADMIN_ACADEMIC_VIEW,
    PERMISSION_CODES.RBAC_MANAGE_ROLES,
  ],
};

const SEED_USERS: Array<{
  email: string;
  name: string;
  password: string;
  role: string;
}> = [
  {
    email: 'siswa1@bimbel.test',
    name: 'Siswa Satu',
    password: 'Siswa123!',
    role: ROLE_NAMES.SISWA,
  },
  {
    email: 'ortu1@bimbel.test',
    name: 'Orang Tua Satu',
    password: 'OrangTua123!',
    role: ROLE_NAMES.ORANG_TUA,
  },
  {
    email: 'tutor1@bimbel.test',
    name: 'Tutor Satu',
    password: 'Tutor123!',
    role: ROLE_NAMES.TUTOR,
  },
  {
    email: 'adminfinance1@bimbel.test',
    name: 'Admin Finance Satu',
    password: 'AdminFinance123!',
    role: ROLE_NAMES.ADMIN_FINANCE,
  },
  {
    email: 'adminacademic1@bimbel.test',
    name: 'Admin Academic Satu',
    password: 'AdminAcademic123!',
    role: ROLE_NAMES.ADMIN_ACADEMIC,
  },
  {
    email: 'owner1@bimbel.test',
    name: 'Owner Satu',
    password: 'Owner123!',
    role: ROLE_NAMES.OWNER,
  },
];

async function main() {
  const permissionCodes = Object.values(PERMISSION_CODES);
  const permissionsByCode = new Map<string, { id: string }>();
  for (const code of permissionCodes) {
    const permission = await prisma.permission.upsert({
      where: { code },
      create: { code },
      update: {},
    });
    permissionsByCode.set(code, permission);
  }

  const rolesByName = new Map<string, { id: string }>();
  for (const roleName of Object.values(ROLE_NAMES)) {
    const role = await prisma.role.upsert({
      where: { name: roleName },
      create: { name: roleName },
      update: {},
    });
    rolesByName.set(roleName, role);

    const codes = ROLE_PERMISSION_MAP[roleName] ?? [];
    for (const code of codes) {
      const permission = permissionsByCode.get(code)!;
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId: permission.id },
        },
        create: { roleId: role.id, permissionId: permission.id },
        update: {},
      });
    }
  }

  for (const seedUser of SEED_USERS) {
    const passwordHash = await bcrypt.hash(
      seedUser.password,
      SEED_PASSWORD_SALT_ROUNDS,
    );
    const user = await prisma.user.upsert({
      where: { email: seedUser.email },
      create: { email: seedUser.email, name: seedUser.name, passwordHash },
      update: { name: seedUser.name, passwordHash },
    });

    const role = rolesByName.get(seedUser.role)!;
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      create: { userId: user.id, roleId: role.id },
      update: {},
    });
  }

  console.log(
    'Seed selesai: 6 role, permission dasar, dan 6 akun contoh dibuat.',
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
