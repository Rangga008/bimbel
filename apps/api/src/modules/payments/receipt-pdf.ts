// Generator PDF kwitansi (pdfkit — murni JS, tanpa dependensi native).
// Struktur input mengikuti receiptDetailInclude + student/verifier/company,
// sama seperti payload yang dipakai template cetak di web.
import PDFDocument from 'pdfkit';

type Money = number | string | { toString(): string };

export interface ReceiptPdfInput {
  number: string;
  amount: Money;
  method: string;
  status: string;
  issuedAt: Date | string;
  payment?: {
    method: string;
    channel: string;
    provider: string | null;
  } | null;
  invoice?: {
    number: string;
    totalAmount: Money;
    student?: { user?: { name?: string | null } | null } | null;
    package?: { name?: string | null; code?: string | null } | null;
    items?: {
      description: string;
      quantity: number;
      unitPrice: Money;
      amount: Money;
    }[];
  } | null;
  student?: { user?: { name?: string | null } | null } | null;
  verifier?: { name?: string | null } | null;
}

export interface ReceiptCompanyInfo {
  name: string;
  address: string;
  phone: string;
  email: string;
  /** Nama & jabatan penandatangan kwitansi (dari Pengaturan > Keuangan). */
  signerName?: string;
  signerTitle?: string;
  /** Path file gambar tanda tangan di disk (jika dari media library). */
  signaturePath?: string;
}

const rp = (n: Money) =>
  `Rp ${Number(n).toLocaleString('id-ID', { maximumFractionDigits: 0 })}`;

function methodLabel(r: ReceiptPdfInput) {
  if (r.payment?.channel === 'GATEWAY') {
    return `Gateway${r.payment.provider ? ` (${r.payment.provider})` : ''}`;
  }
  if (r.method === 'CASH') return 'Tunai (Cash)';
  return 'Transfer manual';
}

/** Terbilang sederhana Bahasa Indonesia untuk nominal kwitansi. */
function terbilang(n: number): string {
  const satuan = [
    '', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima',
    'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas',
  ];
  const t = (x: number): string => {
    if (x < 12) return satuan[x];
    if (x < 20) return `${satuan[x - 10]} Belas`;
    if (x < 100) return `${satuan[Math.floor(x / 10)]} Puluh ${t(x % 10)}`.trim();
    if (x < 200) return `Seratus ${t(x - 100)}`.trim();
    if (x < 1000) return `${satuan[Math.floor(x / 100)]} Ratus ${t(x % 1000)}`.trim();
    if (x < 2000) return `Seribu ${t(x - 1000)}`.trim();
    if (x < 1_000_000) return `${t(Math.floor(x / 1000))} Ribu ${t(x % 1000)}`.trim();
    if (x < 1_000_000_000)
      return `${t(Math.floor(x / 1_000_000))} Juta ${t(x % 1_000_000)}`.trim();
    return `${t(Math.floor(x / 1_000_000_000))} Miliar ${t(x % 1_000_000_000)}`.trim();
  };
  return n === 0 ? 'Nol' : t(Math.round(n));
}

/** Bangun PDF kwitansi — resolve ke Buffer penuh (pdfkit stream -> buffer). */
export function buildReceiptPdf(
  r: ReceiptPdfInput,
  c: ReceiptCompanyInfo | null,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A5', layout: 'landscape', margin: 36 });
    const chunks: Buffer[] = [];
    doc.on('data', (c2: Buffer) => chunks.push(c2));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const company = c?.name || 'Bimbel GFS';
    const companyLines = [c?.address, c?.phone, c?.email]
      .filter(Boolean)
      .join('  •  ');

    // Header
    doc.fontSize(15).font('Helvetica-Bold').text(company);
    if (companyLines) {
      doc.fontSize(8).font('Helvetica').fillColor('#555555').text(companyLines);
    }
    doc.moveDown(0.2);
    doc.moveTo(36, doc.y).lineTo(560, doc.y).strokeColor('#cccccc').stroke();
    doc.moveDown(0.5);

    doc.fontSize(13).font('Helvetica-Bold').fillColor('#000000').text('KWITANSI PEMBAYARAN', { align: 'center' });
    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor('#555555')
      .text(`No. ${r.number}`, { align: 'center' });
    doc.moveDown(0.8);

    const label = (l: string, v: string) => {
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#000000').text(l, { continued: true });
      doc.font('Helvetica').text(`  :  ${v}`);
    };

    label('Telah diterima dari', r.student?.user?.name ?? r.invoice?.student?.user?.name ?? '-');
    label('Untuk pembayaran', `Invoice ${r.invoice?.number ?? '-'}${r.invoice?.package?.name ? ` — ${r.invoice.package.name}` : ''}`);
    label('Metode', methodLabel(r));
    label(
      'Tanggal',
      new Date(r.issuedAt).toLocaleString('id-ID', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    );
    doc.moveDown(0.6);

    // Tabel item
    const items = r.invoice?.items ?? [];
    if (items.length > 0) {
      const y0 = doc.y;
      doc.rect(36, y0, 524, 18).fill('#f2f2f2');
      doc.fillColor('#000000').fontSize(8.5).font('Helvetica-Bold');
      doc.text('Deskripsi', 42, y0 + 5, { width: 270 });
      doc.text('Qty', 315, y0 + 5, { width: 40 });
      doc.text('Harga', 360, y0 + 5, { width: 90, align: 'right' });
      doc.text('Jumlah', 450, y0 + 5, { width: 104, align: 'right' });
      let y = y0 + 20;
      doc.font('Helvetica');
      for (const it of items) {
        doc.text(it.description, 42, y, { width: 270 });
        doc.text(String(it.quantity), 315, y, { width: 40 });
        doc.text(rp(it.unitPrice), 360, y, { width: 90, align: 'right' });
        doc.text(rp(it.amount), 450, y, { width: 104, align: 'right' });
        y += 15;
      }
      doc.moveTo(36, y).lineTo(560, y).strokeColor('#cccccc').stroke();
      doc.y = y + 6;
    }

    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .text(`TOTAL: ${rp(r.amount)}`, { align: 'right' });
    doc
      .fontSize(8.5)
      .font('Helvetica-Oblique')
      .fillColor('#555555')
      .text(`Terbilang: ${terbilang(Number(r.amount))} Rupiah`, { align: 'right' });
    doc.moveDown(0.8);

    doc.fontSize(8.5).font('Helvetica').fillColor('#555555');
    doc.text(`Status: ${r.status}   •   Diverifikasi oleh: ${r.verifier?.name ?? 'Sistem'}`);
    doc.moveDown(0.4);

    // Blok tanda tangan — nama/jabatan/gambar dari Pengaturan > Keuangan.
    // Posisi di kanan bawah slip seperti kwitansi umum.
    const signerName = c?.signerName?.trim() || r.verifier?.name || 'Admin';
    const signerTitle = c?.signerTitle?.trim() || 'Admin Finance';
    const sigX = 400;
    const sigW = 160;
    const sigY = doc.y;
    doc.fillColor('#000000').fontSize(8.5).font('Helvetica');
    doc.text(signerTitle, sigX, sigY, { width: sigW, align: 'center' });
    let nameY = sigY + 12;
    if (c?.signaturePath) {
      try {
        doc.image(c.signaturePath, sigX + 40, sigY + 12, { fit: [80, 44] });
        nameY = sigY + 60;
      } catch {
        // Gambar ttd gagal dimuat — lanjut tanpa gambar (nama tetap tercetak).
      }
    }
    doc
      .font('Helvetica-Bold')
      .text(signerName, sigX, nameY, { width: sigW, align: 'center' });
    doc
      .moveTo(sigX + 10, nameY - 2)
      .lineTo(sigX + sigW - 10, nameY - 2)
      .strokeColor('#999999')
      .stroke();

    doc.moveDown(1.2);
    doc.fontSize(8.5).font('Helvetica').fillColor('#555555');
    doc.text('Kwitansi ini diterbitkan otomatis oleh sistem.');

    doc.end();
  });
}
