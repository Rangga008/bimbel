import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createHmac, randomUUID } from 'node:crypto';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationEventsService } from '../notifications/notification-events.service';
import { PERMISSION_CODES } from '../rbac/permissions.constants';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import {
  DummyGatewayProvider,
  PaymentGatewayProvider,
} from './gateway/payment-gateway.provider';
import { MidtransGatewayProvider } from './gateway/midtrans.provider';
import { SettingsService } from '../settings/settings.service';
import { receiptDetailInclude } from './receipt.includes';
import {
  CreateCashPaymentDto,
  CreateManualProofDto,
  GatewayWebhookDto,
  InitiateGatewayDto,
  SimulateGatewayDto,
} from './dto/payment.dto';

export { receiptDetailInclude };

export const paymentDetailInclude = {
  account: { select: { id: true, name: true, code: true, type: true } },
  allocations: {
    include: {
      invoice: {
        select: {
          id: true,
          number: true,
          studentId: true,
          student: {
            select: {
              id: true,
              user: { select: { id: true, name: true, email: true } },
              parentStudents: {
                select: {
                  parent: { select: { user: { select: { name: true } } } },
                },
                take: 2,
              },
            },
          },
          // Program/kelas si siswa — ditampilkan di daftar uang masuk.
          // enrollment = relasi balik invoice utama; enrollmentLink = cicilan
          // yang tertaut via invoice.enrollmentId.
          enrollmentLink: {
            select: {
              program: { select: { name: true, code: true } },
              level: { select: { name: true } },
              group: { select: { name: true } },
            },
          },
          enrollment: {
            select: {
              program: { select: { name: true, code: true } },
              level: { select: { name: true } },
              group: { select: { name: true } },
            },
          },
          items: { select: { description: true }, take: 3 },
        },
      },
    },
  },
  receipts: { orderBy: { createdAt: 'asc' as const } },
} as const;

/**
 * Fase 2b — 3 jalur pembayaran. SEMUA mutasi finansial dibungkus DB transaction.
 * - Cash: admin input → VERIFIED instan + receipt langsung.
 * - Manual: ortu upload → PENDING; admin APPROVE → VERIFIED + alokasi + receipt.
 * - Gateway dummy: initiate → PENDING; webhook valid → VERIFIED + alokasi + receipt.
 */
@Injectable()
export class PaymentsService {
  private readonly dummyGateway: DummyGatewayProvider;
  private midtransGateway: MidtransGatewayProvider | null = null;
  private midtransKey = '';

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly events: NotificationEventsService,
    private readonly settings: SettingsService,
  ) {
    this.dummyGateway = new DummyGatewayProvider(
      this.config.get<string>('PAYMENT_WEBHOOK_SECRET', 'dev-webhook-secret'),
    );
  }

  /**
   * Gateway aktif dibaca dari Pengaturan (midtrans.enabled + serverKey) —
   * bisa diubah admin tanpa restart. Default: provider DUMMY (sandbox lokal).
   */
  private async resolveGateway(): Promise<PaymentGatewayProvider> {
    const mt = await this.settings.get('midtrans', { raw: true });
    if (mt.enabled && mt.serverKey) {
      const key = `${mt.serverKey}|${mt.isProduction}`;
      if (!this.midtransGateway || this.midtransKey !== key) {
        this.midtransGateway = new MidtransGatewayProvider(
          mt.serverKey,
          mt.isProduction,
        );
        this.midtransKey = key;
      }
      return this.midtransGateway;
    }
    return this.dummyGateway;
  }

  async gatewayProviderName() {
    return (await this.resolveGateway()).name;
  }

  signWebhookPayload(rawBody: string): string {
    return createHmac(
      'sha256',
      this.config.get<string>('PAYMENT_WEBHOOK_SECRET', 'dev-webhook-secret'),
    )
      .update(rawBody)
      .digest('hex');
  }

  private async allowedStudentIds(userId: string): Promise<string[]> {
    const parent = await this.prisma.parent.findUnique({
      where: { userId },
      include: { parentStudents: { select: { studentId: true } } },
    });
    if (!parent) return [];
    return parent.parentStudents.map((p) => p.studentId);
  }

  async allowedStudentsOrThrow(userId: string): Promise<string[]> {
    const ids = await this.allowedStudentIds(userId);
    if (ids.length === 0)
      throw new ForbiddenException(
        'Akun ini tidak terhubung ke data orang tua.',
      );
    return ids;
  }

  private async requireIssuedInvoice(invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });
    if (!invoice) throw new NotFoundException('Invoice tidak ditemukan.');
    if (invoice.status !== 'ISSUED') {
      throw new BadRequestException(
        'Hanya invoice berstatus ISSUED yang bisa dibayar.',
      );
    }
    return invoice;
  }

  private remaining(invoice: {
    totalAmount: unknown;
    amountPaid: unknown;
  }): number {
    return Number(invoice.totalAmount) - Number(invoice.amountPaid);
  }

  private async receiptNumber(tx: Prisma.TransactionClient): Promise<string> {
    const d = new Date();
    const prefix = `KWT-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}-`;
    for (let i = 0; i < 20; i += 1) {
      const last = await tx.receipt.findFirst({
        where: { number: { startsWith: prefix } },
        orderBy: { number: 'desc' },
        select: { number: true },
      });
      const seq = last
        ? (Number(last.number.slice(prefix.length)) || 0) + 1
        : 1;
      const candidate = `${prefix}${String(seq).padStart(4, '0')}`;
      const clash = await tx.receipt.findUnique({
        where: { number: candidate },
      });
      if (!clash) return candidate;
    }
    return `${prefix}${String(Date.now()).slice(-4)}`;
  }

  // Inti Fase 2b: alokasi + update invoice.amountPaid + generate Receipt —
  // SELALU dipanggil di dalam $transaction yang sama dengan update payment.
  private async allocateAndReceipt(
    tx: Prisma.TransactionClient,
    args: {
      paymentId: string;
      invoiceId: string;
      studentId: string;
      amount: Prisma.Decimal;
      method: string;
      verifierId: string;
    },
  ) {
    const invoice = await tx.invoice.findUniqueOrThrow({
      where: { id: args.invoiceId },
    });
    const sisa = Number(invoice.totalAmount) - Number(invoice.amountPaid);
    const nominal = Number(args.amount);
    if (nominal <= 0)
      throw new BadRequestException('Nominal pembayaran tidak valid.');
    if (nominal - sisa > 0.009) {
      throw new BadRequestException(
        `Nominal melebihi sisa tagihan (sisa ${Math.round(sisa).toLocaleString('id-ID')}).`,
      );
    }
    await tx.paymentAllocation.upsert({
      where: {
        paymentId_invoiceId: {
          paymentId: args.paymentId,
          invoiceId: args.invoiceId,
        },
      },
      create: {
        paymentId: args.paymentId,
        invoiceId: args.invoiceId,
        amount: args.amount,
      },
      update: { amount: args.amount },
    });
    const newPaid = Number(invoice.amountPaid) + nominal;
    await tx.invoice.update({
      where: { id: args.invoiceId },
      data: {
        amountPaid: new Prisma.Decimal(newPaid),
      },
    });
    // Pendaftaran siswa: invoice lunas → status PAID (menunggu verifikasi finance).
    if (newPaid >= Number(invoice.totalAmount)) {
      await tx.enrollment.updateMany({
        where: { invoiceId: args.invoiceId, status: 'PENDING_PAYMENT' },
        data: { status: 'PAID' },
      });
    }
    const existingReceipt = await tx.receipt.findFirst({
      where: { paymentId: args.paymentId },
    });
    if (!existingReceipt) {
      const number = await this.receiptNumber(tx);
      await tx.receipt.create({
        data: {
          number,
          paymentId: args.paymentId,
          invoiceId: args.invoiceId,
          studentId: args.studentId,
          amount: args.amount,
          method: args.method,
          status: 'VERIFIED',
          verifierId: args.verifierId,
        },
      });
    }
    const pay = await tx.payment.findUnique({
      where: { id: args.paymentId },
      select: { accountId: true, paidAt: true, createdAt: true },
    });
    if (pay?.accountId) {
      const already = await tx.ledgerEntry.findFirst({
        where: { paymentId: args.paymentId, sourceType: 'PAYMENT' },
      });
      if (!already) {
        await tx.ledgerEntry.create({
          data: {
            accountId: pay.accountId,
            direction: 'IN',
            amount: args.amount,
            sourceType: 'PAYMENT',
            sourceId: args.paymentId,
            paymentId: args.paymentId,
            description: `Pembayaran ${args.method} invoice ${invoice.number}`,
            occurredAt: pay.paidAt ?? pay.createdAt,
          },
        });
      }
    }
  }

  list(query: {
    status?: string;
    channel?: string;
    studentId?: string;
    search?: string;
    from?: string;
    to?: string;
  }) {
    const where: Record<string, unknown> = {};
    if (query.from || query.to) {
      const paidAt: { gte?: Date; lte?: Date } = {};
      if (query.from) {
        const d = new Date(query.from);
        if (Number.isNaN(d.getTime())) throw new BadRequestException('Format tanggal "from" tidak valid.');
        paidAt.gte = d;
      }
      if (query.to) {
        const d = new Date(query.to);
        if (Number.isNaN(d.getTime())) throw new BadRequestException('Format tanggal "to" tidak valid.');
        paidAt.lte = d;
      }
      where.paidAt = paidAt;
    }
    if (query.status) {
      const s = query.status.toUpperCase();
      if (!['PENDING', 'VERIFIED', 'REJECTED'].includes(s)) {
        throw new BadRequestException(
          'Status tidak valid (PENDING/VERIFIED/REJECTED).',
        );
      }
      where.status = s;
    }
    if (query.channel) {
      const c = query.channel.toUpperCase();
      if (!['CASH', 'MANUAL', 'GATEWAY'].includes(c)) {
        throw new BadRequestException(
          'Channel tidak valid (CASH/MANUAL/GATEWAY).',
        );
      }
      where.channel = c;
    }
    if (query.studentId) where.studentId = query.studentId;
    if (query.search) {
      where.OR = [
        { providerRef: { contains: query.search, mode: 'insensitive' } },
        {
          allocations: {
            some: {
              invoice: {
                number: { contains: query.search, mode: 'insensitive' },
              },
            },
          },
        },
      ];
    }
    return this.prisma.payment.findMany({
      where,
      include: paymentDetailInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async get(id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: paymentDetailInclude,
    });
    if (!payment) throw new NotFoundException('Pembayaran tidak ditemukan.');
    return payment;
  }

  // 1. Cash di kantor: admin input → VERIFIED instan + alokasi + receipt (1 transaksi).
  async createCash(actorId: string, dto: CreateCashPaymentDto) {
    const invoice = await this.requireIssuedInvoice(dto.invoiceId);
    const amount = new Prisma.Decimal(String(dto.amount));
    let accountId = dto.accountId;
    if (!accountId) {
      const kas = await this.prisma.financialAccount.findFirst({
        where: { code: 'KAS', isActive: true },
      });
      if (!kas)
        throw new BadRequestException('Akun Kas (KAS) belum dikonfigurasi.');
      accountId = kas.id;
    } else {
      const acc = await this.prisma.financialAccount.findUnique({
        where: { id: accountId },
      });
      if (!acc || !acc.isActive)
        throw new BadRequestException('Akun kas/bank tidak valid.');
    }
    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          invoiceId: invoice.id,
          studentId: invoice.studentId,
          accountId,
          amount,
          method: 'CASH',
          channel: 'CASH',
          status: 'VERIFIED',
          verifiedBy: actorId,
          verifiedAt: now,
          paidAt: now,
          createdBy: actorId,
          proofNote: dto.note,
        },
      });
      await this.allocateAndReceipt(tx, {
        paymentId: payment.id,
        invoiceId: invoice.id,
        studentId: invoice.studentId,
        amount,
        method: 'CASH',
        verifierId: actorId,
      });
      return tx.payment.findUniqueOrThrow({
        where: { id: payment.id },
        include: paymentDetailInclude,
      });
    });
    // Fase 5b: "pembayaran terverifikasi" -> notif in-app + WA outbox.
    await this.events.paymentVerified(result.id);
    return result;
  }

  // 2. Manual upload bukti (Ortu) — selalu PENDING; Fase 5b: notif admin via
  // NotificationEventsService.paymentProofSubmitted (bukan di controller).
  async submitManualProof(userId: string, dto: CreateManualProofDto) {
    const invoice = await this.requireIssuedInvoice(dto.invoiceId);
    const allowed = await this.allowedStudentIds(userId);
    if (!allowed.includes(invoice.studentId)) {
      throw new ForbiddenException('Invoice tersebut bukan milik anak Anda.');
    }
    const sisa = this.remaining(invoice);
    if (Number(dto.amount) - sisa > 0.009) {
      throw new BadRequestException(
        `Nominal melebihi sisa tagihan (sisa ${Math.round(sisa).toLocaleString('id-ID')}).`,
      );
    }
    const created = await this.prisma.payment.create({
      data: {
        invoiceId: invoice.id,
        studentId: invoice.studentId,
        amount: new Prisma.Decimal(String(dto.amount)),
        method: 'TRANSFER_MANUAL',
        channel: 'MANUAL',
        status: 'PENDING',
        proofUrl: dto.proofUrl,
        proofNote: dto.proofNote,
        createdBy: userId,
      },
      include: paymentDetailInclude,
    });
    // Fase 5b: notif admin finance/owner — ada bukti menunggu verifikasi.
    await this.events.paymentProofSubmitted(created.id);
    return created;
  }

  async myChildrenInvoices(userId: string, studentId?: string) {
    const allowed = await this.allowedStudentsOrThrow(userId);
    const ids = studentId
      ? allowed.includes(studentId)
        ? [studentId]
        : []
      : allowed;
    if (studentId && ids.length === 0)
      throw new ForbiddenException(
        'Anak tersebut tidak terhubung ke akun ini.',
      );
    return this.prisma.invoice.findMany({
      where: {
        studentId: { in: ids.length ? ids : ['__none__'] },
        status: 'ISSUED',
      },
      include: {
        student: {
          select: { id: true, user: { select: { id: true, name: true } } },
        },
        package: { select: { name: true } },
        enrollmentLink: {
          select: {
            program: { select: { name: true } },
            level: { select: { name: true } },
            group: { select: { name: true } },
          },
        },
        enrollment: {
          select: {
            program: { select: { name: true } },
            level: { select: { name: true } },
            group: { select: { name: true } },
          },
        },
        items: { orderBy: { createdAt: 'asc' } },
        allocations: {
          include: {
            payment: { select: { id: true, status: true, method: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async myPayments(userId: string) {
    return this.prisma.payment.findMany({
      where: { createdBy: userId },
      include: paymentDetailInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  // Admin verifikasi bukti PENDING → APPROVE (VERIFIED + alokasi + receipt) / REJECT.
  // Idempotent: payment non-PENDING dikembalikan apa adanya.
  async verify(
    actorId: string,
    paymentId: string,
    action: 'APPROVE' | 'REJECT',
    opts: { accountId?: string; reason?: string },
  ) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (!payment) throw new NotFoundException('Pembayaran tidak ditemukan.');
    if (payment.status !== 'PENDING') return this.get(paymentId);
    // DoD anti-bypass: payment channel GATEWAY TIDAK boleh di-APPROVE manual.
    // Satu-satunya jalan VERIFIED untuk gateway adalah webhook server bertanda tangan.
    // REJECT tetap diizinkan (mis. tagihan kedaluwarsa tanpa webhook).
    if (
      action === 'APPROVE' &&
      (payment as { channel?: string }).channel === 'GATEWAY'
    ) {
      throw new BadRequestException(
        'Pembayaran gateway hanya bisa lunas via webhook server — tidak bisa di-approve manual.',
      );
    }
    if (action === 'REJECT') {
      if (!opts.reason?.trim())
        throw new BadRequestException('Alasan penolakan wajib diisi.');
      const now = new Date();
      const rejected = await this.prisma.payment.update({
        where: { id: paymentId },
        data: {
          status: 'REJECTED',
          rejectReason: opts.reason.trim(),
          verifiedBy: actorId,
          verifiedAt: now,
        },
        include: paymentDetailInclude,
      });
      await this.events.paymentRejected(paymentId);
      return rejected;
    }
    const invId = (payment as { invoiceId?: string | null }).invoiceId;
    const stuId = (payment as { studentId?: string | null }).studentId;
    if (!invId || !stuId) {
      throw new BadRequestException(
        'Payment ini tidak terikat invoice/siswa — tidak bisa diverifikasi.',
      );
    }
    const invoiceId: string = invId;
    const studentId: string = stuId;
    let accountId = opts.accountId ?? payment.accountId;
    if (!accountId) {
      const bank = await this.prisma.financialAccount.findFirst({
        where: { code: 'BANK', isActive: true },
      });
      const fallback =
        bank ??
        (await this.prisma.financialAccount.findFirst({
          where: { isActive: true },
        }));
      if (!fallback)
        throw new BadRequestException('Akun kas/bank belum dikonfigurasi.');
      accountId = fallback.id;
    }
    const now = new Date();
    const verified = await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: 'VERIFIED',
          accountId,
          verifiedBy: actorId,
          verifiedAt: now,
          paidAt: now,
          rejectReason: null,
        },
      });
      await this.allocateAndReceipt(tx, {
        paymentId,
        invoiceId,
        studentId,
        amount: payment.amount,
        method: payment.method,
        verifierId: actorId,
      });
      return tx.payment.findUniqueOrThrow({
        where: { id: paymentId },
        include: paymentDetailInclude,
      });
    });
    // Fase 5b: "pembayaran terverifikasi" -> notif in-app + WA outbox.
    await this.events.paymentVerified(paymentId);
    return verified;
  }

  // 3. Gateway dummy — initiate (PENDING, tanpa sentuh invoice) + webhook (server).
  async initiateGateway(
    userId: string,
    dto: InitiateGatewayDto,
    scopeStudentIds?: string[],
  ) {
    const invoice = await this.requireIssuedInvoice(dto.invoiceId);
    if (scopeStudentIds && !scopeStudentIds.includes(invoice.studentId)) {
      throw new ForbiddenException('Invoice tersebut bukan milik anak Anda.');
    }
    const sisa = this.remaining(invoice);
    if (Number(dto.amount) - sisa > 0.009) {
      throw new BadRequestException(
        `Nominal melebihi sisa tagihan (sisa ${Math.round(sisa).toLocaleString('id-ID')}).`,
      );
    }
    const gateway = await this.resolveGateway();
    const bill = await gateway.createBill({
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      amount: Number(dto.amount),
    });
    const created = await this.prisma.payment.create({
      data: {
        invoiceId: invoice.id,
        studentId: invoice.studentId,
        amount: new Prisma.Decimal(String(dto.amount)),
        method: 'GATEWAY',
        channel: 'GATEWAY',
        status: 'PENDING',
        provider: gateway.name,
        providerRef: bill.providerRef,
        paymentUrl: bill.redirectUrl,
        createdBy: userId,
      },
      include: paymentDetailInclude,
    });
    return {
      ...created,
      redirectUrl: bill.redirectUrl,
      expiresAt: bill.expiresAt,
    };
  }

  // Webhook server-to-server (provider DUMMY). TANPA signature valid → 401
  // & status tetap PENDING. Idempotent: providerRef yang sudah VERIFIED
  // tidak diproses ulang.
  async handleWebhook(
    rawBody: string,
    dto: GatewayWebhookDto,
    signature: string | undefined,
  ) {
    const ok = this.dummyGateway.verifyWebhookSignature(rawBody, signature);
    if (!ok) throw new UnauthorizedException('Signature webhook tidak valid.');
    const payment = await this.prisma.payment.findFirst({
      where: { providerRef: dto.providerRef, channel: 'GATEWAY' },
    });
    if (!payment)
      throw new NotFoundException('Transaksi gateway tidak ditemukan.');
    return this.applyGatewayOutcome(payment, dto.status, Number(dto.amount));
  }

  /**
   * Webhook notifikasi Midtrans (server-to-server). Signature dibawa di body
   * (`signature_key`), diverifikasi dengan serverKey dari Pengaturan.
   */
  async handleMidtransWebhook(body: Record<string, unknown>) {
    const gateway = await this.resolveGateway();
    if (!(gateway instanceof MidtransGatewayProvider)) {
      throw new BadRequestException('Gateway Midtrans belum diaktifkan.');
    }
    if (!gateway.verifyNotification(body)) {
      throw new UnauthorizedException('Signature webhook Midtrans tidak valid.');
    }
    const parsed = gateway.parseNotification(body);
    if (!parsed.providerRef) {
      throw new BadRequestException('Notifikasi Midtrans tanpa order_id.');
    }
    const payment = await this.prisma.payment.findFirst({
      where: { providerRef: parsed.providerRef, channel: 'GATEWAY' },
    });
    if (!payment)
      throw new NotFoundException('Transaksi gateway tidak ditemukan.');
    // Status non-final (pending/dsb) — akui 200 tanpa mengubah payment.
    if (!parsed.status) {
      return { success: true, status: payment.status, ignored: true };
    }
    const updated = await this.applyGatewayOutcome(
      payment,
      parsed.status,
      parsed.amount ?? Number(payment.amount),
    );
    return { success: true, status: updated.status };
  }

  /**
   * Cek status payment gateway langsung ke provider (dipanggil ortu/staff saat
   * kembali dari halaman Snap — webhook bisa terlambat/tidak sampai di dev).
   * Hanya membaca status dari provider & menyalurkannya lewat applyGatewayOutcome
   * yang sama dengan webhook → receipt + WA tetap lewat jalur yang idempotent.
   */
  async checkGatewayStatus(actor: AuthenticatedUser, paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (!payment) throw new NotFoundException('Pembayaran tidak ditemukan.');
    const isStaff = actor.permissions.includes(PERMISSION_CODES.PAYMENT_VERIFY);
    if (!isStaff && payment.createdBy !== actor.id) {
      throw new ForbiddenException('Transaksi ini bukan milik Anda.');
    }
    if (payment.channel !== 'GATEWAY' || !payment.providerRef) {
      throw new BadRequestException('Bukan transaksi gateway.');
    }
    // Sudah final (VERIFIED/REJECTED) — tidak ada yang perlu disinkronkan.
    if (payment.status !== 'PENDING') return this.get(payment.id);
    const gateway = await this.resolveGateway();
    if (!(gateway instanceof MidtransGatewayProvider)) {
      // Provider tanpa status API (DUMMY) — status hanya berubah via webhook/simulasi.
      return this.get(payment.id);
    }
    const parsed = await gateway.checkStatus(payment.providerRef);
    if (!parsed.valid || !parsed.status) {
      // Transaksi belum final di Midtrans (pending) — status tetap PENDING.
      return this.get(payment.id);
    }
    return this.applyGatewayOutcome(
      payment,
      parsed.status,
      parsed.amount ?? Number(payment.amount),
    );
  }

  /**
   * Terapkan hasil webhook (SUCCESS/FAILED/EXPIRED) ke payment PENDING:
   * SUCCESS -> VERIFIED + alokasi + kwitansi + notif; lainnya -> REJECTED.
   * Dipakai bersama oleh webhook dummy dan Midtrans.
   */
  private async applyGatewayOutcome(
    payment: {
      id: string;
      status: string;
      amount: Prisma.Decimal;
      accountId: string | null;
      invoiceId?: string | null;
      studentId?: string | null;
    },
    status: 'SUCCESS' | 'FAILED' | 'EXPIRED',
    amount: number,
  ) {
    if (payment.status === 'VERIFIED') return this.get(payment.id);
    if (status !== 'SUCCESS') {
      const rejected = await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'REJECTED',
          rejectReason: `Gateway: ${status}`,
          paidAt: null,
        },
        include: paymentDetailInclude,
      });
      // Guard: webhook berulang untuk payment yang sudah REJECTED tidak notif ulang.
      if (payment.status !== 'REJECTED') {
        await this.events.paymentRejected(payment.id);
      }
      return rejected;
    }
    if (Math.abs(amount - Number(payment.amount)) > 0.009) {
      throw new BadRequestException(
        'Nominal webhook tidak cocok dengan tagihan.',
      );
    }
    const wInvId = payment.invoiceId;
    const wStuId = payment.studentId;
    if (!wInvId || !wStuId) {
      throw new BadRequestException(
        'Payment gateway tidak terikat invoice/siswa.',
      );
    }
    const wInvoiceId: string = wInvId;
    const wStudentId: string = wStuId;
    const now = new Date();
    const bank = await this.prisma.financialAccount.findFirst({
      where: { code: 'BANK', isActive: true },
    });
    const verified = await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: 'VERIFIED',
          accountId: bank?.id ?? payment.accountId,
          verifiedBy: null,
          verifiedAt: now,
          paidAt: now,
        },
      });
      await this.allocateAndReceipt(tx, {
        paymentId: payment.id,
        invoiceId: wInvoiceId,
        studentId: wStudentId,
        amount: payment.amount,
        method: 'GATEWAY',
        verifierId: 'GATEWAY-WEBHOOK',
      });
      return tx.payment.findUniqueOrThrow({
        where: { id: payment.id },
        include: paymentDetailInclude,
      });
    });
    // Fase 5b: "pembayaran terverifikasi" -> notif in-app + WA outbox.
    await this.events.paymentVerified(payment.id);
    return verified;
  }

  // =====================================================================
  // File bukti pembayaran (upload nyata — bukan lagi string bebas).
  // Disimpan di disk lokal <cwd>/uploads/payment-proofs dengan nama acak;
  // pembacaan lewat endpoint terproteksi (pembuat / staff payment.verify).
  // =====================================================================
  private readonly proofDir = join(process.cwd(), 'uploads', 'payment-proofs');

  private static readonly PROOF_MIME_EXT: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'application/pdf': '.pdf',
  };

  async saveProofFile(file: { buffer: Buffer; mimetype: string } | undefined) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('File bukti kosong atau tidak terbaca.');
    }
    const ext = PaymentsService.PROOF_MIME_EXT[file.mimetype];
    if (!ext) {
      throw new BadRequestException(
        'Format bukti harus JPG, PNG, WebP, atau PDF.',
      );
    }
    await mkdir(this.proofDir, { recursive: true });
    const filename = `${randomUUID()}${ext}`;
    await writeFile(join(this.proofDir, filename), file.buffer);
    return { proofUrl: `proofs/${filename}` };
  }

  private proofMime(ext: string) {
    const found = Object.entries(PaymentsService.PROOF_MIME_EXT).find(
      ([, e]) => e === ext,
    );
    return found?.[0] ?? 'application/octet-stream';
  }

  async getProofFile(paymentId: string, actor: AuthenticatedUser) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (!payment) throw new NotFoundException('Pembayaran tidak ditemukan.');
    const isStaff = actor.permissions.includes(PERMISSION_CODES.PAYMENT_VERIFY);
    if (!isStaff && payment.createdBy !== actor.id) {
      throw new ForbiddenException('Bukti ini bukan milik pembayaran Anda.');
    }
    if (!payment.proofUrl?.startsWith('proofs/')) {
      throw new NotFoundException('Tidak ada file bukti tersimpan.');
    }
    // basename() menahan path traversal — hanya nama file di dalam proofDir.
    const filename = basename(payment.proofUrl);
    const path = join(this.proofDir, filename);
    try {
      await access(path);
    } catch {
      throw new NotFoundException('File bukti tidak ditemukan di storage.');
    }
    return { path, contentType: this.proofMime(extname(filename)) };
  }

  /**
   * Simulasi hasil gateway DUMMY (sandbox/dev). Payload ditandatangani dengan
   * secret lalu dilewatkan ke jalur webhook yang sama — DoD anti-bypass tetap
   * berlaku (tanda tangan diverifikasi oleh handleWebhook).
   */
  async simulateGateway(actor: AuthenticatedUser, dto: SimulateGatewayDto) {
    const gateway = await this.resolveGateway();
    if (gateway.name !== 'DUMMY') {
      throw new BadRequestException(
        'Simulasi hanya tersedia untuk provider DUMMY.',
      );
    }
    const payment = await this.prisma.payment.findFirst({
      where: { providerRef: dto.providerRef, channel: 'GATEWAY' },
    });
    if (!payment) {
      throw new NotFoundException('Transaksi gateway tidak ditemukan.');
    }
    const isStaff = actor.permissions.includes(PERMISSION_CODES.PAYMENT_VERIFY);
    if (!isStaff && payment.createdBy !== actor.id) {
      throw new ForbiddenException('Transaksi ini bukan milik Anda.');
    }
    const payload = {
      amount: Number(payment.amount),
      providerRef: dto.providerRef,
      status: dto.status,
    };
    const canonical = JSON.stringify(payload);
    const signature = this.signWebhookPayload(canonical);
    return this.handleWebhook(canonical, payload, signature);
  }

  listReceipts(query: {
    studentId?: string;
    invoiceId?: string;
    search?: string;
  }) {
    const where: Record<string, unknown> = {};
    if (query.studentId) where.studentId = query.studentId;
    if (query.invoiceId) where.invoiceId = query.invoiceId;
    if (query.search)
      where.number = { contains: query.search, mode: 'insensitive' };
    return this.prisma.receipt.findMany({
      where,
      include: receiptDetailInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async getReceipt(id: string) {
    const receipt = await this.prisma.receipt.findUnique({
      where: { id },
      include: receiptDetailInclude,
    });
    if (!receipt) throw new NotFoundException('Kwitansi tidak ditemukan.');
    const [student, verifier] = await Promise.all([
      this.prisma.student.findUnique({
        where: { id: receipt.studentId },
        select: {
          id: true,
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      receipt.verifierId && receipt.verifierId !== 'GATEWAY-WEBHOOK'
        ? this.prisma.user.findUnique({
            where: { id: receipt.verifierId },
            select: { id: true, name: true },
          })
        : Promise.resolve(null),
    ]);
    // Nomor angsuran: urutan invoice pendaftaran yang sama (fallback: paket).
    let installmentNo: number | null = null;
    const inv = receipt.invoice;
    if (inv) {
      const earlier = await this.prisma.invoice.count({
        where: {
          studentId: inv.studentId,
          ...(inv.enrollmentId
            ? { enrollmentId: inv.enrollmentId }
            : { packageId: inv.packageId ?? undefined }),
          OR: [
            { issuedAt: { lt: inv.issuedAt ?? inv.createdAt } },
            { issuedAt: null, createdAt: { lt: inv.createdAt } },
          ],
        },
      });
      installmentNo = earlier + 1;
    }
    return {
      ...receipt,
      student,
      verifier,
      installmentNo,
      remaining: inv
        ? Number(inv.totalAmount) - Number(inv.amountPaid)
        : null,
    };
  }
}
