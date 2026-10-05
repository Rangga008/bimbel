import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationEventsService } from '../notifications/notification-events.service';
import { SettingsService } from '../settings/settings.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';

const invoiceStudentSelect = {
  id: true,
  user: { select: { id: true, name: true, email: true, avatarUrl: true } },
  parentStudents: {
    select: { parent: { select: { user: { select: { name: true } } } } },
    take: 2,
  },
} as const;

/** Konteks program/jenjang/kelompok dari pendaftaran yang menautkan invoice. */
const invoiceEnrollmentSelect = {
  program: { select: { id: true, name: true } },
  level: { select: { name: true } },
  group: { select: { name: true } },
} as const;

export const invoiceDetailInclude = {
  student: { select: invoiceStudentSelect },
  package: {
    select: {
      id: true,
      name: true,
      code: true,
      totalSessions: true,
      price: true,
      level: {
        select: {
          id: true,
          name: true,
          program: { select: { id: true, name: true, code: true } },
        },
      },
    },
  },
  enrollmentLink: { select: invoiceEnrollmentSelect },
  enrollment: { select: invoiceEnrollmentSelect },
  items: { orderBy: { createdAt: 'asc' as const } },
} as const;

const invoiceListInclude = {
  student: { select: invoiceStudentSelect },
  package: { select: { id: true, name: true, code: true, price: true } },
  enrollmentLink: { select: invoiceEnrollmentSelect },
  enrollment: { select: invoiceEnrollmentSelect },
  _count: { select: { items: true } },
} as const;

/**
 * Fase 2a — CRUD Invoice saja (tanpa logic pembayaran/verifikasi — itu 2b).
 * - Dari Package: item auto-generate dari harga paket (saat siswa daftar paket).
 * - Manual: custom items. Terbit DRAFT→ISSUED, batal →VOID (tanpa hard-delete).
 */
@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: NotificationEventsService,
    private readonly settings: SettingsService,
  ) {}

  private prefix(now = new Date()) {
    return `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-`;
  }

  /** Nomor unik `INV-YYYYMM-XXXX` (counter per bulan + retry anti-race). */
  private async generateNumber(tx: Prisma.TransactionClient): Promise<string> {
    const prefix = this.prefix();
    for (let i = 0; i < 20; i += 1) {
      const last = await tx.invoice.findFirst({
        where: { number: { startsWith: prefix } },
        orderBy: { number: 'desc' },
        select: { number: true },
      });
      const seq = last
        ? (Number(last.number.slice(prefix.length)) || 0) + 1
        : 1;
      const candidate = `${prefix}${String(seq).padStart(4, '0')}`;
      const clash = await tx.invoice.findUnique({
        where: { number: candidate },
      });
      if (!clash) return candidate;
    }
    return `${prefix}${String(Date.now()).slice(-4)}`;
  }

  /**
   * Status turunan dari angka (bukan field DB): invoice ISSUED yang sudah
   * lunas (amountPaid >= totalAmount) tampil PAID; yang lewat jatuh tempo
   * dan masih outstanding tampil OVERDUE. Dipakai filter & badge list.
   */
  private displayStatusOf(inv: { status: string; totalAmount: unknown; amountPaid: unknown; dueDate: Date | null }) {
    if (inv.status !== 'ISSUED') return inv.status;
    const outstanding = Number(inv.totalAmount) - Number(inv.amountPaid);
    if (outstanding <= 0.009) return 'PAID';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (inv.dueDate && new Date(inv.dueDate) < today) return 'OVERDUE';
    return 'ISSUED';
  }

  async list(query: { search?: string; status?: string; studentId?: string; programId?: string; levelId?: string }) {
    const where: Record<string, unknown> = {};
    if (query.studentId) where.studentId = query.studentId;
    // Filter program/jenjang via paket ATAU enrollment — invoice pendaftaran
    // tertaut lewat enrollment/enrollmentLink, bukan packageId.
    if (query.levelId || query.programId) {
      const enr: Record<string, unknown> = {};
      if (query.levelId) enr.levelId = query.levelId;
      if (query.programId) enr.programId = query.programId;
      where.AND = [
        {
          OR: [
            {
              package: {
                level: {
                  ...(query.levelId ? { id: query.levelId } : {}),
                  ...(query.programId ? { programId: query.programId } : {}),
                },
              },
            },
            { enrollmentLink: enr },
            { enrollment: enr },
          ],
        },
      ];
    }
    // PAID/OVERDUE adalah status turunan dari baris ISSUED — difilter
    // setelah fetch karena butuh perbandingan amountPaid vs totalAmount.
    let derivedFilter: string | null = null;
    if (query.status) {
      const s = query.status.toUpperCase();
      if (['DRAFT', 'VOID'].includes(s)) {
        where.status = s;
      } else if (['ISSUED', 'PAID', 'OVERDUE'].includes(s)) {
        where.status = 'ISSUED';
        derivedFilter = s;
      } else {
        throw new BadRequestException(
          'Status tidak valid (DRAFT/ISSUED/OVERDUE/PAID/VOID).',
        );
      }
    }
    if (query.search) {
      where.OR = [
        { number: { contains: query.search, mode: 'insensitive' } },
        {
          student: {
            user: { name: { contains: query.search, mode: 'insensitive' } },
          },
        },
        {
          student: {
            parentStudents: {
              some: {
                parent: {
                  user: { name: { contains: query.search, mode: 'insensitive' } },
                },
              },
            },
          },
        },
      ];
    }
    const rows = await this.prisma.invoice.findMany({
      where,
      include: invoiceListInclude,
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    const mapped = rows.map((inv) => ({
      ...inv,
      displayStatus: this.displayStatusOf(inv),
    }));
    return derivedFilter
      ? mapped.filter((inv) => inv.displayStatus === derivedFilter)
      : mapped;
  }

  async get(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: invoiceDetailInclude,
    });
    if (!invoice) throw new NotFoundException('Invoice tidak ditemukan.');
    return { ...invoice, displayStatus: this.displayStatusOf(invoice) };
  }

  /**
   * Buat invoice dari Package: item utama auto-generate dari harga paket.
   * `price` opsional meng-override harga paket (diskon/harga kesepakatan);
   * `extraItems` menambah potongan (negatif) atau biaya lain (biaya admin dsb).
   */
  async createFromPackage(dto: {
    studentId: string;
    packageId: string;
    price?: number;
    extraItems?: { description: string; quantity?: number; unitPrice: number }[];
    dueDate?: string;
    notes?: string;
  }) {
    const [student, pkg] = await Promise.all([
      this.prisma.student.findUnique({ where: { id: dto.studentId } }),
      this.prisma.package.findUnique({ where: { id: dto.packageId } }),
    ]);
    if (!student) throw new NotFoundException('Data siswa tidak ditemukan.');
    if (!student.isActive) {
      throw new BadRequestException(
        'Siswa nonaktif — aktifkan dulu sebelum dibuatkan invoice.',
      );
    }
    if (!pkg) throw new NotFoundException('Paket tidak ditemukan.');
    if (!pkg.isActive)
      throw new BadRequestException('Paket nonaktif — pilih paket aktif.');
    const hasOverride = dto.price !== undefined && dto.price !== null;
    if (!hasOverride && (pkg.price === null || pkg.price === undefined)) {
      throw new BadRequestException(
        'Paket ini belum punya harga — isi harga paket dulu.',
      );
    }
    const label = pkg.code ? `${pkg.name} (${pkg.code})` : pkg.name;
    const rows = [
      {
        description: `Biaya paket ${label} — ${pkg.totalSessions} sesi`,
        quantity: 1,
        unitPrice: new Prisma.Decimal(
          hasOverride ? String(dto.price) : pkg.price!.toString(),
        ),
      },
      ...(dto.extraItems ?? []).map((it) => ({
        description: it.description,
        quantity: it.quantity ?? 1,
        unitPrice: new Prisma.Decimal(String(it.unitPrice)),
      })),
    ].map((r) => ({ ...r, amount: r.unitPrice.mul(r.quantity) }));
    const total = rows.reduce(
      (acc, r) => acc.add(r.amount),
      new Prisma.Decimal(0),
    );
    if (total.lt(0)) {
      throw new BadRequestException(
        'Total invoice tidak boleh negatif — kurangi potongan/item tambahan.',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const number = await this.generateNumber(tx);
      return tx.invoice.create({
        data: {
          number,
          studentId: dto.studentId,
          packageId: dto.packageId,
          status: 'DRAFT',
          totalAmount: total,
          amountPaid: new Prisma.Decimal(0),
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
          notes: dto.notes,
          items: { create: rows },
        },
        include: invoiceDetailInclude,
      });
    });
  }

  /** Buat invoice: mode paket (packageId) ATAU mode manual (items). Salah satu wajib. */
  async create(dto: CreateInvoiceDto) {
    if (dto.packageId)
      return this.createFromPackage(
        dto as {
          studentId: string;
          packageId: string;
          price?: number;
          extraItems?: {
            description: string;
            quantity?: number;
            unitPrice: number;
          }[];
          dueDate?: string;
          notes?: string;
        },
      );
    const items = dto.items ?? [];
    if (items.length === 0) {
      throw new BadRequestException(
        'Isi packageId (invoice dari paket) atau items (invoice manual).',
      );
    }
    const student = await this.prisma.student.findUnique({
      where: { id: dto.studentId },
    });
    if (!student) throw new NotFoundException('Data siswa tidak ditemukan.');
    if (!student.isActive) {
      throw new BadRequestException(
        'Siswa nonaktif — aktifkan dulu sebelum dibuatkan invoice.',
      );
    }
    const rows = items.map((it) => {
      const qty = it.quantity ?? 1;
      const unit = new Prisma.Decimal(String(it.unitPrice));
      return {
        description: it.description,
        quantity: qty,
        unitPrice: unit,
        amount: unit.mul(qty),
      };
    });
    const total = rows.reduce(
      (acc, r) => acc.add(r.amount),
      new Prisma.Decimal(0),
    );
    return this.prisma.$transaction(async (tx) => {
      const number = await this.generateNumber(tx);
      return tx.invoice.create({
        data: {
          number,
          studentId: dto.studentId,
          status: 'DRAFT',
          totalAmount: total,
          amountPaid: new Prisma.Decimal(0),
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
          notes: dto.notes,
          items: { create: rows },
        },
        include: invoiceDetailInclude,
      });
    });
  }

  /** DRAFT → ISSUED. Status lunas/cicilan menyusul Fase 2b/2c. */
  async issue(id: string, dto: { dueDate?: string }) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException('Invoice tidak ditemukan.');
    if (invoice.status === 'VOID')
      throw new BadRequestException(
        'Invoice yang dibatalkan tidak bisa diterbitkan.',
      );
    if (invoice.status === 'ISSUED') return this.get(id);
    // Jatuh tempo: dto > dueDate yang sudah ada > default finance.invoiceDueDays
    // (Pengaturan -> Keuangan). invoiceDueDays=0 artinya tempo = tanggal terbit.
    const finance = await this.settings.get('finance');
    const issuedAt = new Date();
    const fallbackDue = new Date(issuedAt);
    fallbackDue.setDate(fallbackDue.getDate() + finance.invoiceDueDays);
    const updated = await this.prisma.invoice.update({
      where: { id },
      data: {
        status: 'ISSUED',
        issuedAt,
        dueDate: dto.dueDate
          ? new Date(dto.dueDate)
          : (invoice.dueDate ?? fallbackDue),
      },
      include: invoiceDetailInclude,
    });
    // Fase 5b: event "invoice baru" -> notif ortu+siswa + WA outbox.
    await this.events.invoiceIssued(id);
    return updated;
  }

  /**
   * Batalkan invoice (→VOID). BUKAN hard-delete: transaksi finance tidak
   * boleh dihapus (02-finance.md). Ditolak bila sudah ada alokasi payment.
   */
  async void(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { allocations: { select: { id: true } } },
    });
    if (!invoice) throw new NotFoundException('Invoice tidak ditemukan.');
    if (invoice.status === 'VOID') return this.get(id);
    if (invoice.allocations.length > 0) {
      throw new BadRequestException(
        'Invoice ini sudah ada alokasi pembayaran — pembatalan ditolak.',
      );
    }
    return this.prisma.invoice.update({
      where: { id },
      data: { status: 'VOID', voidedAt: new Date() },
      include: invoiceDetailInclude,
    });
  }

  listAccounts() {
    return this.prisma.financialAccount.findMany({ orderBy: { name: 'asc' } });
  }

  /** Tambah akun kas/bank (Pengaturan > Akun Kas/Bank). */
  async createAccount(dto: { name: string; code?: string; type?: string }) {
    const name = dto.name?.trim();
    if (!name) throw new BadRequestException('Nama akun wajib diisi.');
    const type = (dto.type ?? 'CASH').toUpperCase();
    if (!['CASH', 'BANK'].includes(type)) {
      throw new BadRequestException('Tipe akun tidak valid (CASH/BANK).');
    }
    const code = dto.code?.trim().toUpperCase() || null;
    if (code) {
      const clash = await this.prisma.financialAccount.findUnique({
        where: { code },
      });
      if (clash) throw new BadRequestException(`Kode ${code} sudah dipakai.`);
    }
    return this.prisma.financialAccount.create({
      data: { name, code, type },
    });
  }

  /** Ubah akun kas/bank (nama/kode/tipe/status aktif). */
  async updateAccount(
    id: string,
    dto: { name?: string; code?: string | null; type?: string; isActive?: boolean },
  ) {
    const account = await this.prisma.financialAccount.findUnique({
      where: { id },
    });
    if (!account) throw new NotFoundException('Akun kas/bank tidak ditemukan.');
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('Nama akun tidak boleh kosong.');
      data.name = name;
    }
    if (dto.type !== undefined) {
      const type = dto.type.toUpperCase();
      if (!['CASH', 'BANK'].includes(type)) {
        throw new BadRequestException('Tipe akun tidak valid (CASH/BANK).');
      }
      data.type = type;
    }
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.code !== undefined) {
      const code = dto.code?.trim().toUpperCase() || null;
      if (code && code !== account.code) {
        const clash = await this.prisma.financialAccount.findUnique({
          where: { code },
        });
        if (clash) throw new BadRequestException(`Kode ${code} sudah dipakai.`);
      }
      data.code = code;
    }
    return this.prisma.financialAccount.update({ where: { id }, data });
  }

  /**
   * Hapus akun kas/bank. Ditolak bila akun sudah dipakai di transaksi
   * (payment/refund/ledger/expense/payroll) — gunakan nonaktifkan saja.
   */
  async deleteAccount(id: string) {
    const account = await this.prisma.financialAccount.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            payments: true,
            refunds: true,
            ledgerEntries: true,
            expenses: true,
            payrollRuns: true,
          },
        },
      },
    });
    if (!account) throw new NotFoundException('Akun kas/bank tidak ditemukan.');
    const refs =
      account._count.payments +
      account._count.refunds +
      account._count.ledgerEntries +
      account._count.expenses +
      account._count.payrollRuns;
    if (refs > 0) {
      throw new BadRequestException(
        `Akun "${account.name}" sudah dipakai di ${refs} transaksi — nonaktifkan saja, jangan dihapus.`,
      );
    }
    return this.prisma.financialAccount.delete({ where: { id } });
  }
}
