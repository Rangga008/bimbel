import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { ROLE_NAMES } from '../rbac/permissions.constants';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import {
  CreateEnrollmentDto,
  PlaceEnrollmentDto,
  ReviewEnrollmentDto,
} from './dto/enrollment.dto';

const enrollmentInclude = {
  student: {
    select: {
      id: true,
      isActive: true,
      user: { select: { id: true, name: true, email: true, isActive: true } },
    },
  },
  parent: {
    select: {
      id: true,
      user: { select: { id: true, name: true, email: true, phone: true } },
    },
  },
  program: {
    select: {
      id: true,
      name: true,
      code: true,
      category: true,
      registrationFee: true,
    },
  },
  level: {
    select: {
      id: true,
      name: true,
      price: true,
      priceUnit: true,
      fullPayPrice: true,
      installment2x: true,
      monthlyAmount: true,
      monthlyCount: true,
      promoPrice: true,
      sessionPrices: true,
      sessionDurationMin: true,
      registrationFee: true,
      gradeLevel: { select: { id: true, code: true, name: true } },
    },
  },
  group: {
    select: { id: true, name: true, code: true },
  },
  invoices: {
    select: {
      id: true,
      number: true,
      status: true,
      totalAmount: true,
      amountPaid: true,
      dueDate: true,
    },
    orderBy: { dueDate: 'asc' as const },
  },
  invoice: {
    select: {
      id: true,
      number: true,
      status: true,
      totalAmount: true,
      amountPaid: true,
      dueDate: true,
      items: {
        select: { description: true, quantity: true, unitPrice: true, amount: true },
      },
    },
  },
  reviewedBy: { select: { id: true, name: true } },
} as const;

/**
 * Alur pendaftaran siswa self-service:
 * PENDING_PAYMENT → PAID (invoice lunas) → ACCEPTED (verifikasi finance,
 * akun siswa diaktifkan) → PLACED (ditempatkan ke kelompok oleh academic).
 * REJECTED = ditolak finance.
 */
@Injectable()
export class EnrollmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  private async myParentOrThrow(userId: string) {
    const parent = await this.prisma.parent.findUnique({
      where: { userId },
      select: { id: true, isActive: true },
    });
    if (!parent || !parent.isActive) {
      throw new ForbiddenException('Fitur ini khusus akun orang tua.');
    }
    return parent;
  }

  private async generateInvoiceNumber(tx: Prisma.TransactionClient) {
    const now = new Date();
    const prefix = `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-`;
    for (let i = 0; i < 20; i += 1) {
      const last = await tx.invoice.findFirst({
        where: { number: { startsWith: prefix } },
        orderBy: { number: 'desc' },
        select: { number: true },
      });
      const seq = last ? (Number(last.number.slice(prefix.length)) || 0) + 1 : 1;
      const candidate = `${prefix}${String(seq).padStart(4, '0')}`;
      const clash = await tx.invoice.findUnique({ where: { number: candidate } });
      if (!clash) return candidate;
    }
    return `${prefix}${String(Date.now()).slice(-4)}`;
  }

  /**
   * Ortu: daftarkan anak → akun siswa nonaktif + invoice pendaftaran.
   * Cara bayar sesuai brosur:
   * - Reguler: FULL (lunas di awal) / TWO_TIMES (2x) / MONTHLY (9-10x) —
   *   seluruh invoice cicilan langsung dibuat berjadwal.
   * - Extra: per bulan; harga promo bila anak sudah ikut kelas reguler.
   * - Privat: per pertemuan dibayar di awal, harga menurut jumlah siswa.
   */
  async create(actor: AuthenticatedUser, dto: CreateEnrollmentDto) {
    const parent = await this.myParentOrThrow(actor.id);

    const [program, level] = await Promise.all([
      this.prisma.program.findUnique({ where: { id: dto.programId } }),
      this.prisma.level.findUnique({ where: { id: dto.levelId } }),
    ]);
    if (!program || !program.isActive) {
      throw new BadRequestException('Program tidak ditemukan atau nonaktif.');
    }
    if (!level || !level.isActive || level.programId !== program.id) {
      throw new BadRequestException('Jenjang tidak valid untuk program ini.');
    }

    const regFee = level.registrationFee
      ? Number(level.registrationFee)
      : program.registrationFee
        ? Number(program.registrationFee)
        : 0;
    const basePrice = level.price ? Number(level.price) : 0;
    if (regFee + basePrice <= 0) {
      throw new BadRequestException(
        'Harga pendaftaran untuk jenjang ini belum diatur — hubungi admin.',
      );
    }

    const childName = dto.childName.trim();
    const activeStatuses = ['PENDING_PAYMENT', 'PAID', 'ACCEPTED', 'PLACED'] as const;

    // Anak yang sudah ada (untuk program kedua, mis. reguler + extra promo).
    let existingStudent: { id: string; name: string } | null = null;
    if (dto.existingStudentId) {
      const link = await this.prisma.parentStudent.findFirst({
        where: { parentId: parent.id, studentId: dto.existingStudentId },
        select: {
          student: { select: { id: true, user: { select: { name: true } } } },
        },
      });
      if (!link) {
        throw new BadRequestException('Anak tidak ditemukan pada akun Anda.');
      }
      existingStudent = { id: link.student.id, name: link.student.user.name };
    }

    // Cegah pendaftaran dobel pada program yang sama.
    const dup = await this.prisma.enrollment.findFirst({
      where: {
        parentId: parent.id,
        programId: program.id,
        status: { in: [...activeStatuses] },
        ...(existingStudent
          ? { studentId: existingStudent.id }
          : { childName: { equals: childName, mode: 'insensitive' as const } }),
      },
    });
    if (dup) {
      throw new ConflictException(
        `Anak "${existingStudent?.name ?? childName}" sudah terdaftar di ${program.name} — cek status pendaftaran sebelumnya.`,
      );
    }

    // Susun jadwal tagihan sesuai cara bayar.
    const plans = this.buildInvoiceSchedule(program, level, dto, regFee, basePrice);
    if (program.category === 'EXTRA' && level.promoPrice && Number(level.promoPrice) < basePrice) {
      // Promo extra: anak sudah/akan ikut kelas reguler.
      const hasReguler = await this.prisma.enrollment.count({
        where: {
          parentId: parent.id,
          status: { in: ['PAID', 'ACCEPTED', 'PLACED'] },
          program: { category: 'REGULER' },
          ...(existingStudent
            ? { studentId: existingStudent.id }
            : { childName: { equals: childName, mode: 'insensitive' as const } }),
        },
      });
      if (hasReguler > 0) {
        const promo = Number(level.promoPrice);
        for (const inv of plans) {
          for (const item of inv.items) {
            if (item.description.startsWith('Biaya Les')) {
              item.unitPrice = promo;
              item.amount = promo * item.quantity;
              item.description += ' (promo ikut kelas reguler)';
            }
          }
        }
      }
    }

    return this.prisma.$transaction(async (tx) => {
      let studentId: string;
      if (existingStudent) {
        studentId = existingStudent.id;
      } else {
        // Akun siswa dibuat nonaktif — baru bisa login setelah finance
        // memverifikasi pendaftaran (ACCEPTED).
        const suffix = randomBytes(4).toString('hex');
        const created = await this.users.createUserForPersonInTx(tx, {
          email: `siswa.${suffix}@pendaftaran.bimbel.local`,
          name: childName,
          roleName: ROLE_NAMES.SISWA,
          tempPassword: randomBytes(9).toString('base64url'),
        });
        await tx.user.update({
          where: { id: created.userId },
          data: { isActive: false },
        });
        const student = await tx.student.create({
          data: {
            userId: created.userId,
            isActive: false,
            dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
            schoolOrigin: dto.schoolOrigin?.trim() || null,
            gender: dto.gender ?? null,
          },
        });
        await tx.parentStudent.create({
          data: { parentId: parent.id, studentId: student.id },
        });
        studentId = student.id;
      }

      const enrollment = await tx.enrollment.create({
        data: {
          parentId: parent.id,
          studentId,
          programId: program.id,
          levelId: level.id,
          childName: existingStudent?.name ?? childName,
          paymentPlan: program.category === 'REGULER' ? (dto.paymentPlan ?? 'MONTHLY') : null,
          studentCount: dto.studentCount ?? null,
          sessionCount: dto.sessionCount ?? null,
        },
      });

      // Buat seluruh invoice berjadwal — invoice pertama = biaya daftar +
      // tagihan pertama, sisanya cicilan sesuai cara bayar.
      let firstInvoiceId: string | null = null;
      for (const [idx, plan] of plans.entries()) {
        const total = plan.items.reduce((s, i) => s + i.amount, 0);
        const dueDate = new Date(Date.now() + (idx === 0 ? 7 : 0) * 24 * 60 * 60 * 1000);
        if (idx > 0) {
          dueDate.setMonth(dueDate.getMonth() + plan.dueOffsetMonths);
        }
        const inv = await tx.invoice.create({
          data: {
            number: await this.generateInvoiceNumber(tx),
            studentId,
            enrollmentId: enrollment.id,
            status: 'ISSUED',
            totalAmount: new Prisma.Decimal(total),
            dueDate,
            issuedAt: new Date(),
            notes: `Pendaftaran ${enrollment.childName} — ${program.name} / ${level.name} (${plan.label})`,
            items: { create: plan.items },
          },
        });
        if (idx === 0) firstInvoiceId = inv.id;
      }

      return tx.enrollment.update({
        where: { id: enrollment.id },
        data: { invoiceId: firstInvoiceId },
        include: enrollmentInclude,
      });
    });
  }

  /**
   * Susun jadwal invoice dari cara bayar — mengembalikan array item invoice
   * beserta offset bulan jatuh tempo untuk cicilan.
   */
  private buildInvoiceSchedule(
    program: { name: string; category: string },
    level: {
      name: string;
      priceUnit: string | null;
      fullPayPrice: unknown;
      installment2x: unknown;
      monthlyAmount: unknown;
      monthlyCount: number | null;
      sessionPrices: unknown;
      price: unknown;
    },
    dto: CreateEnrollmentDto,
    regFee: number,
    basePrice: number,
  ) {
    const num = (v: unknown) => (v !== null && v !== undefined ? Number(v) : 0);
    const regItem =
      regFee > 0
        ? [
            {
              description: `Biaya Pendaftaran — ${program.name}`,
              quantity: 1,
              unitPrice: regFee,
              amount: regFee,
            },
          ]
        : [];
    type Item = { description: string; quantity: number; unitPrice: number; amount: number };
    type Plan = { label: string; dueOffsetMonths: number; items: Item[] };

    if (program.category === 'REGULER' || level.priceUnit === 'YEAR') {
      const plan = dto.paymentPlan ?? 'MONTHLY';
      if (plan === 'FULL') {
        const price = num(level.fullPayPrice) || basePrice;
        return [
          {
            label: 'lunas di awal',
            dueOffsetMonths: 0,
            items: [
              ...regItem,
              {
                description: `Biaya Les 1 Tahun Ajaran (lunas di awal) — ${level.name} (${program.name})`,
                quantity: 1,
                unitPrice: price,
                amount: price,
              },
            ],
          },
        ] as Plan[];
      }
      if (plan === 'TWO_TIMES') {
        const each = num(level.installment2x) || Math.round(basePrice / 2);
        return [0, 1].map((i) => ({
          label: `angsuran ${i + 1} dari 2`,
          dueOffsetMonths: i,
          items: [
            ...(i === 0 ? regItem : []),
            {
              description: `Angsuran ${i + 1}/2 — ${level.name} (${program.name})`,
              quantity: 1,
              unitPrice: each,
              amount: each,
            },
          ],
        })) as Plan[];
      }
      const count = level.monthlyCount && level.monthlyCount > 0 ? level.monthlyCount : 10;
      const each = num(level.monthlyAmount) || Math.round(basePrice / count);
      return Array.from({ length: count }, (_, i) => ({
        label: `angsuran bulan ${i + 1} dari ${count}`,
        dueOffsetMonths: i,
        items: [
          ...(i === 0 ? regItem : []),
          {
            description: `Angsuran bulan ${i + 1}/${count} — ${level.name} (${program.name})`,
            quantity: 1,
            unitPrice: each,
            amount: each,
          },
        ],
      })) as Plan[];
    }

    if (level.priceUnit === 'SESSION') {
      // Privat: bayar di awal; harga menurut jumlah siswa dalam kelas privat.
      const studentCount = Math.min(Math.max(dto.studentCount ?? 1, 1), 5);
      const sessionCount = Math.min(Math.max(dto.sessionCount ?? 8, 1), 48);
      const tiers = (level.sessionPrices ?? {}) as Record<string, number>;
      const perSession =
        studentCount > 1 && tiers[String(studentCount)]
          ? Number(tiers[String(studentCount)])
          : basePrice;
      return [
        {
          label: `${sessionCount} pertemuan privat (${studentCount} siswa)`,
          dueOffsetMonths: 0,
          items: [
            ...regItem,
            {
              description: `Biaya Les Privat ${sessionCount} pertemuan (${studentCount} siswa) — ${level.name} (${program.name})`,
              quantity: sessionCount,
              unitPrice: perSession,
              amount: perSession * sessionCount,
            },
          ],
        },
      ] as Plan[];
    }

    // Extra (per bulan) & paket lama: invoice pertama saja.
    const unitLabel =
      level.priceUnit === 'PACKAGE' ? 'paket pertama' : 'bulan pertama';
    return [
      {
        label: unitLabel,
        dueOffsetMonths: 0,
        items: [
          ...regItem,
          {
            description: `Biaya Les ${unitLabel} — ${level.name} (${program.name})`,
            quantity: 1,
            unitPrice: basePrice,
            amount: basePrice,
          },
        ],
      },
    ] as Plan[];
  }

  /** Ortu: daftar pendaftaran miliknya. */
  async mine(actor: AuthenticatedUser) {
    const parent = await this.myParentOrThrow(actor.id);
    return this.prisma.enrollment.findMany({
      where: { parentId: parent.id },
      include: enrollmentInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Ortu: daftar anak yang tertaut ke akunnya. */
  async myChildren(actor: AuthenticatedUser) {
    const parent = await this.myParentOrThrow(actor.id);
    const links = await this.prisma.parentStudent.findMany({
      where: { parentId: parent.id },
      select: {
        student: {
          select: {
            id: true,
            isActive: true,
            user: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    return links.map((l) => ({
      id: l.student.id,
      name: l.student.user.name,
      isActive: l.student.isActive,
    }));
  }

  /**
   * Ortu menghapus data anak sendiri — hanya bila anak belum punya jejak
   * bisnis: semua pendaftaran masih PENDING_PAYMENT/REJECTED, belum ada
   * tagihan yang dibayar, belum masuk kelompok, dan belum ada absensi.
   * Bila sudah ada jejak → 400, diarahkan hubungi admin (data keuangan &
   * akademik tidak boleh dihapus mandiri).
   */
  async removeChild(actor: AuthenticatedUser, studentId: string) {
    const parent = await this.myParentOrThrow(actor.id);
    const link = await this.prisma.parentStudent.findUnique({
      where: { parentId_studentId: { parentId: parent.id, studentId } },
      select: { student: { select: { id: true, userId: true, user: { select: { name: true } } } } },
    });
    if (!link) {
      throw new NotFoundException('Anak tidak ditemukan di akun Anda.');
    }
    const enrollments = await this.prisma.enrollment.findMany({
      where: { studentId },
      include: {
        invoice: { select: { id: true, amountPaid: true } },
        invoices: { select: { id: true, amountPaid: true } },
      },
    });
    if (
      enrollments.some((e) =>
        ['PAID', 'ACCEPTED', 'PLACED'].includes(e.status),
      )
    ) {
      throw new BadRequestException(
        'Pendaftaran anak sudah diproses — hubungi admin untuk pembatalan.',
      );
    }
    const invoiceIds = [
      ...new Set(
        enrollments.flatMap((e) =>
          [e.invoice, ...(e.invoices ?? [])]
            .filter((i) => i !== null && i !== undefined)
            .map((i) => i.id),
        ),
      ),
    ];
    if (invoiceIds.length) {
      const paid = await this.prisma.invoice.count({
        where: { id: { in: invoiceIds }, amountPaid: { gt: 0 } },
      });
      if (paid > 0) {
        throw new BadRequestException(
          'Ada tagihan yang sudah dibayar — hubungi admin untuk pembatalan/refund.',
        );
      }
    }
    const inGroup = await this.prisma.groupMember.count({ where: { studentId } });
    if (inGroup > 0) {
      throw new BadRequestException(
        'Anak sudah masuk kelompok — hubungi admin.',
      );
    }
    const hasAttendance = await this.prisma.attendance.count({
      where: { studentId },
    });
    if (hasAttendance > 0) {
      throw new BadRequestException(
        'Anak memiliki riwayat absensi — tidak bisa dihapus.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      if (invoiceIds.length) {
        await tx.paymentAllocation.deleteMany({
          where: { invoiceId: { in: invoiceIds } },
        });
        await tx.invoiceItem.deleteMany({
          where: { invoiceId: { in: invoiceIds } },
        });
        // enrollment.invoiceId SetNull otomatis saat invoice dihapus.
        await tx.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
      }
      await tx.enrollment.deleteMany({ where: { studentId } });
      await tx.parentStudent.deleteMany({ where: { studentId } });
      await tx.userRole.deleteMany({ where: { userId: link.student.userId } });
      // Student cascade dari User.
      await tx.user.delete({ where: { id: link.student.userId } });
    });
    return { deleted: true, name: link.student.user.name };
  }

  /** Staff (finance/academic/owner): daftar pendaftaran, filter status opsional. */
  list(query: { status?: string }) {
    const where: Record<string, unknown> = {};
    if (query.status) {
      const s = query.status.toUpperCase();
      if (
        !['PENDING_PAYMENT', 'PAID', 'ACCEPTED', 'PLACED', 'REJECTED'].includes(s)
      ) {
        throw new BadRequestException('Status pendaftaran tidak valid.');
      }
      where.status = s;
    }
    return this.prisma.enrollment.findMany({
      where,
      include: enrollmentInclude,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  private async getOrThrow(id: string) {
    const e = await this.prisma.enrollment.findUnique({
      where: { id },
      include: enrollmentInclude,
    });
    if (!e) throw new NotFoundException('Pendaftaran tidak ditemukan.');
    return e;
  }

  /** Finance: terima pendaftaran → akun siswa diaktifkan. */
  async accept(actor: AuthenticatedUser, id: string, dto: ReviewEnrollmentDto) {
    const e = await this.getOrThrow(id);
    if (e.status !== 'PAID') {
      throw new BadRequestException(
        e.status === 'PENDING_PAYMENT'
          ? 'Invoice pendaftaran belum lunas — pendaftaran belum bisa diverifikasi.'
          : `Pendaftaran berstatus ${e.status} tidak bisa diverifikasi.`,
      );
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.student.update({
        where: { id: e.studentId },
        data: { isActive: true, user: { update: { isActive: true } } },
      });
      return tx.enrollment.update({
        where: { id },
        data: {
          status: 'ACCEPTED',
          reviewedById: actor.id,
          reviewedAt: new Date(),
          notes: dto.notes ?? e.notes,
        },
        include: enrollmentInclude,
      });
    });
  }

  /** Finance: tolak pendaftaran — akun siswa tetap nonaktif. */
  async reject(actor: AuthenticatedUser, id: string, dto: ReviewEnrollmentDto) {
    const e = await this.getOrThrow(id);
    if (!['PENDING_PAYMENT', 'PAID'].includes(e.status)) {
      throw new BadRequestException(
        `Pendaftaran berstatus ${e.status} tidak bisa ditolak.`,
      );
    }
    return this.prisma.enrollment.update({
      where: { id },
      data: {
        status: 'REJECTED',
        reviewedById: actor.id,
        reviewedAt: new Date(),
        notes: dto.notes ?? e.notes,
      },
      include: enrollmentInclude,
    });
  }

  /** Academic: tempatkan siswa ke kelompok (status ACCEPTED → PLACED). */
  async place(id: string, dto: PlaceEnrollmentDto) {
    const e = await this.getOrThrow(id);
    if (e.status !== 'ACCEPTED') {
      throw new BadRequestException(
        'Hanya pendaftaran yang sudah diverifikasi finance yang bisa ditempatkan.',
      );
    }
    const group = await this.prisma.learningGroup.findUnique({
      where: { id: dto.groupId },
      include: { _count: { select: { members: true } } },
    });
    if (!group || !group.isActive) {
      throw new BadRequestException('Kelompok tidak ditemukan atau nonaktif.');
    }
    if (group.programId !== e.programId) {
      throw new BadRequestException(
        `Kelompok "${group.name}" bukan bagian dari program ${e.program.name}.`,
      );
    }
    if (group.levelId && group.levelId !== e.levelId) {
      throw new BadRequestException(
        `Kelompok "${group.name}" untuk jenjang lain — pilih kelompok jenjang ${e.level.name}.`,
      );
    }
    if (group.capacity && group._count.members >= group.capacity) {
      throw new ConflictException(`Kelompok "${group.name}" sudah penuh.`);
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.groupMember.upsert({
        where: {
          groupId_studentId: { groupId: group.id, studentId: e.studentId },
        },
        create: { groupId: group.id, studentId: e.studentId },
        update: {},
      });
      return tx.enrollment.update({
        where: { id },
        data: { status: 'PLACED', groupId: group.id },
        include: enrollmentInclude,
      });
    });
  }
}
