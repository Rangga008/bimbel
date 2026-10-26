// Fase 6 — Reports Service: laporan lanjutan lintas modul (operasional,
// akademik, keuangan) + snapshot beku (arsip) + render CSV/HTML.
// Semua builder WAJIB menangani dataset kosong & pembagian nol
// (tidak boleh muncul #N/A / #DIV/0!) — pakai safeAverage/safePercent.
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import {
  MONTH_FULL_ID,
  REPORT_BRAND,
  REPORT_KIND_META,
  ReportDoc,
  ReportFilters,
  ReportKind,
  ReportChart,
  ReportSection,
  buildFilterText,
  effectiveRange,
  groupScopeWhere,
  invoiceScopeWhere,
  studentInScope,
  fmtDateId,
  fmtDateTimeId,
  monthKeyOf,
  monthLabelOf,
  normalizePeriod,
  numCell,
  periodLabel,
  periodRange,
  reportMoney,
  reportRupiah,
  safeAverage,
  safePercent,
  sectionsByMonth,
} from './report-helpers';
import { barPng, piePng, pieSvg, pieLegendHtml, barSvg } from '../../common/charts/chart-render';

const REPORT_KINDS = new Set<string>(Object.keys(REPORT_KIND_META));
const EMPTY_ROW_TEXT = 'Belum ada data';

/** Nama bulan singkat kalender (Jan=0 … Des=11). */
const CAL_MONTHS = [
  'JAN', 'FEB', 'MAR', 'APR', 'MEI', 'JUN',
  'JUL', 'AGU', 'SEP', 'OKT', 'NOV', 'DES',
];
/** Batas kolom bulan agar rentang sangat panjang tidak membuat tabel melebar. */
const MAX_MONTH_COLS = 24;

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  // =====================================================================
  // Public API
  // =====================================================================

  /**
   * Kolom bulan laporan mengikuti periode yang dipilih user:
   * - Ada `period` (YYYY-MM) atau `from`/`to` → kolom = bulan-bulan dalam
   *   rentang tsb secara kronologis (maks 24; label "MMM", atau "MMM YY" bila
   *   lintas tahun/lebih dari 12 bulan). `indexOf` mengembalikan -1 untuk
   *   tanggal di luar rentang — data luar periode tidak masuk sel bulan.
   * - Tanpa rentang → fallback tahun ajaran 12 kolom mulai `academicStart`
   *   (7 = AGU..JUL untuk rekap pembayaran, 6 = JUL..JUN untuk rekap program
   *   & neraca) dan semua tanggal terpetakan — perilaku lama dipertahankan.
   */
  private monthColumns(
    filters: ReportFilters,
    academicStart: number,
  ): { labels: string[]; indexOf: (d: Date) => number; scoped: boolean } {
    const range = effectiveRange(filters);
    if (range.gte && range.lt && range.lt > range.gte) {
      const y0 = range.gte.getFullYear();
      const m0 = range.gte.getMonth();
      // Bulan terakhir = bulan dari (lt - 1ms) supaya `period` (lt = tanggal 1
      // bulan berikutnya) tidak ikut menambah satu kolom ekstra.
      const end = new Date(range.lt.getTime() - 1);
      const span = Math.min(
        (end.getFullYear() - y0) * 12 + (end.getMonth() - m0) + 1,
        MAX_MONTH_COLS,
      );
      const crossYear = end.getFullYear() !== y0 || span > 12;
      const labels = Array.from({ length: span }, (_, i) => {
        const m = (m0 + i) % 12;
        const y = y0 + Math.floor((m0 + i) / 12);
        return crossYear ? `${CAL_MONTHS[m]} ${String(y).slice(2)}` : CAL_MONTHS[m];
      });
      return {
        labels,
        scoped: true,
        indexOf: (d) => {
          const i = (d.getFullYear() - y0) * 12 + (d.getMonth() - m0);
          return i >= 0 && i < span ? i : -1;
        },
      };
    }
    return {
      labels: Array.from(
        { length: 12 },
        (_, i) => CAL_MONTHS[(academicStart + i) % 12],
      ),
      scoped: false,
      indexOf: (d) => (((d.getMonth() - academicStart) % 12) + 12) % 12,
    };
  }

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
      case 'payment-recap':
        return this.buildPaymentRecap(filters);
      case 'program-recap':
        return this.buildProgramRecap(filters);
      case 'neraca':
        return this.buildNeraca(filters);
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
    ];
    if (doc.description) lines.push(esc(doc.description));
    lines.push('');
    const pushTable = (headers: string[], rows: string[][]) => {
      lines.push(headers.map(esc).join(SEP));
      if (rows.length === 0) {
        lines.push(esc(EMPTY_ROW_TEXT));
      } else {
        for (const row of rows) lines.push(row.map(esc).join(SEP));
      }
      lines.push('');
    };
    if (doc.sections?.length) {
      for (const sec of doc.sections) {
        lines.push(esc(sec.title));
        if (sec.note) lines.push(esc(sec.note));
        pushTable(sec.headers, sec.rows);
      }
    } else {
      pushTable(doc.headers, doc.rows);
    }
    for (const chart of doc.charts ?? []) {
      const total = chart.items.reduce((s, i) => s + i.value, 0);
      lines.push(esc(`Diagram — ${chart.title}`));
      for (const it of chart.items) {
        const pct = total > 0 ? Math.round((it.value / total) * 1000) / 10 : 0;
        lines.push([it.label, numCell(it.value), `${pct}%`].map(esc).join(SEP));
      }
      lines.push('');
    }
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

    let rowCursor = 5;
    if (doc.description) {
      ws.getCell(`A${rowCursor}`).value = doc.description;
      ws.getCell(`A${rowCursor}`).font = { size: 9, italic: true, color: { argb: 'FF444444' } };
      ws.getCell(`A${rowCursor}`).alignment = { wrapText: true };
      rowCursor += 2;
    }

    const border = {
      top: { style: 'thin' as const }, bottom: { style: 'thin' as const },
      left: { style: 'thin' as const }, right: { style: 'thin' as const },
    };
    const writeTable = (headers: string[], rows: string[][]) => {
      const head = ws.getRow(rowCursor);
      head.values = headers;
      head.font = { bold: true };
      head.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };
        cell.border = border;
      });
      rowCursor += 1;
      if (rows.length === 0) {
        const r = ws.getRow(rowCursor);
        r.getCell(1).value = EMPTY_ROW_TEXT;
        r.getCell(1).font = { italic: true, color: { argb: 'FF666666' } };
        rowCursor += 1;
      } else {
        rows.forEach((row) => {
          const r = ws.getRow(rowCursor);
          r.values = row;
          r.eachCell((cell) => {
            // Nilai multi-item dipisah newline (bukan koma) — wrapText bikin
            // tiap item tampil di baris sendiri dalam satu sel.
            cell.alignment = { wrapText: true, vertical: 'top' };
            cell.border = border;
          });
          rowCursor += 1;
        });
      }
      rowCursor += 1;
    };

    if (doc.sections?.length) {
      for (const sec of doc.sections) {
        const t = ws.getRow(rowCursor);
        t.getCell(1).value = sec.title + (sec.note ? ` — ${sec.note}` : '');
        t.getCell(1).font = { bold: true, size: 11, color: { argb: 'FF0F4C81' } };
        rowCursor += 1;
        writeTable(sec.headers, sec.rows);
      }
    } else {
      writeTable(doc.headers, doc.rows);
    }

    // Chart: tabel data + PNG raster (ExcelJS tidak mendukung chart natif).
    for (const chart of doc.charts ?? []) {
      ws.getRow(rowCursor).getCell(1).value = `Diagram — ${chart.title}`;
      ws.getRow(rowCursor).getCell(1).font = { bold: true };
      rowCursor += 1;
      const total = chart.items.reduce((s, i) => s + i.value, 0);
      const imgW = chart.type === 'pie' ? 320 : 480;
      const imgH = chart.type === 'pie' ? 320 : Math.max(60, chart.items.length * 26);
      const img = chart.type === 'pie' ? piePng(chart.items) : barPng(chart.items);
      const imgId = wb.addImage({
        // pngjs menghasilkan Buffer tipe baru — exceljs mengetik Buffer lama.
        buffer: img as unknown as import('exceljs').Image['buffer'],
        extension: 'png',
      });
      // Gambar di kolom E mulai baris data — anchor 0-based, ukuran piksel.
      const imgTop = rowCursor - 1;
      const imgRowSpan = Math.ceil(imgH / 20) + 1;
      ws.addImage(imgId, {
        tl: { col: 4, row: imgTop },
        ext: { width: imgW, height: imgH },
      });
      ws.getRow(rowCursor).values = ['Label', 'Nilai', '%'];
      ws.getRow(rowCursor).font = { bold: true };
      rowCursor += 1;
      for (const it of chart.items) {
        ws.getRow(rowCursor).values = [
          it.label,
          Math.round(it.value * 100) / 100,
          total > 0 ? Math.round((it.value / total) * 1000) / 10 : 0,
        ];
        rowCursor += 1;
      }
      // Pastikan kursor melewati batas bawah gambar.
      rowCursor = Math.max(rowCursor, imgTop + imgRowSpan + 1) + 1;
    }

    if (doc.summaryLines.length) {
      ws.getRow(rowCursor).getCell(1).value = 'Ringkasan';
      ws.getRow(rowCursor).getCell(1).font = { bold: true };
      doc.summaryLines.forEach((s) => {
        rowCursor += 1;
        ws.getRow(rowCursor).getCell(1).value = s;
      });
    }

    // Lebar kolom dari konten terpanjang (cap 42) — hindari "####" di Excel.
    const allHeaders = doc.sections?.length
      ? doc.sections[0].headers
      : doc.headers;
    const allRows = doc.sections?.length
      ? doc.sections.flatMap((s) => s.rows)
      : doc.rows;
    allHeaders.forEach((h, i) => {
      const longest = allRows.reduce(
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
    const tableHtml = (headers: string[], rows: string[][]) => {
      const bodyRows =
        rows.length === 0
          ? `<tr><td colspan="${headers.length || 1}" style="text-align:center;color:#666">${EMPTY_ROW_TEXT}</td></tr>`
          : rows
              .map(
                (row) =>
                  `<tr>${row
                    .map((c) => `<td>${escHtml(c).replace(/\n/g, '<br>')}</td>`)
                    .join('')}</tr>`,
              )
              .join('');
      return `<table><thead><tr>${headers
        .map((h) => `<th>${escHtml(h)}</th>`)
        .join('')}</tr></thead><tbody>${bodyRows}</tbody></table>`;
    };
    const tables = doc.sections?.length
      ? doc.sections
          .map(
            (sec) =>
              `<h3 class="sec">${escHtml(sec.title)}</h3>${sec.note ? `<p class="meta">${escHtml(sec.note)}</p>` : ''}${tableHtml(sec.headers, sec.rows)}`,
          )
          .join('')
      : tableHtml(doc.headers, doc.rows);
    const charts = (doc.charts ?? [])
      .map((c) => {
        const graphic =
          c.type === 'pie'
            ? `<div class="chartwrap">${pieSvg(c.items)}${pieLegendHtml(c.items, (n) => reportRupiah(n))}</div>`
            : `<div class="chartwrap">${barSvg(c.items)}</div>`;
        return `<div class="chart"><h3>${escHtml(c.title)}</h3>${graphic}</div>`;
      })
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
.toolbar{position:sticky;top:0;background:#fff;border-bottom:1px solid #ddd;padding:8px 0;margin:-8px 0 12px;display:flex;gap:8px;align-items:center}
.toolbar button{font-size:13px;padding:6px 14px;border:1px solid #999;border-radius:6px;background:#f5f5f5;cursor:pointer}
.toolbar button.primary{background:#0f4c81;color:#fff;border-color:#0f4c81}
.toolbar .hint{font-size:11px;color:#666}
.desc{font-size:11px;color:#333;background:#f4f7fb;border:1px solid #dbe5f0;border-radius:6px;padding:8px 10px;margin:0 0 12px}
h3.sec{margin:18px 0 4px;color:#0f4c81;page-break-after:avoid}
.chart{margin:14px 0;page-break-inside:avoid}
.chartwrap{display:flex;gap:20px;align-items:flex-start}
@media print{.toolbar{display:none}}
</style></head><body>
<div class="toolbar">
<button class="primary" onclick="window.print()">Cetak / Simpan PDF</button>
<button onclick="window.close()">Tutup</button>
<span class="hint">Pilih "Save as PDF" / "Simpan sebagai PDF" di dialog cetak untuk mengunduh PDF.</span>
</div>
<h1>${escHtml(doc.brand)}</h1>
<h2>${escHtml(doc.title)}</h2>
<p class="meta">Periode: ${escHtml(doc.periodLabel)} · Digenerate: ${escHtml(
      doc.generatedAt,
    )}<br/>Filter: ${escHtml(doc.filterText)}</p>
${doc.description ? `<p class="desc">${escHtml(doc.description)}</p>` : ''}
${charts}
${tables}
${summary}
<script>
// Dialog cetak (di situ ada "Simpan sebagai PDF") dibuka otomatis begitu
// dokumen siap — toolbar di atas jadi fallback bila popup diblokir browser.
window.addEventListener('load', function () {
  setTimeout(function () { window.print(); }, 150);
});
</script>
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
    extra?: {
      sections?: ReportSection[];
      charts?: ReportChart[];
      description?: string;
    },
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
      description: extra?.description,
      headers,
      rows,
      sections: extra?.sections,
      charts: extra?.charts,
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
    const invScope = invoiceScopeWhere(filters);
    if (invScope) Object.assign(where, invScope);

    const invoices = await this.prisma.invoice.findMany({
      where,
      include: {
        student: { select: { user: { select: { name: true } } } },
        package: { select: { name: true, code: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    const HEADERS = ['No. Invoice', 'Siswa', 'Paket', 'Status', 'Total', 'Terbayar', 'Outstanding', 'Tgl Terbit'];
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

    // Tabel terpisah per bulan terbit — lebih mudah dibaca saat laporan
    // menjangkau beberapa bulan.
    const sections = sectionsByMonth(
      invoices,
      (inv) => inv.issuedAt ?? inv.createdAt,
      (inv) => {
        const total = reportMoney(inv.totalAmount);
        const amtPaid = reportMoney(inv.amountPaid);
        return [
          inv.number,
          inv.student.user.name,
          inv.package?.name ?? '-',
          inv.status,
          numCell(total),
          numCell(amtPaid),
          numCell(Math.max(0, total - amtPaid)),
          fmtDateId(inv.issuedAt ?? inv.createdAt),
        ];
      },
      { headers: HEADERS, order: 'asc' },
    );

    return this.baseDoc(
      'invoice',
      filters,
      HEADERS,
      rows,
      [
        `Jumlah invoice: ${invoices.length}`,
        `Total ditagihkan: ${reportRupiah(billed)}`,
        `Total terbayar: ${reportRupiah(paid)}`,
        `Total outstanding: ${reportRupiah(outstanding)}`,
        `Kolektibilitas: ${safePercent(paid, billed)}%`,
      ],
      { sections },
    );
  }

  private async buildPayment(filters: ReportFilters): Promise<ReportDoc> {
    const where: Record<string, unknown> = {};
    const range = effectiveRange(filters);
    if (range.gte || range.lt) where.createdAt = { gte: range.gte, lt: range.lt };
    if (filters.channel) where.channel = filters.channel;
    if (filters.status) where.status = filters.status;
    const payScope = invoiceScopeWhere(filters);
    if (payScope) {
      where.allocations = { some: { invoice: payScope } };
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

    const HEADERS = ['Ref', 'Siswa', 'Channel', 'Metode', 'Status', 'Jumlah', 'Akun', 'Tgl Bayar/Verifikasi'];
    const toRow = (p: (typeof payments)[number]) => {
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
        numCell(reportMoney(p.amount)),
        p.account?.name ?? '-',
        fmtDateTimeId(p.paidAt ?? p.verifiedAt ?? p.createdAt),
      ];
    };
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
      return toRow(p);
    });

    // Tabel terpisah per bulan bayar/verifikasi.
    const sections = sectionsByMonth(
      payments,
      (p) => p.paidAt ?? p.verifiedAt ?? p.createdAt,
      toRow,
      { headers: HEADERS, order: 'asc' },
    );

    return this.baseDoc(
      'payment',
      filters,
      HEADERS,
      rows,
      [
        `Jumlah pembayaran: ${payments.length}`,
        `Total nominal: ${reportRupiah(total)}`,
        `Terverifikasi: ${verified} (${reportRupiah(verifiedAmount)})`,
        `Rasio verifikasi: ${safePercent(verified, payments.length)}%`,
      ],
      { sections },
    );
  }

  /**
   * Rekap pembayaran per jenjang ala rekap Excel lama:
   * NO | ID | Kelas/Prog | Nama | Harga | Pemb Ke | Sisa | <bulan> | Total Masuk.
   * Kolom bulan mengikuti periode filter (fallback: tahun ajaran AGU–JUL);
   * sel bulan = uang masuk untuk invoice yang jatuh tempo di bulan tsb.
   * Baris diurutkan per jenjang — tanpa filter jenjang semua jenjang muncul.
   */
  private async buildPaymentRecap(filters: ReportFilters): Promise<ReportDoc> {
    const where: Record<string, unknown> = {};
    if (filters.studentId) where.studentId = filters.studentId;
    if (filters.programId) where.programId = filters.programId;
    if (filters.levelId) where.levelId = filters.levelId;
    if (filters.groupId) where.groupId = filters.groupId;
    if (filters.search) {
      where.student = { user: { name: { contains: filters.search, mode: 'insensitive' } } };
    }

    const enrollments = await this.prisma.enrollment.findMany({
      where,
      include: {
        student: {
          select: {
            nis: true,
            schoolOrigin: true,
            user: { select: { name: true, phone: true } },
            // Fallback kontak: HP ortu bila HP siswa kosong.
            parentStudents: {
              take: 1,
              select: {
                parent: { select: { user: { select: { phone: true } } } },
              },
            },
          },
        },
        program: { select: { name: true, code: true } },
        level: {
          select: {
            name: true,
            gradeLevel: { select: { name: true, sortOrder: true } },
          },
        },
        group: { select: { name: true } },
        // Invoice utama ditaut via enrollment.invoiceId (relasi
        // EnrollmentPrimaryInvoice), cicilan via invoice.enrollmentId —
        // keduanya harus digabung supaya "Harga" tidak kosong.
        invoice: {
          select: {
            id: true,
            totalAmount: true,
            amountPaid: true,
            dueDate: true,
            createdAt: true,
            status: true,
          },
        },
        invoices: {
          select: {
            id: true,
            totalAmount: true,
            amountPaid: true,
            dueDate: true,
            createdAt: true,
            status: true,
          },
          orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
        },
      },
      take: 500,
    });

    // Kolom bulan mengikuti periode filter; fallback tahun ajaran AGU..JUL.
    const mcols = this.monthColumns(filters, 7);
    const headers = [
      'NO', 'ID', 'Kelas/Prog', 'Nama', 'No HP', 'Sekolah',
      'Harga', 'Pemb Ke', 'Sisa',
      ...mcols.labels, 'Total Masuk',
    ];

    let billed = 0;
    let paidAll = 0;
    const sorted = enrollments.slice().sort((a, b) => {
      const la = a.level?.gradeLevel?.sortOrder ?? 999;
      const lb = b.level?.gradeLevel?.sortOrder ?? 999;
      if (la !== lb) return la - lb;
      const ln = (a.level?.name ?? '').localeCompare(b.level?.name ?? '');
      if (ln !== 0) return ln;
      return a.student.user.name.localeCompare(b.student.user.name);
    });

    const rows = sorted.map((e, i) => {
      // Gabung invoice primer + cicilan, dedupe by id, urut dueDate.
      const all = [...e.invoices];
      if (e.invoice && !all.some((v) => v.id === e.invoice!.id)) {
        all.push(e.invoice);
      }
      all.sort(
        (a, b) =>
          new Date(a.dueDate ?? a.createdAt).getTime() -
          new Date(b.dueDate ?? b.createdAt).getTime(),
      );
      const total = all.reduce((s, v) => s + reportMoney(v.totalAmount), 0);
      const paid = all.reduce((s, v) => s + reportMoney(v.amountPaid), 0);
      billed += total;
      paidAll += paid;
      // Sel bulan = uang masuk invoice yang jatuh tempo di bulan tsb.
      // Invoice di luar kolom periode terpilih tidak masuk sel bulan.
      const months = new Array<number>(mcols.labels.length).fill(0);
      let paidCount = 0;
      for (const inv of all) {
        const p = reportMoney(inv.amountPaid);
        if (p > 0.009) paidCount += 1;
        const d = new Date(inv.dueDate ?? inv.createdAt);
        const idx = mcols.indexOf(d);
        if (idx >= 0) months[idx] += p;
      }
      const kelasProg = e.level?.gradeLevel
        ? `${e.level.gradeLevel.name}/${e.program.code || e.program.name}`
        : `${e.level?.name ?? '-'}/${e.program.code || e.program.name}`;
      const phone =
        e.student.user.phone ||
        e.student.parentStudents[0]?.parent.user.phone ||
        '-';
      return [
        String(i + 1),
        e.student.nis || '-',
        kelasProg,
        e.student.user.name,
        phone,
        e.student.schoolOrigin || '-',
        numCell(total),
        String(paidCount),
        numCell(Math.max(0, total - paid)),
        ...months.map((m) => (m > 0.009 ? numCell(m) : '-')),
        numCell(paid),
      ];
    });

    return this.baseDoc(
      'payment-recap',
      filters,
      headers,
      rows,
      [
        `Jumlah pendaftaran: ${enrollments.length}`,
        `Total ditagihkan: ${reportRupiah(billed)}`,
        `Total terbayar: ${reportRupiah(paidAll)}`,
        `Total sisa: ${reportRupiah(Math.max(0, billed - paidAll))}`,
        `Kolektibilitas: ${safePercent(paidAll, billed)}%`,
      ],
    );
  }

  /**
   * Rekap per program ala sheet Excel operasional:
   * PROGRAM | KELAS | JML SISWA | BIAYA DAFTAR | BIAYA LES | TOTAL |
   * JUL..JUN | TOTAL MASUK — dikelompokkan per program dengan baris
   * subtotal per program. Di bawahnya blok ringkasan AR per jenjang:
   * total biaya, uang masuk, outstanding, jumlah siswa, rata-rata bayaran.
   * Uang masuk per bulan dihitung dari payment.paidAt (alokasi VERIFIED).
   */
  private async buildProgramRecap(filters: ReportFilters): Promise<ReportDoc> {
    const where: Record<string, unknown> = {};
    if (filters.studentId) where.studentId = filters.studentId;
    if (filters.programId) where.programId = filters.programId;
    if (filters.levelId) where.levelId = filters.levelId;
    if (filters.groupId) where.groupId = filters.groupId;
    if (filters.search) {
      where.student = { user: { name: { contains: filters.search, mode: 'insensitive' } } };
    }

    const invSelect = {
      id: true,
      totalAmount: true,
      amountPaid: true,
      status: true,
      items: { select: { description: true, amount: true } },
      allocations: {
        select: {
          amount: true,
          payment: { select: { paidAt: true, status: true } },
        },
      },
    } as const;

    const enrollments = await this.prisma.enrollment.findMany({
      where,
      include: {
        program: { select: { name: true, code: true } },
        level: {
          select: {
            name: true,
            sortOrder: true,
            gradeLevel: { select: { sortOrder: true } },
          },
        },
        invoice: { select: invSelect },
        invoices: { select: invSelect },
      },
      take: 1000,
    });

    // Kolom bulan mengikuti periode filter; fallback tahun ajaran JUL..JUN.
    const mcols = this.monthColumns(filters, 6);
    const monthIdx = mcols.indexOf;
    const MONTH_COUNT = mcols.labels.length;
    const REGFEE_RE = /daftar|pendaftaran/i;

    // Agregat per program → level.
    type LevelAgg = {
      name: string;
      sortOrder: number;
      students: number;
      regFee: number;
      billed: number;
      paid: number;
      months: number[];
    };
    const programs = new Map<string, { name: string; levels: Map<string, LevelAgg> }>();

    for (const e of enrollments) {
      const progName = e.program.name;
      const levelName = e.level?.name ?? 'Tanpa Jenjang';
      const sortOrder =
        (e.level?.gradeLevel?.sortOrder ?? 0) * 100 + (e.level?.sortOrder ?? 0);
      let prog = programs.get(e.programId);
      if (!prog) {
        prog = { name: progName, levels: new Map() };
        programs.set(e.programId, prog);
      }
      let lvl = prog.levels.get(levelName);
      if (!lvl) {
        lvl = { name: levelName, sortOrder, students: 0, regFee: 0, billed: 0, paid: 0, months: new Array(MONTH_COUNT).fill(0) };
        prog.levels.set(levelName, lvl);
      }
      lvl.students += 1;

      // Gabung invoice primer + cicilan, dedupe by id.
      const invs = [...e.invoices];
      if (e.invoice && !invs.some((v) => v.id === e.invoice!.id)) {
        invs.push(e.invoice);
      }
      for (const inv of invs) {
        if (inv.status === 'VOID') continue;
        const billed = reportMoney(inv.totalAmount);
        lvl.billed += billed;
        lvl.regFee += inv.items
          .filter((it) => REGFEE_RE.test(it.description))
          .reduce((s, it) => s + reportMoney(it.amount), 0);
        for (const al of inv.allocations) {
          if (al.payment.status !== 'VERIFIED' || !al.payment.paidAt) continue;
          const amt = reportMoney(al.amount);
          lvl.paid += amt;
          const mi = monthIdx(new Date(al.payment.paidAt));
          if (mi >= 0) lvl.months[mi] += amt;
        }
      }
    }

    const headers = [
      'PROGRAM', 'KELAS', 'Jml Siswa', 'Biaya Daftar', 'Biaya Les',
      'TOTAL', ...mcols.labels, 'Total Masuk',
    ];
    const COLS = headers.length;
    const blank = () => Array.from({ length: COLS }, () => '');

    const rows: string[][] = [];
    const grand = { students: 0, regFee: 0, les: 0, billed: 0, paid: 0, months: new Array<number>(MONTH_COUNT).fill(0) };

    for (const prog of [...programs.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const levels = [...prog.levels.values()].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      );
      const sub = { students: 0, regFee: 0, les: 0, billed: 0, paid: 0, months: new Array<number>(MONTH_COUNT).fill(0) };
      levels.forEach((lvl, i) => {
        const les = lvl.billed - lvl.regFee;
        rows.push([
          i === 0 ? prog.name : '',
          lvl.name,
          String(lvl.students),
          numCell(lvl.regFee),
          numCell(les),
          numCell(lvl.billed),
          ...lvl.months.map((m) => (m > 0.009 ? numCell(m) : '-')),
          numCell(lvl.paid),
        ]);
        sub.students += lvl.students;
        sub.regFee += lvl.regFee;
        sub.les += les;
        sub.billed += lvl.billed;
        sub.paid += lvl.paid;
        lvl.months.forEach((m, j) => (sub.months[j] += m));
      });
      rows.push([
        `TOTAL ${prog.name}`,
        '',
        String(sub.students),
        numCell(sub.regFee),
        numCell(sub.les),
        numCell(sub.billed),
        ...sub.months.map((m) => (m > 0.009 ? numCell(m) : '-')),
        numCell(sub.paid),
      ]);
      grand.students += sub.students;
      grand.regFee += sub.regFee;
      grand.les += sub.les;
      grand.billed += sub.billed;
      grand.paid += sub.paid;
      sub.months.forEach((m, j) => (grand.months[j] += m));
    }
    rows.push([
      'TOTAL SEMUA PROGRAM',
      '',
      String(grand.students),
      numCell(grand.regFee),
      numCell(grand.les),
      numCell(grand.billed),
      ...grand.months.map((m) => (m > 0.009 ? numCell(m) : '-')),
      numCell(grand.paid),
    ]);

    // ---- Blok 2: ringkasan AR per jenjang (disusun di bawah tabel utama,
    // seperti dua tabel bertumpuk di sheet referensi). ----
    rows.push(blank());
    rows.push([
      'PROGRAM/JENJANG', 'TOTAL BIAYA', 'AR PAYMENT (UANG MASUK)',
      '% MASUK', 'AR OUTSTANDING', '% SISA', 'JUMLAH SISWA',
      'TARGET SISWA', 'KURANG SISWA', 'RATA-RATA/TAHUN', 'RATA-RATA/BULAN',
    ]);
    for (const prog of [...programs.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      for (const lvl of [...prog.levels.values()].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      )) {
        const outstanding = Math.max(0, lvl.billed - lvl.paid);
        rows.push([
          `${prog.name} · ${lvl.name}`,
          numCell(lvl.billed),
          numCell(lvl.paid),
          `${safePercent(lvl.paid, lvl.billed)}%`,
          numCell(outstanding),
          `${safePercent(outstanding, lvl.billed)}%`,
          String(lvl.students),
          '-',
          '-',
          numCell(Math.round(safeAverage(lvl.billed, lvl.students))),
          numCell(Math.round(safeAverage(lvl.billed, lvl.students) / 12)),
        ]);
      }
    }
    const grandOutstanding = Math.max(0, grand.billed - grand.paid);
    rows.push([
      'TOTAL',
      numCell(grand.billed),
      numCell(grand.paid),
      `${safePercent(grand.paid, grand.billed)}%`,
      numCell(grandOutstanding),
      `${safePercent(grandOutstanding, grand.billed)}%`,
      String(grand.students),
      '-',
      '-',
      numCell(Math.round(safeAverage(grand.billed, grand.students))),
      numCell(Math.round(safeAverage(grand.billed, grand.students) / 12)),
    ]);

    return this.baseDoc(
      'program-recap',
      filters,
      headers,
      rows,
      [
        `Jumlah program: ${programs.size}`,
        `Jumlah siswa (pendaftaran): ${enrollments.length}`,
        `Total ditagihkan: ${reportRupiah(grand.billed)}`,
        `Total uang masuk: ${reportRupiah(grand.paid)}`,
        `Total outstanding: ${reportRupiah(grandOutstanding)}`,
      ],
    );
  }

  /**
   * Neraca ala sheet "RANGKUMAN PEMASUKAN DAN PENGELUARAN":
   * baris pertama SELISIH (untung/rugi), lalu blok PEMASUKAN per program
   * (dari alokasi payment VERIFIED berdasar paidAt), blok PENGELUARAN per
   * kategori RAB (expense.occurredAt), masing-masing dengan kolom
   * % | JUMLAH | RATA-RATA/BULAN | <bulan periode terpilih / JUL..JUN>.
   * Rata-rata = total / jumlah bulan berisi (anti #DIV/0!).
   */
  private async buildNeraca(filters: ReportFilters): Promise<ReportDoc> {
    const payments = await this.prisma.payment.findMany({
      where: { status: 'VERIFIED', paidAt: { not: null } },
      select: {
        paidAt: true,
        allocations: {
          select: {
            amount: true,
            invoice: {
              select: {
                enrollmentLink: {
                  select: { program: { select: { name: true } } },
                },
                enrollment: {
                  select: { program: { select: { name: true } } },
                },
                package: {
                  select: {
                    level: {
                      select: { program: { select: { name: true } } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    const expenses = await this.prisma.expense.findMany({
      select: { category: true, amount: true, occurredAt: true },
    });

    // Kolom bulan mengikuti periode filter; fallback tahun ajaran JUL..JUN.
    // Saat periode dipilih, data di luar rentang tidak dihitung sama sekali
    // (neraca memang laporan per-periode).
    const mcols = this.monthColumns(filters, 6);
    const monthIdx = mcols.indexOf;
    const months = () => new Array<number>(mcols.labels.length).fill(0);

    type Bucket = { total: number; months: number[] };
    const income = new Map<string, Bucket>();
    const incomeTotal: Bucket = { total: 0, months: months() };
    for (const p of payments) {
      const idx = monthIdx(new Date(p.paidAt!));
      if (idx < 0) continue;
      for (const al of p.allocations) {
        const prog =
          al.invoice.enrollmentLink?.program?.name ??
          al.invoice.enrollment?.program?.name ??
          al.invoice.package?.level?.program?.name ??
          'LAIN-LAIN';
        const amt = reportMoney(al.amount);
        const b = income.get(prog) ?? { total: 0, months: months() };
        b.total += amt;
        b.months[idx] += amt;
        income.set(prog, b);
        incomeTotal.total += amt;
        incomeTotal.months[idx] += amt;
      }
    }

    // Urutan kategori mengikuti enum BudgetCategory (seperti sheet referensi).
    const CATEGORY_LABELS: Record<string, string> = {
      PENGADAAN_RUANG_BELAJAR: 'Pengadaan Ruang Belajar',
      PERSIAPAN_TAHUN_AJARAN: 'Persiapan Tahun Ajaran',
      OVERHEAD_RUMAH_TANGGA: 'Over Head dan Rumah Tangga',
      LOGISTIK_PERAWATAN: 'Logistik dan Perawatan',
      AKADEMIK: 'Akademik',
      MARKETING: 'Marketing',
      KESEHATAN_TUNJANGAN: 'Kesehatan dan Tunjangan',
      HONOR_PEGAWAI: 'Honor Pegawai',
      LAIN_LAIN: 'Lain-Lain',
    };
    const expense = new Map<string, Bucket>(
      Object.keys(CATEGORY_LABELS).map((c) => [c, { total: 0, months: months() }]),
    );
    const expenseTotal: Bucket = { total: 0, months: months() };
    for (const e of expenses) {
      const idx = monthIdx(new Date(e.occurredAt));
      if (idx < 0) continue;
      const b = expense.get(e.category) ?? { total: 0, months: months() };
      b.total += reportMoney(e.amount);
      b.months[idx] += reportMoney(e.amount);
      expense.set(e.category, b);
      expenseTotal.total += reportMoney(e.amount);
      expenseTotal.months[idx] += reportMoney(e.amount);
    }

    const headers = [
      'KETERANGAN', '%', 'JUMLAH', 'RATA-RATA PER-BULAN', ...mcols.labels,
    ];
    const COLS = headers.length;
    const blank = () => Array.from({ length: COLS }, () => '');
    const avgOf = (b: Bucket) =>
      safeAverage(b.total, b.months.filter((m) => Math.abs(m) > 0.009).length);
    const monthCells = (arr: number[]) =>
      arr.map((m) => (Math.abs(m) > 0.009 ? numCell(m) : '-'));

    const selisih: Bucket = {
      total: incomeTotal.total - expenseTotal.total,
      months: incomeTotal.months.map((m, i) => m - expenseTotal.months[i]),
    };

    const rows: string[][] = [
      [
        'SELISIH (UNTUNG/RUGI) NOMINAL',
        '-',
        numCell(selisih.total),
        numCell(Math.round(avgOf(selisih))),
        ...monthCells(selisih.months),
      ],
      blank(),
      ['PEMASUKAN', ...Array.from({ length: COLS - 1 }, () => '')],
    ];

    for (const [name, b] of [...income.entries()].sort(
      (a, b2) => b2[1].total - a[1].total,
    )) {
      rows.push([
        name,
        `${safePercent(b.total, incomeTotal.total)}%`,
        numCell(b.total),
        numCell(Math.round(avgOf(b))),
        ...monthCells(b.months),
      ]);
    }
    rows.push([
      'TOTAL PEMASUKAN',
      '100%',
      numCell(incomeTotal.total),
      numCell(Math.round(avgOf(incomeTotal))),
      ...monthCells(incomeTotal.months),
    ]);
    rows.push(blank());
    rows.push(['PENGELUARAN', ...Array.from({ length: COLS - 1 }, () => '')]);
    for (const [cat, b] of expense) {
      rows.push([
        CATEGORY_LABELS[cat] ?? cat,
        `${safePercent(b.total, expenseTotal.total)}%`,
        numCell(b.total),
        numCell(Math.round(avgOf(b))),
        ...monthCells(b.months),
      ]);
    }
    rows.push([
      'TOTAL PENGELUARAN',
      '100%',
      numCell(expenseTotal.total),
      numCell(Math.round(avgOf(expenseTotal))),
      ...monthCells(expenseTotal.months),
    ]);

    return this.baseDoc(
      'neraca',
      filters,
      headers,
      rows,
      [
        `Total pemasukan: ${reportRupiah(incomeTotal.total)}`,
        `Total pengeluaran: ${reportRupiah(expenseTotal.total)}`,
        `Selisih (untung/rugi): ${reportRupiah(selisih.total)}`,
        `Program pemasukan: ${income.size} · Kategori pengeluaran: ${expense.size}`,
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

    // Label kategori Bahasa Indonesia (sama seperti blok pengeluaran neraca).
    const CATEGORY_LABELS: Record<string, string> = {
      PENGADAAN_RUANG_BELAJAR: 'Pengadaan Ruang Belajar',
      PERSIAPAN_TAHUN_AJARAN: 'Persiapan Tahun Ajaran',
      OVERHEAD_RUMAH_TANGGA: 'Overhead & Rumah Tangga',
      LOGISTIK_PERAWATAN: 'Logistik & Perawatan',
      AKADEMIK: 'Akademik',
      MARKETING: 'Marketing',
      KESEHATAN_TUNJANGAN: 'Kesehatan & Tunjangan',
      HONOR_PEGAWAI: 'Honor Pegawai',
      LAIN_LAIN: 'Lain-Lain',
    };
    const label = (c: string) => CATEGORY_LABELS[c] ?? c;

    let totalBudget = 0;
    let totalActual = 0;
    const chartItems: { label: string; value: number }[] = [];
    const rows = budgets.map((b) => {
      const matched = expenses.filter(
        (e) => e.budgetId === b.id || e.category === b.category,
      );
      const actual = matched.reduce((sum, e) => sum + reportMoney(e.amount), 0);
      const budgetAmount = reportMoney(b.amount);
      const variance = budgetAmount - actual;
      totalBudget += budgetAmount;
      totalActual += actual;
      if (actual > 0.009) chartItems.push({ label: label(b.category), value: actual });
      return [
        label(b.category),
        numCell(budgetAmount),
        numCell(actual),
        numCell(variance),
        `${safePercent(actual, budgetAmount)}%`,
        String(matched.length),
      ];
    });

    return this.baseDoc(
      'rab',
      { ...filters, period },
      ['Kategori', 'Anggaran (RAB)', 'Realisasi', 'Selisih', 'Serapan %', 'Jml Pengeluaran'],
      rows,
      [
        `Total anggaran (RAB): ${reportRupiah(totalBudget)}`,
        `Total realisasi: ${reportRupiah(totalActual)}`,
        `Sisa anggaran: ${reportRupiah(totalBudget - totalActual)}`,
        `Serapan keseluruhan: ${safePercent(totalActual, totalBudget)}%`,
      ],
      {
        description:
          'Laporan ini membandingkan Anggaran (RAB) per kategori dengan Realisasi ' +
          'pengeluaran pada periode yang sama. Selisih = Anggaran − Realisasi ' +
          '(positif = masih ada sisa anggaran, negatif = over budget). Serapan % ' +
          '= berapa persen anggaran yang sudah terpakai. Diagram lingkaran ' +
          'menunjukkan komposisi realisasi per kategori.',
        charts: [
          {
            type: 'pie',
            title: 'Komposisi Realisasi per Kategori',
            items: chartItems,
          },
        ],
      },
    );
  }

  /**
   * Revenue = pembayaran VERIFIED dalam periode, dikelompokkan per channel.
   * Rentang multi-bulan ditampilkan sebagai tabel terpisah per bulan.
   */
  private async buildRevenue(filters: ReportFilters): Promise<ReportDoc> {
    // Tanpa filter eksplisit → bulan berjalan (perilaku lama).
    const effective: ReportFilters =
      filters.period || filters.from || filters.to
        ? filters
        : { ...filters, period: normalizePeriod(null) };
    const range = effectiveRange(effective);
    const payments = await this.prisma.payment.findMany({
      where: { status: 'VERIFIED', paidAt: { gte: range.gte, lt: range.lt } },
      select: { channel: true, method: true, amount: true, paidAt: true },
    });

    const HEADERS = ['Channel / Metode', 'Jml Transaksi', 'Total Revenue'];
    // Bulan → channel → agregat.
    const perMonth = new Map<string, Map<string, { count: number; total: number }>>();
    for (const p of payments) {
      if (!p.paidAt) continue;
      const mkey = monthKeyOf(new Date(p.paidAt));
      const monthMap = perMonth.get(mkey) ?? new Map<string, { count: number; total: number }>();
      const key = `${p.channel} / ${p.method}`;
      const bucket = monthMap.get(key) ?? { count: 0, total: 0 };
      bucket.count += 1;
      bucket.total += reportMoney(p.amount);
      monthMap.set(key, bucket);
      perMonth.set(mkey, monthMap);
    }

    let grandTotal = 0;
    const sections: ReportSection[] = [...perMonth.keys()]
      .sort((a, b) => a.localeCompare(b))
      .map((mkey) => {
        const rows = [...perMonth.get(mkey)!.entries()].map(([channel, v]) => {
          grandTotal += v.total;
          return [channel, String(v.count), numCell(v.total)];
        });
        const subtotal = [...perMonth.get(mkey)!.values()].reduce((s, v) => s + v.total, 0);
        return {
          title: monthLabelOf(mkey),
          note: `Total bulan ini: ${reportRupiah(subtotal)}`,
          headers: HEADERS,
          rows,
        };
      });

    const flatRows = sections.flatMap((s) => [[`— ${s.title} —`, '', ''], ...s.rows]);

    return this.baseDoc(
      'revenue',
      effective,
      HEADERS,
      flatRows,
      [
        `Total revenue: ${reportRupiah(grandTotal)}`,
        `Jumlah transaksi verified: ${payments.length}`,
        `Rata-rata per transaksi: ${reportRupiah(safeAverage(grandTotal, payments.length))}`,
      ],
      { sections },
    );
  }

  /**
   * Piutang = invoice ISSUED dengan outstanding > 0, plus umur piutang.
   * Dikelompokkan per bulan jatuh tempo supaya aging mudah dibaca.
   */
  private async buildAr(filters: ReportFilters): Promise<ReportDoc> {
    const arScope = studentInScope(filters);
    const invoices = await this.prisma.invoice.findMany({
      where: { status: 'ISSUED', ...(arScope ? { student: arScope } : {}) },
      include: { student: { select: { user: { select: { name: true } } } } },
      orderBy: { dueDate: 'asc' },
      take: 500,
    });

    const HEADERS = ['No. Invoice', 'Siswa', 'Jatuh Tempo', 'Total', 'Terbayar', 'Outstanding', 'Umur', 'Reminder'];
    const now = Date.now();
    let totalAr = 0;
    let overdueCount = 0;
    const toRow = (inv: (typeof invoices)[number]) => {
      const total = reportMoney(inv.totalAmount);
      const paid = reportMoney(inv.amountPaid);
      const outstanding = total - paid;
      const overdueDays = inv.dueDate
        ? Math.floor((now - new Date(inv.dueDate).getTime()) / 86400000)
        : 0;
      const isOverdue = overdueDays > 0;
      return {
        outstanding,
        isOverdue,
        cells: [
          inv.number,
          inv.student.user.name,
          fmtDateId(inv.dueDate),
          numCell(total),
          numCell(paid),
          numCell(outstanding),
          isOverdue ? `${overdueDays} hari` : 'Belum jatuh tempo',
          inv.reminderStatus,
        ] as string[],
      };
    };
    const open = invoices
      .map((inv) => ({ inv, r: toRow(inv) }))
      .filter((x) => x.r.outstanding > 0.009);
    for (const x of open) {
      totalAr += x.r.outstanding;
      if (x.r.isOverdue) overdueCount += 1;
    }
    const rows = open.map((x) => x.r.cells);

    const sections = sectionsByMonth(
      open,
      (x) => x.inv.dueDate,
      (x) => x.r.cells,
      {
        headers: HEADERS,
        order: 'asc',
        noMonthLabel: 'Tanpa tanggal jatuh tempo',
        titleOf: (k) => `Jatuh tempo — ${monthLabelOf(k)}`,
      },
    );

    return this.baseDoc(
      'ar',
      filters,
      HEADERS,
      rows,
      [
        `Jumlah piutang: ${rows.length}`,
        `Total piutang: ${reportRupiah(totalAr)}`,
        `Lewat jatuh tempo: ${overdueCount} invoice`,
      ],
      { sections },
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
        session: { select: { startsAt: true } },
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

    // Rekap per bulan → per siswa: tabel "nama bulan" berisi absen siswa di
    // bulan itu sesuai filter, lalu bulan berikutnya di bawahnya.
    type StuBucket = { name: string; schoolOrigin: string | null; groups: Set<string>; counts: Record<string, number>; total: number };
    const perMonth = new Map<string, Map<string, StuBucket>>();
    let allTotal = 0;
    let sumRateAll = 0;
    const allStudents = new Set<string>();
    for (const r of rows0) {
      const mkey = r.session?.startsAt ? monthKeyOf(new Date(r.session.startsAt)) : 'tanpa-tanggal';
      let monthMap = perMonth.get(mkey);
      if (!monthMap) {
        monthMap = new Map();
        perMonth.set(mkey, monthMap);
      }
      let b = monthMap.get(r.studentId);
      if (!b) {
        b = {
          name: r.student.user.name,
          schoolOrigin: r.student.schoolOrigin,
          groups: new Set(r.student.groupMembers.map((gm) => gm.group.name)),
          counts: { HADIR: 0, TERLAMBAT: 0, IZIN: 0, SAKIT: 0, ALFA: 0 },
          total: 0,
        };
        monthMap.set(r.studentId, b);
        allStudents.add(r.studentId);
      }
      b.counts[r.status] = (b.counts[r.status] ?? 0) + 1;
      b.total += 1;
      allTotal += 1;
    }

    const HEADERS = ['Siswa', 'Asal Sekolah', 'Kelompok', 'Hadir', 'Terlambat', 'Izin', 'Sakit', 'Alfa', 'Total Sesi', 'Kehadiran %'];
    const stuRow = (s: StuBucket) => {
      const rate = safePercent(s.counts.HADIR + s.counts.TERLAMBAT, s.total);
      sumRateAll += rate;
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
    };

    const monthKeys = [...perMonth.keys()].sort((a, b) => a.localeCompare(b));
    const sections: ReportSection[] = monthKeys.map((k) => ({
      title: k === 'tanpa-tanggal' ? 'Tanpa tanggal sesi' : monthLabelOf(k),
      headers: HEADERS,
      rows: [...perMonth.get(k)!.values()]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(stuRow),
    }));
    const rows = sections.flatMap((s) => [[`— ${s.title} —`, ...Array(HEADERS.length - 1).fill('')], ...s.rows]);

    return this.baseDoc(
      'attendance',
      filters,
      HEADERS,
      rows,
      [
        `Jumlah siswa: ${allStudents.size}`,
        `Total catatan absensi: ${rows0.length}`,
        `Rata-rata kehadiran: ${safeAverage(sumRateAll, allTotal ? allStudents.size : 0)}%`,
      ],
      { sections },
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
          select: { status: true, startsAt: true },
        },
      },
      orderBy: { name: 'asc' },
      take: 500,
    });

    const HEADERS = ['Kode', 'Kelompok', 'Program', 'Level', 'Member', 'Kapasitas', 'Utilisasi', 'Tutor', 'Sesi', 'Sesi Selesai', 'Status'];
    const groupRow = (g: (typeof groups)[number], sess: { status: string }[]) => {
      const capacity = g.capacity ?? 0;
      const util = safePercent(g._count.members, capacity);
      const completed = sess.filter((s) => s.status === 'COMPLETED').length;
      return [
        g.code ?? '-',
        g.name,
        g.program.name,
        g.level?.name ?? '-',
        String(g._count.members),
        capacity > 0 ? String(capacity) : '-',
        capacity > 0 ? `${util}%` : '-',
        String(g._count.tutors),
        String(sess.length),
        String(completed),
        g.isActive ? 'AKTIF' : 'NONAKTIF',
      ];
    };

    // Tabel terpisah per bulan sesi: aktivitas kelompok bulan itu di bawah
    // judul bulannya, bulan berikutnya di bawahnya lagi.
    const monthKeys = [
      ...new Set(
        groups.flatMap((g) =>
          g.sessions.map((s) => monthKeyOf(new Date(s.startsAt))),
        ),
      ),
    ].sort((a, b) => a.localeCompare(b));

    let sections: ReportSection[] | undefined;
    let rows: string[][];
    let sumUtil = 0;
    if (monthKeys.length) {
      sections = monthKeys.map((k) => ({
        title: `Sesi ${monthLabelOf(k)}`,
        headers: HEADERS,
        rows: groups
          .map((g) => ({
            g,
            sess: g.sessions.filter(
              (s) => monthKeyOf(new Date(s.startsAt)) === k,
            ),
          }))
          .filter((x) => x.sess.length > 0)
          .map((x) => groupRow(x.g, x.sess)),
      }));
      rows = sections.flatMap((s) => [[`— ${s.title} —`, ...Array(HEADERS.length - 1).fill('')], ...s.rows]);
      for (const g of groups) sumUtil += safePercent(g._count.members, g.capacity ?? 0);
    } else {
      // Tidak ada sesi dalam periode — tetap tampilkan rekap kelompok utuh.
      rows = groups.map((g) => groupRow(g, []));
      for (const g of groups) sumUtil += safePercent(g._count.members, g.capacity ?? 0);
    }

    return this.baseDoc(
      'groups',
      filters,
      HEADERS,
      rows,
      [
        `Jumlah kelompok: ${groups.length}`,
        `Rata-rata utilisasi: ${safeAverage(sumUtil, groups.length)}%`,
      ],
      sections ? { sections } : undefined,
    );
  }

  /**
   * Kinerja tutor: sesi diajar + work items + payroll — tabel terpisah per
   * bulan dalam rentang filter (fallback: bulan berjalan).
   */
  private async buildTutor(filters: ReportFilters): Promise<ReportDoc> {
    // Rentang efektif — default bulan berjalan seperti sebelumnya.
    const effective: ReportFilters =
      filters.period || filters.from || filters.to
        ? filters
        : { ...filters, period: normalizePeriod(null) };
    const range = effectiveRange(effective);
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
          select: { status: true, startsAt: true },
        },
        workItems: { select: { amount: true, period: true } },
        payrollRuns: { select: { netAmount: true, status: true, period: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });

    // Daftar bulan dalam rentang (YYYY-MM) — workItems/payrollRun disimpan
    // per period 'YYYY-MM' jadi dibucketkan ke bulan yang sama.
    const mRange: string[] = [];
    if (range.gte && range.lt) {
      const d = new Date(range.gte.getFullYear(), range.gte.getMonth(), 1);
      const end = new Date(range.lt.getTime() - 1);
      while (d <= end && mRange.length < 24) {
        mRange.push(monthKeyOf(d));
        d.setMonth(d.getMonth() + 1);
      }
    }

    const HEADERS = ['Tutor', 'Kelompok', 'Sesi', 'Sesi Selesai', 'Work Items', 'Honor Work Items', 'Payroll Net', 'Payroll'];
    const tutorRow = (
      t: (typeof tutors)[number],
      mkey: string,
    ) => {
      const sess = t.sessions.filter(
        (s) => monthKeyOf(new Date(s.startsAt)) === mkey,
      );
      const completed = sess.filter((s) => s.status === 'COMPLETED').length;
      const works = t.workItems.filter((w) => w.period === mkey);
      const runs = t.payrollRuns.filter((r) => r.period === mkey);
      const workAmount = works.reduce((s, w) => s + reportMoney(w.amount), 0);
      const payrollNet = runs.reduce((s, r) => s + reportMoney(r.netAmount), 0);
      const payrollStatus =
        runs.length === 0 ? '-' : runs.every((r) => r.status === 'PAID') ? 'PAID' : 'UNPAID';
      return {
        active: sess.length + works.length + runs.length > 0,
        honor: workAmount,
        cells: [
          t.user.name,
          t.groupTutors.map((gt) => gt.group.name).join('\n') || '-',
          String(sess.length),
          String(completed),
          String(works.length),
          numCell(workAmount),
          numCell(payrollNet),
          payrollStatus,
        ] as string[],
      };
    };

    let totalHonor = 0;
    const sections: ReportSection[] = mRange.map((mkey) => {
      const rows = tutors
        .map((t) => tutorRow(t, mkey))
        .filter((x) => x.active || !filters.tutorId)
        .map((x) => {
          totalHonor += x.honor;
          return x.cells;
        });
      return { title: monthLabelOf(mkey), headers: HEADERS, rows };
    });
    const rows = sections.flatMap((s) => [[`— ${s.title} —`, ...Array(HEADERS.length - 1).fill('')], ...s.rows]);

    return this.baseDoc(
      'tutor',
      effective,
      HEADERS,
      rows,
      [
        `Jumlah tutor aktif: ${tutors.length}`,
        `Total honor work items: ${reportRupiah(totalHonor)}`,
      ],
      { sections },
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
        groupMembers: {
          select: {
            group: {
              select: {
                name: true,
                level: { select: { name: true, sortOrder: true } },
              },
            },
          },
        },
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

    const HEADERS = ['Siswa', 'Asal Sekolah', 'Kelompok'];
    const stuRow = (s: (typeof students)[number]) => [
      s.user.name,
      s.schoolOrigin?.trim() || '-',
      s.groupMembers.map((gm) => gm.group.name).join('\n') || '-',
    ];

    // Tabel terpisah per jenjang (jenjang kelompok siswa): "SD Kelas 5" di
    // atas, siswanya di bawahnya, lalu jenjang berikutnya. Siswa lintas
    // jenjang muncul di tiap jenjangnya; tanpa kelompok → "Tanpa Jenjang".
    const perLevel = new Map<string, { sort: number; rows: string[][]; ids: Set<string> }>();
    for (const s of students) {
      const levels = s.groupMembers
        .map((gm) => gm.group.level?.name)
        .filter((n): n is string => Boolean(n));
      const keys = levels.length ? [...new Set(levels)] : ['Tanpa Jenjang'];
      for (const key of keys) {
        const sort = Math.min(
          ...s.groupMembers
            .filter((gm) => gm.group.level?.name === key)
            .map((gm) => gm.group.level!.sortOrder ?? 999),
          999,
        );
        let b = perLevel.get(key);
        if (!b) {
          b = { sort, rows: [], ids: new Set() };
          perLevel.set(key, b);
        }
        if (!b.ids.has(s.id)) {
          b.ids.add(s.id);
          b.rows.push(stuRow(s));
        }
      }
    }

    const sections: ReportSection[] | undefined = perLevel.size
      ? [...perLevel.entries()]
          .sort((a, b) => a[1].sort - b[1].sort || a[0].localeCompare(b[0]))
          .map(([title, b]) => ({ title, headers: HEADERS, rows: b.rows }))
      : undefined;

    const rows = students.map(stuRow);

    return this.baseDoc(
      'students',
      filters,
      HEADERS,
      rows,
      [
        `Jumlah siswa: ${students.length}`,
        `Sekolah penyumbang terbanyak: ${schoolAgg[0] ? `${schoolAgg[0][0]} (${schoolAgg[0][1]} siswa)` : '-'}`,
        ...schoolAgg.slice(0, 10).map(([school, n]) => `${school}: ${n} siswa`),
      ],
      sections ? { sections } : undefined,
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
                  select: {
                    id: true,
                    name: true,
                    programId: true,
                    levelId: true,
                    level: { select: { name: true, sortOrder: true } },
                  },
                },
              },
            },
          },
        },
      },
      take: 5000,
    });

    const perStudent = new Map<
      string,
      {
        name: string;
        schoolOrigin: string | null;
        // jenjang → kelompok: "SD Kelas 5" → "Kelompok A"
        placements: { levelName: string; levelSort: number; groupName: string }[];
        groups: Set<string>;
        points: number;
        count: number;
      }
    >();
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
          placements: t.student.groupMembers.map((gm) => ({
            levelName: gm.group.level?.name ?? 'Tanpa Jenjang',
            levelSort: gm.group.level?.sortOrder ?? 999,
            groupName: gm.group.name,
          })),
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

    // Tabel terpisah per jenjang → kelompok; siswa di dalamnya diranking
    // ulang per tabel kelompok (urut poin terbanyak).
    const HEADERS = ['Rank', 'Siswa', 'Asal Sekolah', 'Kelompok', 'Total Poin', 'Jml Transaksi'];
    const tree = new Map<string, { sort: number; groups: Map<string, typeof ranked> }>();
    for (const s of ranked) {
      const placements = s.placements.length
        ? s.placements
        : [{ levelName: 'Tanpa Jenjang', levelSort: 999, groupName: 'Tanpa Kelompok' }];
      for (const p of placements) {
        let lvl = tree.get(p.levelName);
        if (!lvl) {
          lvl = { sort: p.levelSort, groups: new Map() };
          tree.set(p.levelName, lvl);
        }
        lvl.sort = Math.min(lvl.sort, p.levelSort);
        let g = lvl.groups.get(p.groupName);
        if (!g) {
          g = [];
          lvl.groups.set(p.groupName, g);
        }
        g.push(s);
      }
    }
    const sections: ReportSection[] = [...tree.entries()]
      .sort((a, b) => a[1].sort - b[1].sort || a[0].localeCompare(b[0]))
      .flatMap(([levelName, lvl]) =>
        [...lvl.groups.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([groupName, list]) => ({
            title: `${levelName} · ${groupName}`,
            headers: HEADERS,
            rows: list.map((s, i) => [
              String(i + 1),
              s.name,
              s.schoolOrigin || '-',
              groupName,
              String(s.points),
              String(s.count),
            ]),
          })),
      );

    return this.baseDoc(
      'ranking',
      filters,
      HEADERS,
      rows,
      [
        `Jumlah siswa terdata: ${rows.length}`,
        `Poin tertinggi: ${ranked[0]?.points ?? 0}`,
      ],
      { sections },
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
        groupMembers: {
          select: {
            group: {
              select: {
                name: true,
                level: { select: { name: true, sortOrder: true } },
              },
            },
          },
        },
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

    const stuRow = (s: (typeof students)[number], groupLabel: string) => {
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
        groupLabel,
        `${attOk}/${att.length}`,
        `${safePercent(attOk, att.length)}%`,
        String(exams.length),
        `${examPct}%`,
        String(latsols.length),
        String(points),
      ];
    };

    const rows = students.map((s) =>
      stuRow(s, s.groupMembers.map((gm) => gm.group.name).join('\n') || '-'),
    );

    // Tabel terpisah per jenjang → kelompok (hierarki jenjang · kelompok ·
    // siswa), siswa lintas kelompok muncul di tiap tabelnya.
    const HEADERS = ['Siswa', 'Asal Sekolah', 'Kelompok', 'Sesi Hadir', 'Kehadiran %', 'Ujian Selesai', 'Rata2 Nilai', 'Latsol Selesai', 'Poin'];
    const tree = new Map<string, { sort: number; groups: Map<string, (typeof students)[number][]> }>();
    for (const s of students) {
      const placements = s.groupMembers.length
        ? s.groupMembers.map((gm) => ({
            levelName: gm.group.level?.name ?? 'Tanpa Jenjang',
            levelSort: gm.group.level?.sortOrder ?? 999,
            groupName: gm.group.name,
          }))
        : [{ levelName: 'Tanpa Jenjang', levelSort: 999, groupName: 'Tanpa Kelompok' }];
      for (const p of placements) {
        let lvl = tree.get(p.levelName);
        if (!lvl) {
          lvl = { sort: p.levelSort, groups: new Map() };
          tree.set(p.levelName, lvl);
        }
        lvl.sort = Math.min(lvl.sort, p.levelSort);
        let g = lvl.groups.get(p.groupName);
        if (!g) {
          g = [];
          lvl.groups.set(p.groupName, g);
        }
        g.push(s);
      }
    }
    const sections: ReportSection[] = [...tree.entries()]
      .sort((a, b) => a[1].sort - b[1].sort || a[0].localeCompare(b[0]))
      .flatMap(([levelName, lvl]) =>
        [...lvl.groups.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([groupName, list]) => ({
            title: `${levelName} · ${groupName}`,
            headers: HEADERS,
            rows: list
              .sort((a, b) => a.user.name.localeCompare(b.user.name))
              .map((s) => stuRow(s, groupName)),
          })),
      );

    return this.baseDoc(
      'progress',
      { ...filters, period },
      HEADERS,
      rows,
      [
        `Jumlah siswa: ${rows.length}`,
        `Periode: ${period}`,
      ],
      { sections },
    );
  }
}
