// ===========================================================================
// Fase 5b — Trigger notifikasi otomatis lintas modul.
// Dipanggil DARI service domain (payments, invoices, schedules, attendance,
// payroll) SETELAH transaksi utama beres. Semua method menelan error sendiri
// (log saja) — notifikasi tidak boleh menggagalkan operasi bisnis.
// WhatsApp SELALU lewat outbox (WhatsAppOutboxService.enqueue) — jangan
// pernah kirim langsung dari sini.
// ===========================================================================
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { WhatsAppOutboxService } from '../whatsapp/whatsapp-outbox.service';
import { SettingsService } from '../settings/settings.service';
import type { WhatsAppSettings } from '../settings/settings.service';
import { MediaService } from '../media/media.service';
import { receiptDetailInclude } from '../payments/receipt.includes';
import {
  buildReceiptPdf,
  type ReceiptPdfInput,
} from '../payments/receipt-pdf';

const rupiah = (n: unknown) => `Rp ${Number(n).toLocaleString('id-ID')}`;
const idDateTime = (d: Date) =>
  d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

interface Audience {
  userId: string;
  name: string;
  phone: string | null;
}

@Injectable()
export class NotificationEventsService {
  private readonly logger = new Logger(NotificationEventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly outbox: WhatsAppOutboxService,
    private readonly settings: SettingsService,
    private readonly media: MediaService,
  ) {}

  /**
   * Generate PDF kwitansi lalu simpan sebagai media_asset — dipakai sebagai
   * lampiran pesan WA. Best-effort: kegagalan generate tidak menggagalkan
   * notifikasi (pesan tetap terkirim dengan link/teks saja).
   */
  private async receiptAttachment(
    receipt: ReceiptPdfInput,
    companyName: string,
  ) {
    try {
      const company = await this.settings.get('company');
      const pdf = await buildReceiptPdf(receipt, {
        name: company.name || companyName,
        address: company.address,
        phone: company.phone,
        email: company.email,
      });
      const asset = await this.media.saveBuffer(pdf, {
        mime: 'application/pdf',
        originalName: `Kwitansi-${receipt.number}.pdf`,
        // Kwitansi masuk pustaka finance — jangan tampil di pustaka akademik.
        category: 'FINANCE',
      });
      return { assetId: asset.id, filename: asset.name };
    } catch (err) {
      this.logger.warn(
        `Generate PDF kwitansi gagal: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }

  private logErr(event: string, err: unknown) {
    this.logger.error(
      `Trigger notifikasi ${event} gagal`,
      err instanceof Error ? err.stack : String(err),
    );
  }

  /** Setting WhatsApp (nomor admin + toggle per event) — dari halaman Pengaturan. */
  private async waSettings(): Promise<WhatsAppSettings> {
    return this.settings.get('whatsapp', { raw: true });
  }

  /** User siswa + semua orang tua yang terhubung ke studentId. */
  private async studentAudience(
    studentId: string,
  ): Promise<{ student: Audience | null; parents: Audience[] }> {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: {
        user: { select: { id: true, name: true, phone: true } },
        parentStudents: {
          select: {
            parent: {
              select: {
                user: { select: { id: true, name: true, phone: true } },
              },
            },
          },
        },
      },
    });
    if (!student) return { student: null, parents: [] };
    return {
      student: student.user
        ? {
            userId: student.user.id,
            name: student.user.name,
            phone: student.user.phone,
          }
        : null,
      parents: student.parentStudents
        .map((ps) => ps.parent.user)
        .filter((u): u is { id: string; name: string; phone: string | null } =>
          Boolean(u),
        )
        .map((u) => ({ userId: u.id, name: u.name, phone: u.phone })),
    };
  }

  /** Semua user pemilik role tertentu (untuk notif ke admin). */
  private async usersWithRoles(roleNames: string[]): Promise<Audience[]> {
    const rows = await this.prisma.userRole.findMany({
      where: { role: { name: { in: roleNames } }, user: { isActive: true } },
      select: { user: { select: { id: true, name: true, phone: true } } },
    });
    return rows.map((r) => ({
      userId: r.user.id,
      name: r.user.name,
      phone: r.user.phone,
    }));
  }

  // ------------------------------------------------------------- finance

  /** Invoice DRAFT -> ISSUED: notif ortu+siswa + WA ke ortu. */
  async invoiceIssued(invoiceId: string) {
    try {
      const invoice = await this.prisma.invoice.findUnique({
        where: { id: invoiceId },
      });
      if (!invoice || invoice.status !== 'ISSUED') return;
      const { student, parents } = await this.studentAudience(
        invoice.studentId,
      );
      const due = invoice.dueDate
        ? ` Jatuh tempo ${invoice.dueDate.toISOString().slice(0, 10)}.`
        : '';
      const amount = rupiah(invoice.totalAmount);
      await this.notifications.notifyMany(
        parents.map((p) => p.userId),
        {
          title: `Tagihan baru ${invoice.number}`,
          body: `Tagihan untuk ${student?.name ?? 'anak Anda'} sebesar ${amount} telah diterbitkan.${due}`,
          link: '/orang-tua/pembayaran',
        },
      );
      if (student) {
        await this.notifications.notifyMany([student.userId], {
          title: `Tagihan baru ${invoice.number}`,
          body: `Tagihan sebesar ${amount} telah diterbitkan.${due}`,
        });
      }
      const wa = await this.waSettings();
      if (wa.notifyInvoiceIssued) {
        for (const p of parents) {
          await this.outbox.enqueue({
            phone: p.phone,
            name: p.name,
            userId: p.userId,
            eventType: 'INVOICE_ISSUED',
            referenceType: 'Invoice',
            referenceId: invoice.id,
            message: `Tagihan ${invoice.number} untuk ${student?.name ?? 'anak Anda'} sebesar ${amount} telah diterbitkan.${due} Silakan cek aplikasi BimbelGFS.`,
          });
        }
      }
    } catch (err) {
      this.logErr('invoiceIssued', err);
    }
  }

  /**
   * Pengingat piutang manual dari halaman AR (endpoint POST ar/:id/send-reminder).
   * Beda dari trigger lain: method ini API-driven, jadi error dilempar ke caller
   * (404/400) alih-alih ditelan — admin butuh tahu kalau pengiriman gagal diproses.
   * Kirim WA ke semua orang tua siswa yang punya nomor, lalu tandai invoice SENT.
   */
  async paymentReminder(invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });
    if (!invoice) throw new NotFoundException('Invoice tidak ditemukan.');
    if (invoice.status !== 'ISSUED') {
      throw new BadRequestException(
        'Pengingat hanya bisa dikirim untuk invoice berstatus terbit.',
      );
    }
    const outstanding =
      Number(invoice.totalAmount) - Number(invoice.amountPaid);
    if (outstanding <= 0) {
      throw new BadRequestException('Invoice sudah lunas.');
    }

    const { student, parents } = await this.studentAudience(
      invoice.studentId,
    );
    const withPhone = parents.filter((p) => p.phone?.trim());
    const due = invoice.dueDate
      ? ` Jatuh tempo ${invoice.dueDate.toISOString().slice(0, 10)}.`
      : '';
    const message =
      `Pengingat pembayaran: tagihan ${invoice.number} untuk ` +
      `${student?.name ?? 'anak Anda'} masih memiliki sisa ${rupiah(outstanding)}.${due} ` +
      `Mohon segera diselesaikan — detail & unggah bukti di aplikasi BimbelGFS.`;

    let sent = 0;
    for (const p of withPhone) {
      const row = await this.outbox.enqueue({
        phone: p.phone,
        name: p.name,
        userId: p.userId,
        eventType: 'PAYMENT_REMINDER',
        referenceType: 'Invoice',
        referenceId: invoice.id,
        message,
      });
      if (row) sent += 1;
    }

    const updated = await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: { reminderStatus: 'SENT', remindedAt: new Date() },
    });

    return {
      sent,
      skipped: parents.length - withPhone.length,
      reminderStatus: updated.reminderStatus,
    };
  }

  /** Nomor invoice untuk pesan (payment -> invoice lewat invoiceId scalar). */
  private async invoiceNumberOf(invoiceId: string | null) {
    if (!invoiceId) return '-';
    const inv = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { number: true },
    });
    return inv?.number ?? '-';
  }

  /** Payment -> VERIFIED (cash/manual approve/webhook): notif ortu+siswa + WA. */
  async paymentVerified(paymentId: string) {
    try {
      const payment = await this.prisma.payment.findUnique({
        where: { id: paymentId },
      });
      if (!payment || payment.status !== 'VERIFIED' || !payment.studentId)
        return;
      const { student, parents } = await this.studentAudience(
        payment.studentId,
      );
      const inv = await this.invoiceNumberOf(payment.invoiceId);
      const amount = rupiah(payment.amount);
      await this.notifications.notifyMany(
        parents.map((p) => p.userId),
        {
          title: 'Pembayaran terverifikasi',
          body: `Pembayaran ${amount} untuk invoice ${inv} (${student?.name ?? 'anak Anda'}) telah terverifikasi.`,
          link: '/orang-tua/pembayaran',
        },
      );
      if (student) {
        await this.notifications.notifyMany([student.userId], {
          title: 'Pembayaran terverifikasi',
          body: `Pembayaran ${amount} untuk invoice ${inv} telah terverifikasi.`,
        });
      }
      const wa = await this.waSettings();
      if (wa.notifyPaymentVerified) {
        // Kwitansi: PDF dilampirkan langsung ke pesan WA + link publik
        // sebagai cadangan (UUID tidak bisa ditebak; appUrl diatur di
        // Pengaturan > Identitas Aplikasi).
        const [receipt, branding] = await Promise.all([
          this.prisma.receipt.findFirst({
            where: { paymentId: payment.id },
            include: receiptDetailInclude,
          }),
          this.settings.get('branding'),
        ]);
        const attachment = receipt
          ? await this.receiptAttachment(
              {
                ...receipt,
                student: { user: { name: student?.name ?? null } },
                verifier:
                  receipt.verifierId && receipt.verifierId !== 'GATEWAY-WEBHOOK'
                    ? await this.prisma.user.findUnique({
                        where: { id: receipt.verifierId },
                        select: { name: true },
                      })
                    : { name: 'Sistem' },
              },
              branding.appName,
            )
          : null;
        const receiptLink = receipt && branding.appUrl
          ? ` Kwitansi: ${branding.appUrl}/kwitansi/${receipt.id}`
          : ' Kwitansi terlampir / bisa dilihat di aplikasi.';
        const waMessage = `Pembayaran ${amount} untuk invoice ${inv} (${student?.name ?? 'siswa'}) telah TERVERIFIKASI.${receiptLink} Terima kasih.`;
        for (const p of parents) {
          await this.outbox.enqueue({
            phone: p.phone,
            name: p.name,
            userId: p.userId,
            eventType: 'PAYMENT_VERIFIED',
            referenceType: 'Payment',
            referenceId: payment.id,
            message: waMessage,
            attachmentAssetId: attachment?.assetId,
            attachmentName: attachment?.filename,
          });
        }
      }
    } catch (err) {
      this.logErr('paymentVerified', err);
    }
  }

  /** Payment -> REJECTED: notif ortu+siswa + WA ke ortu (perlu tindak lanjut). */
  async paymentRejected(paymentId: string) {
    try {
      const payment = await this.prisma.payment.findUnique({
        where: { id: paymentId },
      });
      if (!payment || payment.status !== 'REJECTED' || !payment.studentId)
        return;
      const { student, parents } = await this.studentAudience(
        payment.studentId,
      );
      const inv = await this.invoiceNumberOf(payment.invoiceId);
      const amount = rupiah(payment.amount);
      const reason = payment.rejectReason
        ? ` Alasan: ${payment.rejectReason}.`
        : '';
      await this.notifications.notifyMany(
        parents.map((p) => p.userId),
        {
          title: 'Pembayaran ditolak',
          body: `Pembayaran ${amount} untuk invoice ${inv} ditolak.${reason}`,
          link: '/orang-tua/pembayaran',
        },
      );
      if (student) {
        await this.notifications.notifyMany([student.userId], {
          title: 'Pembayaran ditolak',
          body: `Pembayaran ${amount} untuk invoice ${inv} ditolak.${reason}`,
        });
      }
      const wa = await this.waSettings();
      if (wa.notifyPaymentRejected) {
        for (const p of parents) {
          await this.outbox.enqueue({
            phone: p.phone,
            name: p.name,
            userId: p.userId,
            eventType: 'PAYMENT_REJECTED',
            referenceType: 'Payment',
            referenceId: payment.id,
            message: `Pembayaran ${amount} untuk invoice ${inv} DITOLAK.${reason} Silakan hubungi admin BimbelGFS.`,
          });
        }
      }
    } catch (err) {
      this.logErr('paymentRejected', err);
    }
  }

  /** Ortu upload bukti manual: notif ke admin finance + owner. */
  async paymentProofSubmitted(paymentId: string) {
    try {
      const payment = await this.prisma.payment.findUnique({
        where: { id: paymentId },
      });
      if (!payment || payment.status !== 'PENDING' || !payment.studentId)
        return;
      const { student } = await this.studentAudience(payment.studentId);
      const inv = await this.invoiceNumberOf(payment.invoiceId);
      const [financeAdmins, owners] = await Promise.all([
        this.usersWithRoles(['ADMIN_FINANCE']),
        this.usersWithRoles(['OWNER']),
      ]);
      const body = `Bukti ${rupiah(payment.amount)} untuk invoice ${inv} (${student?.name ?? 'siswa'}) menunggu verifikasi.`;
      // Link dibedakan per role — Owner tidak punya halaman /admin-finance/bukti.
      await this.notifications.notifyMany(
        financeAdmins.map((a) => a.userId),
        { title: 'Bukti pembayaran baru', body, link: '/admin-finance/bukti' },
      );
      await this.notifications.notifyMany(
        owners.map((a) => a.userId),
        { title: 'Bukti pembayaran baru', body, link: '/owner/bukti' },
      );
      // Fase 6: nomor WA admin dari Pengaturan — bukti masuk butuh aksi cepat.
      const wa = await this.waSettings();
      if (wa.notifyPaymentProof && wa.adminPhone) {
        await this.outbox.enqueue({
          phone: wa.adminPhone,
          name: 'Admin Finance',
          eventType: 'PAYMENT_PROOF_SUBMITTED',
          referenceType: 'Payment',
          referenceId: payment.id,
          message: `[BimbelGFS] Bukti pembayaran ${rupiah(payment.amount)} untuk invoice ${inv} (${student?.name ?? 'siswa'}) menunggu verifikasi. Buka aplikasi untuk meninjau.`,
        });
      }
    } catch (err) {
      this.logErr('paymentProofSubmitted', err);
    }
  }

  // ------------------------------------------------------------ schedule

  /**
   * Sesi diubah (reschedule/pindah ruang/ganti tutor) atau dibatalkan.
   * Notif ke siswa + ortu anggota kelompok (hormati scheduleAlert) + tutor sesi.
   */
  async sessionChanged(sessionId: string, opts: { cancelled?: boolean } = {}) {
    try {
      const session = await this.prisma.session.findUnique({
        where: { id: sessionId },
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          status: true,
          group: { select: { name: true } },
          room: { select: { name: true } },
          tutor: {
            select: { user: { select: { id: true, name: true, phone: true } } },
          },
        },
      });
      if (!session) return;
      const { studentIds, parentIds } = await this.sessionAudience(sessionId);
      const when = idDateTime(session.startsAt);
      const where = session.room ? ` di ${session.room.name}` : '';
      const title = opts.cancelled ? 'Sesi dibatalkan' : 'Jadwal sesi berubah';
      const body = opts.cancelled
        ? `Sesi ${session.group?.name ?? ''} pada ${when} dibatalkan.`
        : `Sesi ${session.group?.name ?? ''} kini dijadwalkan ${when}${where}.`;
      await this.notifications.notifyMany(parentIds, {
        title,
        body,
        link: '/orang-tua/jadwal',
        category: 'schedule',
      });
      await this.notifications.notifyMany(studentIds, {
        title,
        body,
        link: '/siswa/jadwal',
        category: 'schedule',
      });
      // Tutor pengampu juga diberi tahu (jadwal mengajar berubah).
      const tutorUserId = session.tutor?.user?.id;
      if (tutorUserId && !studentIds.includes(tutorUserId)) {
        await this.notifications.notifyMany([tutorUserId], {
          title,
          body,
          link: '/tutor/jadwal-sesi',
          category: 'schedule',
        });
      }
    } catch (err) {
      this.logErr('sessionChanged', err);
    }
  }

  /** Override per-siswa: notif ke siswa tsb + ortunya saja. */
  async sessionOverrideChanged(sessionId: string, studentId: string) {
    try {
      const session = await this.prisma.session.findUnique({
        where: { id: sessionId },
        select: { startsAt: true, group: { select: { name: true } } },
      });
      if (!session) return;
      const { student, parents } = await this.studentAudience(studentId);
      const body = `Jadwal sesi ${session.group?.name ?? ''} untuk ${student?.name ?? 'siswa'} pada ${idDateTime(session.startsAt)} memiliki penyesuaian khusus. Cek detail di aplikasi.`;
      await this.notifications.notifyMany(
        parents.map((p) => p.userId),
        {
          title: 'Jadwal disesuaikan',
          body,
          link: '/orang-tua/jadwal',
          category: 'schedule',
        },
      );
      if (student) {
        await this.notifications.notifyMany([student.userId], {
          title: 'Jadwal disesuaikan',
          body,
          link: '/siswa/jadwal',
          category: 'schedule',
        });
      }
    } catch (err) {
      this.logErr('sessionOverrideChanged', err);
    }
  }

  /** userId siswa + ortu anggota kelompok sebuah sesi (dipisah per audiens). */
  private async sessionAudience(
    sessionId: string,
  ): Promise<{ studentIds: string[]; parentIds: string[] }> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { groupId: true },
    });
    if (!session) return { studentIds: [], parentIds: [] };
    const members = await this.prisma.groupMember.findMany({
      where: { groupId: session.groupId },
      select: { studentId: true },
    });
    const studentIds: string[] = [];
    const parentIds: string[] = [];
    for (const m of members) {
      const { student, parents } = await this.studentAudience(m.studentId);
      if (student) studentIds.push(student.userId);
      parentIds.push(...parents.map((p) => p.userId));
    }
    return { studentIds, parentIds };
  }

  // ----------------------------------------------------------- attendance

  /** Absensi tercatat: ortu+siswa diberi tahu untuk status ALFA (attendanceAlert). */
  async attendanceMarked(
    sessionId: string,
    items: Array<{ studentId: string; status: string }>,
  ) {
    try {
      const alpa = items.filter((i) => i.status === 'ALFA');
      if (alpa.length === 0) return;
      const session = await this.prisma.session.findUnique({
        where: { id: sessionId },
        select: { startsAt: true, group: { select: { name: true } } },
      });
      if (!session) return;
      for (const item of alpa) {
        const { student, parents } = await this.studentAudience(item.studentId);
        const body = `${student?.name ?? 'Siswa'} tercatat ALFA pada sesi ${session.group?.name ?? ''} ${idDateTime(session.startsAt)}.`;
        await this.notifications.notifyMany(
          parents.map((p) => p.userId),
          {
            title: 'Ketidakhadiran tercatat',
            body,
            link: '/orang-tua/kehadiran',
            category: 'attendance',
          },
        );
        if (student) {
          await this.notifications.notifyMany([student.userId], {
            title: 'Ketidakhadiran tercatat',
            body,
            category: 'attendance',
          });
        }
      }
    } catch (err) {
      this.logErr('attendanceMarked', err);
    }
  }

  // --------------------------------------------------------------- exams

  /**
   * Hasil ujian rilis (scheduledEndAt terlewati — Fase 3e). Dipanggil oleh
   * ExamResultReleaseScheduler setelah flag resultsNotifiedAt diklaim.
   * Notif ke semua siswa yang punya attempt + ortunya.
   */
  async examResultsReleased(examId: string) {
    try {
      const exam = await this.prisma.exam.findUnique({
        where: { id: examId },
        select: {
          id: true,
          title: true,
          attempts: { select: { studentId: true } },
        },
      });
      if (!exam) return;
      const studentIds = [...new Set(exam.attempts.map((a) => a.studentId))];
      const parentIds: string[] = [];
      const studentUserIds: string[] = [];
      for (const sid of studentIds) {
        const { student, parents } = await this.studentAudience(sid);
        if (student) studentUserIds.push(student.userId);
        parentIds.push(...parents.map((p) => p.userId));
      }
      await this.notifications.notifyMany(studentUserIds, {
        title: `Hasil ujian rilis: ${exam.title}`,
        body: 'Hasil ujian sudah bisa dilihat di halaman ujian.',
        link: '/siswa/ujian',
      });
      await this.notifications.notifyMany(parentIds, {
        title: `Hasil ujian rilis: ${exam.title}`,
        body: 'Hasil ujian anak Anda sudah bisa dilihat.',
        link: '/orang-tua/performa-anak',
      });
    } catch (err) {
      this.logErr('examResultsReleased', err);
    }
  }

  // -------------------------------------------------------------- payroll

  /** Payroll run -> PAID: notif in-app + WA ke tutor terkait. */
  async payrollPaid(payrollRunId: string) {
    try {
      const run = await this.prisma.payrollRun.findUnique({
        where: { id: payrollRunId },
        select: {
          id: true,
          number: true,
          period: true,
          netAmount: true,
          status: true,
          tutor: {
            select: { user: { select: { id: true, name: true, phone: true } } },
          },
        },
      });
      if (!run || run.status !== 'PAID' || !run.tutor.user) return;
      const tutor = run.tutor.user;
      const amount = rupiah(run.netAmount);
      await this.notifications.notifyMany([tutor.id], {
        title: `Honor periode ${run.period} dibayarkan`,
        body: `Payroll ${run.number} sebesar ${amount} telah dibayarkan.`,
        link: '/tutor/profil',
      });
      const wa = await this.waSettings();
      if (wa.notifyPayrollPaid) {
        await this.outbox.enqueue({
          phone: tutor.phone,
          name: tutor.name,
          userId: tutor.id,
          eventType: 'PAYROLL_PAID',
          referenceType: 'PayrollRun',
          referenceId: run.id,
          message: `Honor Anda periode ${run.period} (${run.number}) sebesar ${amount} telah DIBAYARKAN. Detail di aplikasi BimbelGFS.`,
        });
      }
    } catch (err) {
      this.logErr('payrollPaid', err);
    }
  }
}
