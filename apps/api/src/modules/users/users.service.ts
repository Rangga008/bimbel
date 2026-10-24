import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ROLE_NAMES, RoleName } from '../rbac/permissions.constants';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const PASSWORD_SALT_ROUNDS = 12;

export interface CreateUserForPersonInput {
  email: string;
  name: string;
  phone?: string;
  /** Role backend yang di-assign, mis. ORANG_TUA / TUTOR / SISWA. */
  roleName: RoleName;
  /** Boleh override password (dipakai test); default generate aman. */
  tempPassword?: string;
  /** false = akun daftar-mandiri — wajib verifikasi no HP via OTP WhatsApp
   *  sebelum bisa melakukan aksi bernilai. Default true (dibuat admin/ortu
   *  dianggap terpercaya). */
  phoneVerified?: boolean;
}

export interface CreatedUserForPerson {
  userId: string;
  email: string;
  tempPassword: string;
}

/**
 * Fase 0 (+0b): query auth/RBAC + manajemen akun manual.
 * CRUD profil siswa/tutor/dsb tetap ada di modul people (Fase 1a),
 * tapi pembuatan User-nya memakai createUserForPerson() di sini.
 */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmailWithRoles(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: { include: { permission: true } },
              },
            },
          },
        },
      },
    });
  }

  /** Normalisasi nomor HP ke varian umum (0xxx, 62xxx, +62xxx, 8xxx). */
  static phoneVariants(raw: string): string[] {
    const digits = raw.replace(/\D/g, '');
    const variants = new Set<string>([raw.trim(), digits]);
    if (digits.startsWith('62')) variants.add('0' + digits.slice(2));
    if (digits.startsWith('0')) variants.add('62' + digits.slice(1));
    if (digits.startsWith('8')) {
      variants.add('0' + digits);
      variants.add('62' + digits);
    }
    return [...variants].filter(Boolean);
  }

  /** Cari user lewat nomor HP (sudah dinormalisasi ke beberapa varian).
   *  Bisa mengembalikan >1 akun (mis. akun lama dinonaktifkan lalu nomor
   *  yang sama didaftarkan ulang) — pemanggil wajib memilih kandidat yang
   *  cocok, bukan sekadar yang tertua. */
  async findAllByPhoneWithRoles(phoneVariants: string[]) {
    return this.prisma.user.findMany({
      where: { phone: { in: phoneVariants } },
      orderBy: { createdAt: 'asc' },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: { include: { permission: true } },
              },
            },
          },
        },
      },
    });
  }

  async findByIdWithRoles(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: { include: { permission: true } },
              },
            },
          },
        },
      },
    });
  }

  buildRolesAndPermissions(
    user: NonNullable<
      Awaited<ReturnType<UsersService['findByEmailWithRoles']>>
    >,
  ) {
    const roles = user.userRoles.map((userRole) => userRole.role.name);
    const permissions = Array.from(
      new Set(
        user.userRoles.flatMap((userRole) =>
          userRole.role.rolePermissions.map(
            (rolePermission) => rolePermission.permission.code,
          ),
        ),
      ),
    );
    return { roles, permissions };
  }

  async assignRole(userId: string, roleId: string) {
    return this.prisma.$transaction(async (tx) => {
      const link = await tx.userRole.upsert({
        where: { userId_roleId: { userId, roleId } },
        create: { userId, roleId },
        update: {},
      });
      const role = await tx.role.findUnique({
        where: { id: roleId },
        select: { name: true },
      });
      if (role) await this.ensurePersonProfile(tx, userId, role.name);
      return link;
    });
  }

  /**
   * Buat baris profil domain (students/parents/tutors) bila belum ada —
   * idempotent, dipakai saat akun mendapat role person dari Manajemen Akun.
   */
  private async ensurePersonProfile(
    tx: Prisma.TransactionClient,
    userId: string,
    roleName: string,
  ) {
    if (roleName === ROLE_NAMES.ORANG_TUA) {
      await tx.parent.upsert({
        where: { userId },
        create: { userId },
        update: {},
      });
    } else if (roleName === ROLE_NAMES.TUTOR) {
      await tx.tutor.upsert({
        where: { userId },
        create: { userId },
        update: {},
      });
    } else if (roleName === ROLE_NAMES.SISWA) {
      await tx.student.upsert({
        where: { userId },
        create: { userId },
        update: {},
      });
    }
  }

  async revokeRole(userId: string, roleId: string) {
    return this.prisma.userRole.deleteMany({ where: { userId, roleId } });
  }

  // ---------------------------------------------------------- Fase 0b

  /** Bentuk aman untuk list/detail — tanpa passwordHash. */
  sanitize(
    user: Parameters<UsersService['buildRolesAndPermissions']>[0],
  ) {
    const { roles, permissions } = this.buildRolesAndPermissions(user);
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      isActive: user.isActive,
      phoneVerifiedAt: user.phoneVerifiedAt,
      createdAt: user.createdAt,
      roles,
      permissions,
    };
  }

  async listUsers(query: {
    search?: string;
    isActive?: string;
    role?: string;
    phoneVerified?: string;
  }) {
    const where: Record<string, unknown> = {
      // Akun yang sudah dihapus (dianonimkan) tidak tampil di daftar.
      NOT: { email: { endsWith: '@deleted.local' } },
    };
    if (query.isActive === 'true') where.isActive = true;
    if (query.isActive === 'false') where.isActive = false;
    // Filter verifikasi no HP — untuk menyaring akun daftar-mandiri yang
    // belum membuktikan nomornya (kandidat akun "bodong").
    if (query.phoneVerified === 'true') where.phoneVerifiedAt = { not: null };
    if (query.phoneVerified === 'false') where.phoneVerifiedAt = null;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.role) {
      where.userRoles = { some: { role: { name: query.role } } };
    }
    const users = await this.prisma.user.findMany({
      where,
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: { include: { permission: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return users.map((u) => this.sanitize(u));
  }

  async getUser(id: string) {
    const user = await this.findByIdWithRoles(id);
    if (!user) throw new NotFoundException('User tidak ditemukan.');
    return this.sanitize(user);
  }

  /** Generate temporary password aman (12 char, ada huruf+angka). */
  generateTempPassword(): string {
    const alphabet =
      'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    let out = '';
    // Math.random cukup untuk temporary password yang langsung diganti user;
    // bukan token keamanan jangka panjang (lihat Usulan Tambahan invite-link).
    for (let i = 0; i < 12; i += 1) {
      out += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return out;
  }

  /** Buat akun manual (staf/tutor) + assign role awal dalam 1 transaksi. */
  async createUser(dto: CreateUserDto) {
    const clash = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (clash) throw new ConflictException('Email sudah dipakai akun lain.');
    const roleIds = [...new Set(dto.roleIds ?? [])];
    if (roleIds.length > 0) {
      const n = await this.prisma.role.count({
        where: { id: { in: roleIds } },
      });
      if (n !== roleIds.length) {
        throw new BadRequestException('Salah satu role tidak ditemukan.');
      }
    }
    const passwordHash = await bcrypt.hash(dto.tempPassword, PASSWORD_SALT_ROUNDS);
    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email,
          name: dto.name,
          phone: dto.phone,
          passwordHash,
          // Dibuat admin — dianggap terpercaya, tanpa verifikasi OTP.
          phoneVerifiedAt: new Date(),
        },
      });
      if (roleIds.length > 0) {
        await tx.userRole.createMany({
          data: roleIds.map((roleId) => ({ userId: user.id, roleId })),
          skipDuplicates: true,
        });
        // Role person (SISWA/ORANG_TUA/TUTOR) butuh baris profil domain —
        // tanpa ini akun ortu/siswa/tutor yang dibuat dari Manajemen Akun
        // tidak punya profil dan tidak berfungsi.
        const roles = await tx.role.findMany({
          where: { id: { in: roleIds } },
          select: { name: true },
        });
        for (const r of roles) {
          await this.ensurePersonProfile(tx, user.id, r.name);
        }
      }
      return tx.user.findUniqueOrThrow({
        where: { id: user.id },
        include: {
          userRoles: {
            include: {
              role: {
                include: {
                  rolePermissions: { include: { permission: true } },
                },
              },
            },
          },
        },
      });
    });
    return this.sanitize(created);
  }

  async updateUser(id: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User tidak ditemukan.');
    if (dto.email && dto.email !== user.email) {
      const clash = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (clash) throw new ConflictException('Email sudah dipakai akun lain.');
    }
    if (dto.phone && dto.phone !== user.phone) {
      const phoneTaken = await this.prisma.user.findFirst({
        where: {
          phone: { in: UsersService.phoneVariants(dto.phone) },
          isActive: true,
          id: { not: id },
        },
        select: { id: true },
      });
      if (phoneTaken) {
        throw new ConflictException(
          'Nomor HP sudah dipakai akun aktif lain.',
        );
      }
    }
    // Email dikosongkan saat edit → pakai placeholder dari nomor HP agar
    // kolom unik `users.email` tetap terisi (bukan string kosong).
    const resolvedEmail =
      dto.email === ''
        ? `wa.${(dto.phone ?? user.phone ?? '').replace(/\D/g, '') || user.id}@hp.bimbel.local`
        : dto.email;
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(resolvedEmail !== undefined ? { email: resolvedEmail } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: { include: { permission: true } },
              },
            },
          },
        },
      },
    });
    return this.sanitize(updated);
  }

  /** Nonaktifkan akun: data tetap ada, login ditolak (cek isActive di auth). */
  async deactivateUser(id: string) {
    return this.updateUser(id, { isActive: false });
  }

  async activateUser(id: string) {
    return this.updateUser(id, { isActive: true });
  }

  /**
   * Hapus akun — soft delete + anonimisasi. User berelasi ke banyak tabel
   * (audit log, invoice, absensi, dsb.) sehingga hard-delete bisa merusak
   * jejak data. Yang dilakukan: nonaktifkan, bebaskan email & no HP (supaya
   * bisa dipakai daftar ulang), ganti password acak, cabut sesi & role.
   */
  async deleteUser(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User tidak ditemukan.');
    if (user.email.endsWith('@deleted.local')) {
      throw new BadRequestException('Akun ini sudah dihapus.');
    }
    const anonymizedEmail = `deleted+${id}@deleted.local`;
    const deadPassword = await bcrypt.hash(randomUUID(), PASSWORD_SALT_ROUNDS);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: {
          isActive: false,
          email: anonymizedEmail,
          phone: null,
          avatarUrl: null,
          passwordHash: deadPassword,
        },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.passwordResetToken.deleteMany({ where: { userId: id } }),
      this.prisma.userRole.deleteMany({ where: { userId: id } }),
    ]);
    return { success: true as const };
  }

  async resetPassword(id: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User tidak ditemukan.');
    const passwordHash = await bcrypt.hash(newPassword, PASSWORD_SALT_ROUNDS);
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash },
    });
    // Revoke semua refresh token aktif supaya sesi lama tidak bisa dipakai lagi.
    await this.prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { success: true as const };
  }

  /**
 * Dipakai ulang Fase 1a saat Admin membuat Parent/Tutor/Student:
 * buat User + assign 1 role dalam transaksi, kembalikan tempPassword
 * (plaintext, hanya sekali — jangan disimpan/log).
 */
  async createUserForPerson(input: CreateUserForPersonInput) {
    if (!Object.values(ROLE_NAMES).includes(input.roleName)) {
      throw new BadRequestException('Role tidak dikenal.');
    }
    const tempPassword = input.tempPassword ?? this.generateTempPassword();
    return this.prisma.$transaction((tx) =>
      this.createUserForPersonInTx(tx, { ...input, tempPassword }),
    );
  }

  /**
   * Varian transaksional dari createUserForPerson() untuk dipakai DI DALAM
   * transaksi milik modul people (Fase 1a): pembuatan User+Role dan profil
   * Student/Parent/Tutor harus atomik (tidak ada profil yatim tanpa akun,
   * atau sebaliknya). `tx` adalah client transaksi Prisma dari pemanggil.
   */
  async createUserForPersonInTx(
    tx: Prisma.TransactionClient,
    input: CreateUserForPersonInput,
  ) {
    if (!Object.values(ROLE_NAMES).includes(input.roleName)) {
      throw new BadRequestException('Role tidak dikenal.');
    }
    const tempPassword = input.tempPassword ?? this.generateTempPassword();
    const clash = await tx.user.findUnique({
      where: { email: input.email },
    });
    if (clash) throw new ConflictException('Email sudah dipakai akun lain.');
    // No HP dipakai untuk login — tolak bila sudah dimiliki akun AKTIF
    // (akun nonaktif dengan nomor sama tetap boleh, login sudah disaring).
    if (input.phone) {
      const phoneTaken = await tx.user.findFirst({
        where: {
          phone: { in: UsersService.phoneVariants(input.phone) },
          isActive: true,
        },
        select: { id: true },
      });
      if (phoneTaken) {
        throw new ConflictException(
          'Nomor HP sudah dipakai akun aktif lain. Nonaktifkan/ubah nomor akun lama dulu.',
        );
      }
    }
    const role = await tx.role.findUnique({
      where: { name: input.roleName },
    });
    if (!role) {
      throw new BadRequestException(`Role ${input.roleName} belum di-seed.`);
    }
    const passwordHash = await bcrypt.hash(tempPassword, PASSWORD_SALT_ROUNDS);
    const user = await tx.user.create({
      data: {
        email: input.email,
        name: input.name,
        phone: input.phone,
        passwordHash,
        // Akun yang dibuat dari jalur terpercaya (admin/ortu) langsung
        // dianggap terverifikasi; daftar-mandiri lewat OTP WhatsApp.
        phoneVerifiedAt:
          input.phoneVerified === false ? null : new Date(),
      },
    });
    await tx.userRole.create({ data: { userId: user.id, roleId: role.id } });
    return { userId: user.id, email: user.email, tempPassword };
  }
}
