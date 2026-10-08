// Fase 6 — Reports Service: laporan lanjutan lintas modul (operasional,
// akademik, keuangan) + snapshot beku (arsip) + render CSV/HTML.
// Semua builder WAJIB menangani dataset kosong & pembagian nol
// (tidak boleh muncul #N/A / #DIV/0!) — pakai safeAverage/safePercent.
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import {
  REPORT_BRAND,
  REPORT_KIND_META,
  ReportDoc,
  ReportFilters,
  ReportKind,
  buildFilterText,
  effectiveRange,
  groupScopeWhere,
  studentInScope,
  fmtDateId,
  fmtDateTimeId,
  normalizePeriod,
  numCell,
  periodLabel,
  periodRange,
  reportMoney,
  reportRupiah,
  safeAverage,
  safePercent,
} from './report-helpers';

const REPORT_KINDS = new Set<string>(Object.keys(REPORT_KIND_META));
const EMPTY_ROW_TEXT = 'Belum ada data';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  // =====================================================================
  // Public API
  // =====================================================================

  /** Bangun dokumen laporan (header + rows + summary) untuk 1 jenis laporan. */
  async build(kind: string, filters: ReportFilters = {}): Promise<ReportDoc> {
    if (!REPORT_KINDS.has(kind)) {
      throw new BadRequestException(
        `Jenis laporan "${kind}" tidak dikenal. Pilihan: ${[...REPORT_KINDS].join(', ')}.`,
      );
    }
    switch (kind as ReportKind) {
      case 'invoice':
        return this.buildInvoice(filters);
      case 'payment':
        return this.buildPayment(filters);
      case 'rab':
        return this.buildRab(filters);
      case 'revenue':
        return this.buildRevenue(filters);
      case 'ar':
        return this.buildAr(filters);
      case 'payroll':
        return this.buildPayroll(filters);
      case 'attendance':
        return this.buildAttendance(filters);
      case 'groups':
        return this.buildGroups(filters);
      case 'tutor':
        return this.buildTutor(filters);
      case 'students':
        return this.buildStudents(filters);
      case 'academic':
        return this.buildAcademic(filters);
      case 'ranking':
        return this.buildRanking(filters);
      case 'progress':
        return this.buildProgress(filters);
      default:
        throw new BadRequestException(`Jenis laporan "${kind}" tidak dikenal.`);
    }
  }

  /**
   * Render CSV (dibuka Excel). Dataset kosong -> baris "Belum ada data".
   * Delimiter `;` + baris `sep=;`: Excel locale Indonesia memakai `;` sebagai
   * pemisah kolom — dengan koma biasa semua sel menempel di kolom A.
   */
  renderExcelCsv(doc: ReportDoc): string {
    const SEP = ';';
    const esc = (cell: string) => `"${String(cell).replace(/"/g, '""')}"`;
    const lines: string[] = [
      `sep=${SEP}`,
      esc(doc.brand),
      esc(doc.title),
      esc(`Periode: ${doc.periodLabel}`),
      esc(`Digenerate: ${doc.generatedAt}`),
      esc(`Filter: ${doc.filterText}`),
      '',
      doc.headers.map(esc).join(SEP),
    ];
    if (doc.rows.length === 0) {
      lines.push(esc(EMPTY_ROW_TEXT));
    } else {
      for (const row of doc.rows) lines.push(row.map(esc).join(SEP));
    }
    lines.push('');
    for (const s of doc.summaryLines) lines.push(esc(s));
    return lines.join('\r\n');
  }

  /**
   * Render workbook .xlsx — header laporan + tabel kolom-nyata (bukan CSV).
   * Dipakai export.xlsx supaya file terbuka rapi di Excel/LibreOffice.
   */
  async renderXlsx(doc: ReportDoc) {
    const { default: ExcelJS } = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Laporan');

    ws.getCell('A1').value = doc.brand;
    ws.getCell('A1').font = { bold: true, size: 14 };
    ws.getCell('A2').value = doc.title;
    ws.getCell('A2').font = { bold: true, size: 12 };
    ws.getCell('A3').value = `Periode: ${doc.periodLabel}`;
    ws.getCell('A4').value = `Digenerate: ${doc.generatedAt} · Filter: ${doc.filterText}`;
    ws.getCell('A4').font = { size: 9, color: { argb: 'FF666666' } };

    const head = ws.getRow(6);
    head.values = doc.headers;
    head.font = { bold: true };
    head.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };
      cell.border = {
        top: { style: 'thin' }, bottom: { style: 'thin' },
        left: { style: 'thin' }, right: { style: 'thin' },
      };
    });

    if (doc.rows.length === 0) {
      const r = ws.getRow(7);
      r.getCell(1).value = EMPTY_ROW_TEXT;
      r.getCell(1).font = { italic: true, color: { argb: 'FF666666' } };
    } else {
      doc.rows.forEach((row, i) => {
        const r = ws.getRow(7 + i);
        r.values = row;
        r.eachCell((cell) => {
          // Nilai multi-item dipisah newline (bukan koma) — wrapText bikin
          // tiap item tampil di baris sendiri dalam satu sel.
          cell.alignment = { wrapText: true, vertical: 'top' };
          cell.border = {
            top: { style: 'thin' }, bottom: { style: 'thin' },
            left: { style: 'thin' }, right: { style: 'thin' },
          };
        });
      });
    }

    if (doc.summaryLines.length) {
      const start = 7 + Math.max(doc.rows.length, 1) + 1;
      ws.getRow(start).getCell(1).value = 'Ringkasan';
      ws.getRow(start).getCell(1).font = { bold: true };
      doc.summaryLines.forEach((s, i) => {
        ws.getRow(start + 1 + i).getCell(1).value = s;
      });
    }

    // Lebar kolom dari konten terpanjang (cap 42) — hindari "####" di Excel.
    doc.headers.forEach((h, i) => {
      const longest = doc.rows.reduce(
        (m, r) => Math.max(m, (r[i] ?? '').length),
        h.length,
      );
      ws.getColumn(i + 1).width = Math.min(42, Math.max(10, longest + 2));
    });

    const buffer = await wb.xlsx.writeBuffer();
    return { buffer: Buffer.from(buffer), filename: `${doc.fileBase}.xlsx` };
  }

  /** Render HTML siap print-to-PDF. Dataset kosong -> baris "Belum ada data". */
  renderPdfHtml(doc: ReportDoc): string {
    const escHtml = (s: string) =>
      String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const bodyRows =
      doc.rows.length === 0
        ? `<tr><td colspan="${doc.headers.length || 1}" style="text-align:center;color:#666">${EMPTY_ROW_TEXT}</td></tr>`
        : doc.rows
            .map(
              (row) =>
                `<tr>${row
                  .map((c) => `<td>${escHtml(c).replace(/\n/g, '<br>')}</td>`)
                  .join('')}</tr>`,
            )
            .join('');
    const summary =
      doc.summaryLines.length === 0
        ? ''
        : `<h3>Ringkasan</h3><ul>${doc.summaryLines
            .map((s) => `<li>${escHtml(s)}</li>`)
            .join('')}</ul>`;
    return `<!doctype html><html><head><meta charset="utf-8"><title>${escHtml(
      doc.title,
    )}</title><style>
body{font-family:Arial,sans-serif;margin:24px;color:#111}
h1{font-size:18px;margin:0} h2{font-size:15px;margin:0} h3{font-size:13px;margin:16px 0 4px}
.meta{font-size:11px;color:#555;margin:4px 0 12px}
table{border-collapse:collapse;width:100%;font-size:11px}
th,td{border:1px solid #999;padding:4px 6px;text-align:left}
th{background:#eee}
</style></head><body>
<h1>${escHtml(doc.brand)}</h1>
<h2>${escHtml(doc.title)}</h2>
<p class="meta">Periode: ${escHtml(doc.periodLabel)} · Digenerate: ${escHtml(
      doc.generatedAt,
    )}<br/>Filter: ${escHtml(doc.filterText)}</p>
<table><thead><tr>${doc.headers
      .map((h) => `<th>${escHtml(h)}</th>`)
      .join('')}</tr></thead><tbody>${bodyRows}</tbody></table>
${summary}
</body></html>`;
  }

  // =====================================================================
  // Snapshot (arsip beku)
  // =====================================================================

  /** Simpan snapshot: build laporan SEKARANG lalu bekukan sebagai JSON. */
  async createSnapshot(
    kind: string,
    filters: ReportFilters,
    createdById: string | null,
    title?: string,
  ) {
    const doc = await this.build(kind, filters);
    return this.prisma.reportSnapshot.create({
      data: {
        reportKind: doc.kind,
        period: filters.period ? normalizePeriod(filters.period) : null,
        title: title?.trim() || `${doc.title} — ${doc.periodLabel}`,
        filterText: doc.filterText,
        payload: doc as unknown as object,
        createdById,
      },
      include: { createdBy: { select: { id: true, name: true, email: true } } },
    });
  }

  async listSnapshots(filters: { kind?: string; period?: string }) {
    const where: Record<string, unknown> = {};
    if (filters.kind) where.reportKind = filters.kind;
    if (filters.period) where.period = filters.period;
    const rows = await this.prisma.reportSnapshot.findMany({
      where,
      select: {
        id: true,
        reportKind: true,
        period: true,
        title: true,
        filterText: true,
        createdAt: true,
        createdBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return { total: rows.length, data: rows };
  }

  async getSnapshot(id: string) {
    const snap = await this.prisma.reportSnapshot.findUnique({
      where: { id },
      include: { createdBy: { select: { id: true, name: true, email: true } } },
    });
    if (!snap) throw new NotFoundException('Snapshot laporan tidak ditemukan.');
    return snap;
  }

  async deleteSnapshot(id: string) {
    const snap = await this.prisma.reportSnapshot.findUnique({ where: { id } });
    if (!snap) throw new NotFoundException('Snapshot laporan tidak ditemukan.');
    await this.prisma.reportSnapshot.delete({ where: { id } });
    return snap;
  }

  /** Identitas bimbel untuk header laporan — dibaca dari pengaturan `company`. */
  async getCompanyInfo() {
    // Identitas bimbel + penandatangan kwitansi (dari pengaturan finance) agar
    // semua dokumen cetak kwitansi membawa nama/jabatan/ttd yang sama.
    const [company, finance, branding] = await Promise.all([
      this.settings.get('company'),
      this.settings.get('finance'),
      this.settings.get('branding'),
    ]);
    return {
      ...company,
      logoUrl: branding.logoUrl || '',
      signerName: finance.receiptSignerName || '',
      signerTitle: finance.receiptSignerTitle || '',
      signatureUrl: finance.receiptSignatureUrl || '',
    };
  }

  // =====================================================================
  // Internal helpers
  // =====================================================================

  private baseDoc(
    kind: ReportKind,
    filters: ReportFilters,
    headers: string[],
    rows: string[][],
    summaryLines: string[],
  ): ReportDoc {
    const meta = REPORT_KIND_META[kind];
    const pLabel = periodLabel(filters);
    return {
      brand: REPORT_BRAND,
      title: meta.title,
      kind,
      periodLabel: pLabel,
      generatedAt: new Date().toISOString(),
      filterText: buildFilterText(filters),
      headers,
      rows,
      summaryLines,
      fileBase: `laporan-${kind}-${pLabel.replace(/[^\dA-Za-z-]/g, '_')}`,
    };
  }

  // =====================================================================
  // Keuangan
  // =====================================================================

  private async buildInvoice(filters: ReportFilters): Promise<ReportDoc> {
    const where: Record<string, unknown> = {};
    const range = effectiveRange(filters);
    if (range.gte || range.lt) where.createdAt = { gte: range.gte, lt: range.lt };
    if (filters.studentId) where.studentId = filters.studentId;
    if (filters.status) where.status = filters.status;
    const studentScope = studentInScope(filters);
    if (studentScope) where.student = studentScope;

    const invoices = await this.prisma.invoice.findMany({
      where,
      include: {
        student: { select: { user: { select: { name: true } } } },
        package: { select: { name: true, code: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    let billed = 0;
    let paid = 0;
    let outstanding = 0;
    const rows = invoices.map((inv) => {
      const total = reportMoney(inv.totalAmount);
      const amtPaid = reportMoney(inv.amountPaid);
      const out = Math.max(0, total - amtPaid);
      billed += total;
      paid += amtPaid;
      outstanding += out;
      return [
        inv.number,
        inv.student.user.name,
        inv.package?.name ?? '-',
        inv.status,
        numCell(total),
        numCell(amtPaid),
        numCell(out),
        fmtDateId(inv.issuedAt ?? inv.createdAt),
      ];
    });

    return this.baseDoc(
      'invoice',
      filters,
      ['No. Invoice', 'Siswa', 'Paket', 'Status', 'Total', 'Terbayar', 'Outstanding', 'Tgl Terbit'],
      rows,
      [
        `Jumlah invoice: ${invoices.length}`,
        `Total ditagihkan: ${reportRupiah(billed)}`,
        `Total terbayar: ${reportRupiah(paid)}`,
        `Total outstanding: ${reportRupiah(outstanding)}`,
        `Kolektibilitas: ${safePercent(paid, billed)}%`,
      ],
    );
  }

  private async buildPayment(filters: ReportFilters): Promise<ReportDoc> {
    const where: Record<string, unknown> = {};
    const range = effectiveRange(filters);
    if (range.gte || range.lt) where.createdAt = { gte: range.gte, lt: range.lt };
    if (filters.channel) where.channel = filters.channel;
    if (filters.status) where.status = filters.status;
    const payScope = studentInScope(filters);
    if (payScope) {
      where.allocations = { some: { invoice: { student: payScope } } };
    }

    const payments = await this.prisma.payment.findMany({
      where,
      include: {
        account: { select: { name: true, code: true } },
        allocations: {
          include: {
            invoice: {
              select: { number: true, student: { select: { user: { select: { name: true } } } } },
            },
          },
        },
        receipts: { select: { number: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    let total = 0;
    let verified = 0;
    let verifiedAmount = 0;
    const rows = payments.map((p) => {
      const amount = reportMoney(p.amount);
      total += amount;
      if (p.status === 'VERIFIED') {
        verified += 1;
        verifiedAmount += amount;
      }
      const studentNames = [
        ...new Set(
          p.allocations
            .map((a) => a.invoice.student?.user?.name)
            .filter((n): n is string => Boolean(n)),
        ),
      ];
      return [
        p.receipts[0]?.number ?? p.providerRef ?? p.id.slice(0, 8),
        studentNames.join('\n') || '-',
        p.channel,
        p.method,
        p.status,
        numCell(amount),
        p.account?.name ?? '-',
        fmtDateTimeId(p.paidAt ?? p.verifiedAt ?? p.createdAt),
      ];
    });

    return this.baseDoc(
      'payment',
      filters,
      ['Ref', 'Siswa', 'Channel', 'Metode', 'Status', 'Jumlah', 'Akun', 'Tgl Bayar/Verifikasi'],
      rows,
      [
        `Jumlah pembayaran: ${payments.length}`,
        `Total nominal: ${reportRupiah(total)}`,
        `Terverifikasi: ${verified} (${reportRupiah(verifiedAmount)})`,
        `Rasio verifikasi: ${safePercent(verified, payments.length)}%`,
      ],
    );
  }

  private async buildRab(filters: ReportFilters): Promise<ReportDoc> {
    const period = normalizePeriod(filters.period);
    const range = periodRange(period);
    const budgets = await this.prisma.budget.findMany({
      where: { period },
      orderBy: { category: 'asc' },
    });
    const expenses = await this.prisma.expense.findMany({
      where: {
        OR: [
          { budgetId: { in: budgets.map((b) => b.id) } },
          { occurredAt: { gte: range.gte, lt: range.lt } },
        ],
      },
    });

    let totalBudget = 0;
    let totalActual = 0;
    const rows = budgets.map((b) => {
      const matched = expenses.filter(
        (e) => e.budgetId === b.id || e.category === b.category,
      );
      const actual = matched.reduce((sum, e) => sum + reportMoney(e.amount), 0);
      const budgetAmount = reportMoney(b.amount);
      const variance = budgetAmount - actual;
      totalBudget += budgetAmount;
      totalActual += actual;
      return [
        b.category,
        numCell(budgetAmount),
        numCell(actual),
        numCell(variance),
        `${safePercent(variance, budgetAmount)}%`,
        String(matched.length),
      ];
    });

    return this.baseDoc(
      'rab',
      { ...filters, period },
      ['Kategori', 'Budget', 'Actual', 'Variance', 'Variance %', 'Jml Expense'],
      rows,
      [
        `Total budget: ${reportRupiah(totalBudget)}`,
        `Total actual: ${reportRupiah(totalActual)}`,
        `Total variance: ${reportRupiah(totalBudget - totalActual)}`,
        `Serapan: ${safePercent(totalActual, totalBudget)}%`,
      ],
    );
  }

  /** Revenue = pembayaran VERIFIED dalam periode, dikelompokkan per channel. */
  private async buildRevenue(filters: ReportFilters): Promise<ReportDoc> {
    const period = normalizePeriod(filters.period);
    const range = periodRange(period);
    const payments = await this.prisma.payment.findMany({
      where: { status: 'VERIFIED', paidAt: { gte: range.gte, lt: range.lt } },
      select: { channel: true, method: true, amount: true },
    });

    const byChannel = new Map<string, { count: number; total: number }>();
    for (const p of payments) {
      const key = `${p.channel} / ${p.method}`;
      const bucket = byChannel.get(key) ?? { count: 0, total: 0 };
      bucket.count += 1;
      bucket.total += reportMoney(p.amount);
      byChannel.set(key, bucket);
    }

    let grandTotal = 0;
    const rows = [...byChannel.entries()].map(([channel, v]) => {
      grandTotal += v.total;
      return [channel, String(v.count), numCell(v.total)];
    });

    return this.baseDoc(
      'revenue',
      { ...filters, period },
      ['Channel / Metode', 'Jml Transaksi', 'Total Revenue'],
      rows,
      [
        `Total revenue: ${reportRupiah(grandTotal)}`,
        `Jumlah transaksi verified: ${payments.length}`,
        `Rata-rata per transaksi: ${reportRupiah(safeAverage(grandTotal, payments.length))}`,
      ],
    );
  }

  /** Piutang = invoice ISSUED dengan outstanding > 0, plus umur piutang. */
  private async buildAr(filters: ReportFilters): Promise<ReportDoc> {
    const arScope = studentInScope(filters);
    const invoices = await this.prisma.invoice.findMany({
      where: { status: 'ISSUED', ...(arScope ? { student: arScope } : {}) },
      include: { student: { select: { user: { select: { name: true } } } } },
      orderBy: { dueDate: 'asc' },
      take: 500,
    });

    const now = Date.now();
    let totalAr = 0;
    let overdueCount = 0;
    const rows = invoices
      .map((inv) => {
        const total = reportMoney(inv.totalAmount);
        const paid = reportMoney(inv.amountPaid);
        const outstanding = total - paid;
        if (outstanding <= 0) return null;
        totalAr += outstanding;
        const overdueDays = inv.dueDate
          ? Math.floor((now - new Date(inv.dueDate).getTime()) / 86400000)
          : 0;
        const isOverdue = overdueDays > 0;
        if (isOverdue) overdueCount += 1;
        return [
          inv.number,
          inv.student.user.name,
          fmtDateId(inv.dueDate),
          numCell(total),
          numCell(paid),
          numCell(outstanding),
          isOverdue ? `${overdueDays} hari` : 'Belum jatuh tempo',
          inv.reminderStatus,
        ];
      })
      .filter((r): r is string[] => r !== null);

    return this.baseDoc(
      'ar',
      filters,
      ['No. Invoice', 'Siswa', 'Jatuh Tempo', 'Total', 'Terbayar', 'Outstanding', 'Umur', 'Reminder'],
      rows,
      [
        `Jumlah piutang: ${rows.length}`,
        `Total piutang: ${reportRupiah(totalAr)}`,
        `Lewat jatuh tempo: ${overdueCount} invoice`,
      ],
    );
  }

  private async buildPayroll(filters: ReportFilters): Promise<ReportDoc> {
    const period = normalizePeriod(filters.period);
    const where: Record<string, unknown> = { period };
    if (filters.tutorId) where.tutorId = filters.tutorId;
    if (filters.status) where.status = filters.status;

    const runs = await this.prisma.payrollRun.findMany({
      where,
      include: { tutor: { select: { user: { select: { name: true } } } } },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });

    let gross = 0;
    let net = 0;
    let paidCount = 0;
    const rows = runs.map((r) => {
      const g = reportMoney(r.grossAmount);
      const n = reportMoney(r.netAmount);
      gross += g;
      net += n;
      if (r.status === 'PAID') paidCount += 1;
      return [
        r.number,
        r.tutor.user.name,
        r.period,
        numCell(g),
        numCell(reportMoney(r.adjustmentAmount)),
        numCell(n),
        r.status,
        fmtDateId(r.paidAt),
      ];
    });

    return this.baseDoc(
      'payroll',
      { ...filters, period },
      ['No. Payroll', 'Tutor', 'Periode', 'Gross', 'Adjustment', 'Net', 'Status', 'Tgl Bayar'],
      rows,
      [
        `Jumlah payroll run: ${runs.length}`,
        `Total gross: ${reportRupiah(gross)}`,
        `Total net: ${reportRupiah(net)}`,
        `Sudah dibayar: ${paidCount} / ${runs.length}`,
      ],
    );
  }

  // =====================================================================
  // Operasional
  // =====================================================================

  /** Rekap kehadiran per siswa dalam periode. */
  private async buildAttendance(filters: ReportFilters): Promise<ReportDoc> {
    const where: Record<string, unknown> = {};
    const sessionWhere: Record<string, unknown> = {};
    const range = effectiveRange(filters);
    if (range.gte || range.lt) sessionWhere.startsAt = { gte: range.gte, lt: range.lt };
    const attGroup = groupScopeWhere(filters);
    if (Object.keys(attGroup).length) sessionWhere.group = attGroup;
    if (filters.tutorId) sessionWhere.tutorId = filters.tutorId;
    if (Object.keys(sessionWhere).length) where.session = sessionWhere;
    if (filters.studentId) where.studentId = filters.studentId;

    const rows0 = await this.prisma.attendance.findMany({
      where,
      include: {
        student: {
          select: {
            id: true,
            schoolOrigin: true,
            user: { select: { name: true } },
            groupMembers: { select: { group: { select: { name: true } } } },
          },
        },
      },
      take: 2000,
    });

    const perStudent = new Map<
      string,
      { name: string; schoolOrigin: string | null; groups: Set<string>; counts: Record<string, number>; total: number }
    >();
    for (const r of rows0) {
      let b = perStudent.get(r.studentId);
      if (!b) {
        b = {
          name: r.student.user.name,
          schoolOrigin: r.student.schoolOrigin,
          groups: new Set(r.student.groupMembers.map((gm) => gm.group.name)),
          counts: { HADIR: 0, TERLAMBAT: 0, IZIN: 0, SAKIT: 0, ALFA: 0 },
          total: 0,
        };
        perStudent.set(r.studentId, b);
      }
      b.counts[r.status] = (b.counts[r.status] ?? 0) + 1;
      b.total += 1;
    }

    let sumRate = 0;
    const rows = [...perStudent.values()].map((s) => {
      const rate = safePercent(s.counts.HADIR + s.counts.TERLAMBAT, s.total);
      sumRate += rate;
      return [
        s.name,
        s.schoolOrigin || '-',
        [...s.groups].join('\n') || '-',
        String(s.counts.HADIR),
        String(s.counts.TERLAMBAT),
        String(s.counts.IZIN),
        String(s.counts.SAKIT),
        String(s.counts.ALFA),
        String(s.total),
        `${rate}%`,
      ];
    });

    return this.baseDoc(
      'attendance',
      filters,
      ['Siswa', 'Asal Sekolah', 'Kelompok', 'Hadir', 'Terlambat', 'Izin', 'Sakit', 'Alfa', 'Total Sesi', 'Kehadiran %'],
      rows,
      [
        `Jumlah siswa: ${rows.length}`,
        `Total catatan absensi: ${rows0.length}`,
        `Rata-rata kehadiran: ${safeAverage(sumRate, rows.length)}%`,
      ],
    );
  }

  /** Utilisasi kelompok: member vs kapasitas + sesi dalam periode. */
  private async buildGroups(filters: ReportFilters): Promise<ReportDoc> {
    const range = effectiveRange(filters);
    const groups = await this.prisma.learningGroup.findMany({
      where: groupScopeWhere(filters),
      include: {
        program: { select: { name: true } },
        level: { select: { name: true } },
        _count: { select: { members: true, tutors: true } },
        sessions: {
          where: range.gte || range.lt ? { startsAt: { gte: range.gte, lt: range.lt } } : {},
          select: { status: true },
        },
      },
      orderBy: { name: 'asc' },
      take: 500,
    });

    let sumUtil = 0;
    const rows = groups.map((g) => {
      const capacity = g.capacity ?? 0;
      const util = safePercent(g._count.members, capacity);
      sumUtil += util;
      const completed = g.sessions.filter((s) => s.status === 'COMPLETED').length;
      return [
        g.code ?? '-',
        g.name,
        g.program.name,
        g.level?.name ?? '-',
        String(g._count.members),
        capacity > 0 ? String(capacity) : '-',
        capacity > 0 ? `${util}%` : '-',
        String(g._count.tutors),
        String(g.sessions.length),
        String(completed),
        g.isActive ? 'AKTIF' : 'NONAKTIF',
      ];
    });

    return this.baseDoc(
      'groups',
      filters,
      ['Kode', 'Kelompok', 'Program', 'Level', 'Member', 'Kapasitas', 'Utilisasi', 'Tutor', 'Sesi', 'Sesi Selesai', 'Status'],
      rows,
      [
        `Jumlah kelompok: ${rows.length}`,
        `Rata-rata utilisasi: ${safeAverage(sumUtil, rows.length)}%`,
      ],
    );
  }

  /** Kinerja tutor: sesi diajar + work items + payroll dalam periode. */
  private async buildTutor(filters: ReportFilters): Promise<ReportDoc> {
    const period = normalizePeriod(filters.period);
    const range = periodRange(period);
    const tutors = await this.prisma.tutor.findMany({
      where: {
        isActive: true,
        ...(filters.tutorId ? { id: filters.tutorId } : {}),
        ...(Object.keys(groupScopeWhere(filters)).length
          ? { groupTutors: { some: { group: groupScopeWhere(filters) } } }
          : {}),
      },
      include: {
        user: { select: { name: true } },
        groupTutors: { select: { group: { select: { name: true } } } },
        sessions: {
          where: { startsAt: { gte: range.gte, lt: range.lt } },
          select: { status: true },
        },
        workItems: { where: { period }, select: { amount: true } },
        payrollRuns: { where: { period }, select: { netAmount: true, status: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });

    let totalHonor = 0;
    const rows = tutors.map((t) => {
      const completed = t.sessions.filter((s) => s.status === 'COMPLETED').length;
      const workAmount = t.workItems.reduce((s, w) => s + reportMoney(w.amount), 0);
      const payrollNet = t.payrollRuns.reduce((s, r) => s + reportMoney(r.netAmount), 0);
      totalHonor += workAmount;
      const payrollStatus =
        t.payrollRuns.length === 0
          ? '-'
          : t.payrollRuns.every((r) => r.status === 'PAID')
            ? 'PAID'
            : 'UNPAID';
      return [
        t.user.name,
        t.groupTutors.map((gt) => gt.group.name).join('\n') || '-',
        String(t.sessions.length),
        String(completed),
        String(t.workItems.length),
        numCell(workAmount),
        numCell(payrollNet),
        payrollStatus,
      ];
    });

    return this.baseDoc(
      'tutor',
      { ...filters, period },
      ['Tutor', 'Kelompok', 'Sesi', 'Sesi Selesai', 'Work Items', 'Honor Work Items', 'Payroll Net', 'Payroll'],
      rows,
      [
        `Jumlah tutor aktif: ${rows.length}`,
        `Total honor work items: ${reportRupiah(totalHonor)}`,
      ],
    );
  }

  // =====================================================================
  /** Siswa per asal sekolah — agregasi sekolah penyumbang siswa terbanyak. */
  private async buildStudents(filters: ReportFilters): Promise<ReportDoc> {
    const scope = studentInScope(filters);
    const students = await this.prisma.student.findMany({
      where: {
        isActive: true,
        ...(filters.studentId ? { id: filters.studentId } : {}),
        ...(scope ?? {}),
        ...(filters.search
          ? {
              OR: [
                { user: { name: { contains: filters.search, mode: 'insensitive' } } },
                { schoolOrigin: { contains: filters.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        schoolOrigin: true,
        user: { select: { name: true } },
        groupMembers: { select: { group: { select: { name: true } } } },
      },
      orderBy: { user: { name: 'asc' } },
      take: 2000,
    });

    const perSchool = new Map<string, number>();
    for (const s of students) {
      const key = s.schoolOrigin?.trim() || '(Tidak diisi)';
      perSchool.set(key, (perSchool.get(key) ?? 0) + 1);
    }
    const schoolAgg = [...perSchool.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    );

    const rows = students.map((s) => [
      s.user.name,
      s.schoolOrigin?.trim() || '-',
      s.groupMembers.map((gm) => gm.group.name).join('\n') || '-',
    ]);

    return this.baseDoc(
      'students',
      filters,
      ['Siswa', 'Asal Sekolah', 'Kelompok'],
      rows,
      [
        `Jumlah siswa: ${students.length}`,
        `Sekolah penyumbang terbanyak: ${schoolAgg[0] ? `${schoolAgg[0][0]} (${schoolAgg[0][1]} siswa)` : '-'}`,
        ...schoolAgg.slice(0, 10).map(([school, n]) => `${school}: ${n} siswa`),
      ],
    );
  }

  // Akademik
  // =====================================================================

  /** Nilai ujian: attempt SUBMITTED dalam periode (hasil memang sudah rilis). */
  private async buildAcademic(filters: ReportFilters): Promise<ReportDoc> {
    const range = effectiveRange(filters);
    const where: Record<string, unknown> = { status: 'SUBMITTED' };
    if (range.gte || range.lt) where.submittedAt = { gte: range.gte, lt: range.lt };
    if (filters.studentId) where.studentId = filters.studentId;
    const acadScope = studentInScope(filters);
    if (acadScope) where.student = acadScope;

    const attempts = await this.prisma.examAttempt.findMany({
      where,
      include: {
        exam: { select: { title: true, scheduledEndAt: true } },
        student: { select: { schoolOrigin: true, user: { select: { name: true } } } },
      },
      orderBy: { submittedAt: 'desc' },
      take: 500,
    });

    let sumPct = 0;
    let maxPct = 0;
    const rows = attempts.map((a) => {
      const pct = safePercent(a.score, a.maxScore);
      sumPct += pct;
      if (pct > maxPct) maxPct = pct;
      return [
        a.exam.title,
        a.student.user.name,
        a.student.schoolOrigin || '-',
        String(a.score),
        String(a.maxScore),
        `${pct}%`,
        fmtDateTimeId(a.submittedAt),
      ];
    });

    return this.baseDoc(
      'academic',
      filters,
      ['Ujian', 'Siswa', 'Asal Sekolah', 'Skor', 'Skor Maks', 'Persen', 'Tgl Submit'],
      rows,
      [
        `Jumlah attempt: ${attempts.length}`,
        `Rata-rata nilai: ${safeAverage(sumPct, attempts.length)}%`,
        `Nilai tertinggi: ${maxPct}%`,
      ],
    );
  }

  /** Ranking poin per siswa dalam periode (dari point_transactions). */
  private async buildRanking(filters: ReportFilters): Promise<ReportDoc> {
    const where: Record<string, unknown> = {};
    if (filters.period) where.period = normalizePeriod(filters.period);

    const txns = await this.prisma.pointTransaction.findMany({
      where,
      include: {
        student: {
          select: {
            schoolOrigin: true,
            user: { select: { name: true } },
            groupMembers: {
              select: {
                group: {
                  select: { id: true, name: true, programId: true, levelId: true },
                },
              },
            },
          },
        },
      },
      take: 5000,
    });

    const perStudent = new Map<string, { name: string; schoolOrigin: string | null; groups: Set<string>; points: number; count: number }>();
    for (const t of txns) {
      if (
        (filters.groupId || filters.programId || filters.levelId) &&
        !t.student.groupMembers.some(
          (gm) =>
            (!filters.groupId || gm.group.id === filters.groupId) &&
            (!filters.programId || gm.group.programId === filters.programId) &&
            (!filters.levelId || gm.group.levelId === filters.levelId),
        )
      ) {
        continue;
      }
      let b = perStudent.get(t.studentId);
      if (!b) {
        b = {
          name: t.student.user.name,
          schoolOrigin: t.student.schoolOrigin,
          groups: new Set(t.student.groupMembers.map((gm) => gm.group.name)),
          points: 0,
          count: 0,
        };
        perStudent.set(t.studentId, b);
      }
      b.points += t.points;
      b.count += 1;
    }

    const ranked = [...perStudent.values()].sort(
      (a, b) => b.points - a.points || a.name.localeCompare(b.name),
    );
    const rows = ranked.map((s, i) => [
      String(i + 1),
      s.name,
      s.schoolOrigin || '-',
      [...s.groups].join('\n') || '-',
      String(s.points),
      String(s.count),
    ]);

    return this.baseDoc(
      'ranking',
      filters,
      ['Rank', 'Siswa', 'Asal Sekolah', 'Kelompok', 'Total Poin', 'Jml Transaksi'],
      rows,
      [
        `Jumlah siswa terdata: ${rows.length}`,
        `Poin tertinggi: ${ranked[0]?.points ?? 0}`,
      ],
    );
  }

  /** Progres siswa: kehadiran + attempt ujian/latsol + poin dalam periode. */
  private async buildProgress(filters: ReportFilters): Promise<ReportDoc> {
    const period = normalizePeriod(filters.period);
    const range = periodRange(period);

    const progressScope = studentInScope(filters);
    const students = await this.prisma.student.findMany({
      where: {
        ...(filters.studentId ? { id: filters.studentId } : {}),
        ...(progressScope ?? {}),
      },
      select: {
        id: true,
        schoolOrigin: true,
        user: { select: { name: true } },
        groupMembers: { select: { group: { select: { name: true } } } },
      },
      take: 500,
    });
    const ids = students.map((s) => s.id);

    const [attendances, examAttempts, latsolAttempts, txns] = await Promise.all([
      this.prisma.attendance.findMany({
        where: { studentId: { in: ids }, session: { startsAt: { gte: range.gte, lt: range.lt } } },
        select: { studentId: true, status: true },
      }),
      this.prisma.examAttempt.findMany({
        where: { studentId: { in: ids }, status: 'SUBMITTED', submittedAt: { gte: range.gte, lt: range.lt } },
        select: { studentId: true, score: true, maxScore: true },
      }),
      this.prisma.latsolAttempt.findMany({
        where: { studentId: { in: ids }, status: 'SUBMITTED', submittedAt: { gte: range.gte, lt: range.lt } },
        select: { studentId: true, score: true, maxScore: true },
      }),
      this.prisma.pointTransaction.findMany({
        where: { studentId: { in: ids }, period },
        select: { studentId: true, points: true },
      }),
    ]);

    const rows = students.map((s) => {
      const att = attendances.filter((a) => a.studentId === s.id);
      const attOk = att.filter((a) => a.status === 'HADIR' || a.status === 'TERLAMBAT').length;
      const exams = examAttempts.filter((a) => a.studentId === s.id);
      const examPct = safeAverage(
        exams.reduce((sum, a) => sum + safePercent(a.score, a.maxScore), 0),
        exams.length,
      );
      const latsols = latsolAttempts.filter((a) => a.studentId === s.id);
      const points = txns
        .filter((t) => t.studentId === s.id)
        .reduce((sum, t) => sum + t.points, 0);
      return [
        s.user.name,
        s.schoolOrigin || '-',
        s.groupMembers.map((gm) => gm.group.name).join('\n') || '-',
        `${attOk}/${att.length}`,
        `${safePercent(attOk, att.length)}%`,
        String(exams.length),
        `${examPct}%`,
        String(latsols.length),
        String(points),
      ];
    });

    return this.baseDoc(
      'progress',
      { ...filters, period },
      ['Siswa', 'Asal Sekolah', 'Kelompok', 'Sesi Hadir', 'Kehadiran %', 'Ujian Selesai', 'Rata2 Nilai', 'Latsol Selesai', 'Poin'],
      rows,
      [
        `Jumlah siswa: ${rows.length}`,
        `Periode: ${period}`,
      ],
    );
  }
}
