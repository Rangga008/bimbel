// Unit test Fase 0b: createUserForPerson() — helper yang dipakai ulang Fase 1a.
// Pure function (generateTempPassword) + validasi role tanpa butuh DB.
import { ROLE_NAMES } from '../rbac/permissions.constants';
import { UsersService } from './users.service';

function makeService() {
  // PrismaService di-mock: createUserForPerson hanya memakai generateTempPassword
  // untuk bagian pure + validasi roleName sebelum menyentuh DB.
  const prisma = {} as never;
  return new UsersService(prisma);
}

describe('UsersService (Fase 0b)', () => {
  it('generateTempPassword menghasilkan 12 karakter aman', () => {
    const svc = makeService();
    const pw = svc.generateTempPassword();
    expect(pw).toHaveLength(12);
    expect(pw).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789]{12}$/);
  });

  it('createUserForPerson menolak role tidak dikenal tanpa menyentuh DB', async () => {
    const svc = makeService();
    await expect(
      svc.createUserForPerson({
        email: 'x@bimbel.test',
        name: 'X',
        roleName: 'BUKAN_ROLE' as never,
      }),
    ).rejects.toThrow('Role tidak dikenal.');
  });

  it('createUserForPerson menolak email duplikat (transaksi rollback)', async () => {
    const svc = makeService();
    const fakeTx = {
      user: {
        findUnique: async () => ({ id: 'ada' }),
        create: jest.fn(),
      },
      role: { findUnique: async () => ({ id: 'role-id' }) },
      userRole: { create: jest.fn() },
    };
    (svc as unknown as { prisma: unknown }).prisma = {
      $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(fakeTx),
    };
    await expect(
      svc.createUserForPerson({
        email: 'duplikat@bimbel.test',
        name: 'Duplikat',
        roleName: ROLE_NAMES.TUTOR,
        tempPassword: 'TempPass123!',
      }),
    ).rejects.toThrow('Email sudah dipakai akun lain.');
    expect(fakeTx.user.create).not.toHaveBeenCalled();
    expect(fakeTx.userRole.create).not.toHaveBeenCalled();
  });

  it('createUserForPerson sukses membuat user + 1 role, kembalikan tempPassword', async () => {
    const svc = makeService();
    const fakeTx = {
      user: {
        findUnique: async () => null,
        create: async (args: { data: { email: string } }) => ({
          id: 'user-baru',
          email: args.data.email,
        }),
      },
      role: { findUnique: async () => ({ id: 'role-tutor' }) },
      userRole: { create: jest.fn(async () => ({})) },
    };
    (svc as unknown as { prisma: unknown }).prisma = {
      $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(fakeTx),
    };
    const res = await svc.createUserForPerson({
      email: 'tutorbaru@bimbel.test',
      name: 'Tutor Baru',
      roleName: ROLE_NAMES.TUTOR,
      tempPassword: 'TempPass123!',
    });
    expect(res).toEqual({
      userId: 'user-baru',
      email: 'tutorbaru@bimbel.test',
      tempPassword: 'TempPass123!',
    });
    expect(fakeTx.userRole.create).toHaveBeenCalledWith({
      data: { userId: 'user-baru', roleId: 'role-tutor' },
    });
  });
});
