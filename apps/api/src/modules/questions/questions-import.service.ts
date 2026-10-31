import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import type { QuestionType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TutorScopeService } from '../../common/tutor-scope/tutor-scope.service';
import { ContentCategoriesService } from '../content-categories/content-categories.service';
import { MediaService } from '../media/media.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { QuestionsService } from './questions.service';
import type { CreateQuestionDto } from './dto/question.dto';

/** Satu soal hasil parse file import (sebelum divalidasi jadi DTO). */
interface ParsedRow {
  no: number;
  type?: string;
  /** Bacaan bersama — satu teks dipakai beberapa soal. */
  stimulus?: string;
  content: string;
  options: string[];
  kunci: string;
  points?: number;
  difficulty?: string;
  explanation?: string;
  /** relId gambar (word/_rels) per field — diupload saat commit. */
  contentImages: string[];
  optionImages: Record<number, string[]>;
  explanationImages: string[];
  warnings: string[];
}

export interface ImportRowResult {
  no: number;
  content: string;
  type?: string;
  ok: boolean;
  errors: string[];
  images?: number;
  /** True bila soal identik sudah ada — soal lama diperbarui & dipakai. */
  duplicate?: boolean;
  /** True bila soal lama diperbarui dari baris import. */
  updated?: boolean;
  /** Id soal — baru dibuat (import) atau yang sudah ada (duplikat). */
  questionId?: string;
}

export interface ImportResult {
  parsed: number;
  created: number;
  /** Jumlah soal lama yang diperbarui (duplikat). */
  updated: number;
  dryRun: boolean;
  rows: ImportRowResult[];
  /** Semua id soal hasil import — untuk auto-pilih di form ujian/latsol. */
  questionIds?: string[];
}

const TYPE_ALIASES: Record<string, QuestionType> = {
  PG: 'SINGLE_CHOICE',
  'PILIHAN GANDA': 'SINGLE_CHOICE',
  SINGLE_CHOICE: 'SINGLE_CHOICE',
  PGK: 'MULTIPLE_CHOICE',
  'PILIHAN GANDA KOMPLEKS': 'MULTIPLE_CHOICE',
  MULTIPLE_CHOICE: 'MULTIPLE_CHOICE',
  BS: 'TRUE_FALSE',
  'BENAR/SALAH': 'TRUE_FALSE',
  'BENAR-SALAH': 'TRUE_FALSE',
  TRUE_FALSE: 'TRUE_FALSE',
  ISIAN: 'SHORT_ANSWER',
  'ISIAN SINGKAT': 'SHORT_ANSWER',
  SHORT_ANSWER: 'SHORT_ANSWER',
  ESSAY: 'ESSAY',
  ESAI: 'ESSAY',
};

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E'];
const DIFFICULTIES = new Set(['EASY', 'MEDIUM', 'HARD']);

/**
 * Template Word (.docx) sebagai teks paragraf — dipakai untuk generate file
 * template DAN sebagai acuan format saat parsing.
 */
const DOCX_TEMPLATE_LINES = [
  'TEMPLATE IMPORT SOAL — BIMBEL GFS',
  '',
  'PETUNJUK:',
  '- Isi tabel di bawah: 1 baris = 1 soal. Tambahkan/salin baris sesuai kebutuhan.',
  '- Tipe: PG (pilihan ganda) | PGK (ganda kompleks) | BS (benar/salah) | ISIAN | ESSAY.',
  '- Kunci: huruf opsi (mis. B), beberapa huruf untuk PGK (mis. A,C), Benar/Salah untuk BS,',
  '  teks jawaban untuk ISIAN, dan dikosongkan untuk ESSAY.',
  '- Opsi hanya diisi untuk PG/PGK (maksimal E). Tipe lain boleh dikosongkan.',
  '- BS bisa satu pernyataan (Kunci: Benar/Salah) ATAU beberapa pernyataan —',
  '  isi tiap pernyataan di Opsi A..E dan kunci dipisah koma, mis. "Benar,Salah,Benar,Salah".',
  '- BACAAN: satu teks/wacana bisa dipakai beberapa soal — isi kolom Bacaan dengan',
  '  teks yang sama pada baris-baris soal yang memakainya (cukup salin sel-nya).',
  '- GAMBAR: tempel gambar langsung di sel Soal/Opsi/Pembahasan — otomatis terupload.',
  '- Format alternatif: satu tabel kecil per soal — kolom 1 label (No/Tipe/Soal/A/B/…/Kunci), kolom 2 isi.',
  '- Jenjang, mapel, dan kategori DIPILIH di halaman import — tidak perlu ditulis di file.',
];

const XLSX_HEADERS = [
  'No',
  'Tipe',
  'Soal',
  'Opsi A',
  'Opsi B',
  'Opsi C',
  'Opsi D',
  'Opsi E',
  'Kunci',
  'Poin',
  'Kesulitan',
  'Pembahasan',
  'Bacaan',
];

/** Alias tipe file (PG/PGK/BS/ISIAN/ESSAY) ↔ enum QuestionType. */
const TYPE_TO_ALIAS: Record<QuestionType, string> = {
  SINGLE_CHOICE: 'PG',
  MULTIPLE_CHOICE: 'PGK',
  TRUE_FALSE: 'BS',
  SHORT_ANSWER: 'ISIAN',
  ESSAY: 'ESSAY',
};

/** Contoh bacaan bersama — dipakai lebih dari satu baris contoh. */
const BACAAN_CONTOH =
  'Contoh bacaan dipakai beberapa soal: "Dalam sebuah kotak terdapat angka-angka. Hitunglah dan amati pola bilangan berikut."';

/** Satu baris contoh per tipe soal — untuk template docx/xlsx. */
function exampleRow(no: number, type: QuestionType): (string | number)[] {
  const t = TYPE_TO_ALIAS[type];
  switch (type) {
    case 'SINGLE_CHOICE':
      return [no, t, `Contoh soal pilihan ganda no ${no}: Berdasarkan bacaan, berapa hasil 2 + 2?`, '3', '4', '5', '6', '', 'B', 1, 'EASY', '2 + 2 = 4.', BACAAN_CONTOH];
    case 'MULTIPLE_CHOICE':
      return [no, t, `Contoh soal ganda kompleks no ${no}: Pilih semua bilangan genap.`, '2', '3', '4', '5', '', 'A,C', 2, 'MEDIUM', '', BACAAN_CONTOH];
    case 'TRUE_FALSE':
      // BS kompleks — tiap opsi adalah pernyataan; kunci per-pernyataan
      // dipisah koma (contoh: 4 pernyataan, 2 benar 2 salah).
      return [no, t, `Contoh soal benar/salah no ${no}: Tentukan benar/salah tiap pernyataan berikut!`, '2 + 2 = 4', '3 x 3 = 6', '10 : 2 = 5', '7 - 2 = 3', '', 'Benar,Salah,Benar,Salah', 1, 'EASY', 'Hanya pernyataan A dan C yang benar.', ''];
    case 'SHORT_ANSWER':
      return [no, t, `Contoh soal isian no ${no}: Ibukota Indonesia adalah ...`, '', '', '', '', '', 'Jakarta', 1, 'MEDIUM', '', ''];
    default:
      return [no, t, `Contoh soal essay no ${no}: Jelaskan proses fotosintesis!`, '', '', '', '', '', '', 3, 'HARD', 'Fotosintesis mengubah CO2 + air menjadi glukosa.', ''];
  }
}

/** Normalisasi query types: 'PG,BS,ISIAN' atau nama enum (SINGLE_CHOICE dst). */
function parseTemplateTypes(types?: string): QuestionType[] {
  const all: QuestionType[] = [
    'SINGLE_CHOICE',
    'MULTIPLE_CHOICE',
    'TRUE_FALSE',
    'SHORT_ANSWER',
    'ESSAY',
  ];
  if (!types?.trim()) return all;
  const picked = types
    .split(/[,\s]+/)
    .map((t) => TYPE_ALIASES[t.trim().toUpperCase()])
    .filter((t): t is QuestionType => !!t);
  return picked.length ? picked : all;
}

function parseTemplateCount(count?: string): number {
  const n = Number(count);
  if (!Number.isFinite(n) || n < 1) return 5;
  return Math.min(Math.floor(n), 100);
}

@Injectable()
export class QuestionsImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly questions: QuestionsService,
    private readonly tutorScope: TutorScopeService,
    private readonly contentCategories: ContentCategoriesService,
    private readonly media: MediaService,
  ) {}

  // ---------- TEMPLATE ----------

  async templateXlsx(count?: string, types?: string): Promise<Buffer> {
    const n = parseTemplateCount(count);
    const typeList = parseTemplateTypes(types);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Soal');
    ws.columns = XLSX_HEADERS.map((h, i) => ({
      header: h,
      key: `c${i}`,
      width: i === 2 ? 50 : i >= 3 && i <= 7 ? 22 : 14,
    }));
    ws.getRow(1).font = { bold: true };
    for (let i = 0; i < n; i++) {
      ws.addRow(exampleRow(i + 1, typeList[i % typeList.length]));
    }
    const guide = wb.addWorksheet('Petunjuk');
    [
      'Isi kolom sesuai header di sheet "Soal".',
      'Tipe: PG | PGK | BS | ISIAN | ESSAY.',
      'Kunci: huruf opsi (B), beberapa huruf untuk PGK (A,C), Benar/Salah untuk BS, teks untuk ISIAN, kosong untuk ESSAY.',
      'Kesulitan: EASY | MEDIUM | HARD (opsional). Poin: angka (opsional).',
      'BS bisa banyak pernyataan: isi tiap pernyataan di Opsi A..E, kunci dipisah koma (mis. "Benar,Salah,Benar,Salah").',
      'Bacaan: satu teks bisa dipakai beberapa soal — salin teks yang sama ke kolom Bacaan pada baris-baris terkait.',
      'Jenjang, mapel, dan tipe/kategori dipilih di halaman import — tidak perlu kolom di sini.',
    ].forEach((t) => guide.addRow([t]));
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  async templateDocx(count?: string, types?: string): Promise<Buffer> {
    const n = parseTemplateCount(count);
    const typeList = parseTemplateTypes(types);
    const para = (line: string, bold = false) =>
      `<w:p><w:r>${bold ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`;
    const textLines = DOCX_TEMPLATE_LINES.map((l) => para(l)).join('');
    const borders =
      '<w:tblBorders>' +
      ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
        .map((b) => `<w:${b} w:val="single" w:sz="4" w:color="auto"/>`)
        .join('') +
      '</w:tblBorders>';
    const cell = (t: string, w: number, bold = false) =>
      `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/></w:tcPr>` +
      `<w:p><w:pPr><w:spacing w:before="40" w:after="40"/></w:pPr><w:r>${bold ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${escapeXml(t)}</w:t></w:r></w:p></w:tc>`;
    const gridRow = (cells: string[], widths: number[], header = false) =>
      `<w:tr>${cells.map((t, i) => cell(t, widths[i] ?? 1200, header)).join('')}</w:tr>`;
    const grid = (widths: number[]) =>
      `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;

    // Satu tabel grid — baris contoh di-generate sesuai count + tipe yang diminta.
    const w1 = [600, 800, 3200, 1100, 1100, 1100, 1100, 1100, 1000, 700, 1000, 2400, 2200];
    const tableRows = Array.from({ length: n }, (_, i) =>
      gridRow(
        exampleRow(i + 1, typeList[i % typeList.length]).map(String),
        w1,
      ),
    ).join('');
    const gridTable =
      `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>${borders}</w:tblPr>${grid(w1)}` +
      gridRow(XLSX_HEADERS, w1, true) +
      tableRows +
      '</w:tbl>';

    const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${textLines}${para('')}${gridTable}<w:sectPr/></w:body></w:document>`;
    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
    const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
    // Beberapa versi Word menandai .docx corrupt bila rels document.xml tidak ada.
    const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
    const zip = new JSZip();
    zip.file('[Content_Types].xml', contentTypes);
    zip.file('_rels/.rels', rels);
    zip.file('word/document.xml', document);
    zip.file('word/_rels/document.xml.rels', docRels);
    return zip.generateAsync({ type: 'nodebuffer' });
  }

  // ---------- PARSE ----------

  /** Gambar hasil ekstrak docx: relId → buffer + nama file + mime. */
  private imageIndex = new Map<
    string,
    { name: string; mime: string; buffer: Buffer }
  >();

  private static readonly IMG_EXT_MIME: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
  };

  private async parseDocx(
    buffer: Buffer,
  ): Promise<{ rows: ParsedRow[]; images: Map<string, { name: string; mime: string; buffer: Buffer }> }> {
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(buffer);
    } catch {
      throw new BadRequestException(
        'File Word tidak terbaca — gunakan template .docx yang disediakan.',
      );
    }
    const doc = zip.file('word/document.xml');
    if (!doc)
      throw new BadRequestException('File .docx tidak berisi word/document.xml.');

    // Peta relasi: rId → target file (word/media/image1.png dst).
    const relTargets = new Map<string, string>();
    const relsFile = zip.file('word/_rels/document.xml.rels');
    if (relsFile) {
      const relsXml = await relsFile.async('string');
      const relRe =
        /<Relationship[^>]*Id="(rId\d+)"[^>]*Target="([^"]+)"[^>]*\/?\s*>/g;
      let rm: RegExpExecArray | null;
      while ((rm = relRe.exec(relsXml))) relTargets.set(rm[1], rm[2]);
    }

    const xml = await doc.async('string');
    const usedRelIds = new Set<string>();
    const rows: ParsedRow[] = [];
    let pendingLines: string[] = [];
    let seqNo = 0;

    const flushLines = () => {
      if (!pendingLines.length) return;
      rows.push(...this.parseLines(pendingLines, seqNo));
      seqNo = rows.length;
      pendingLines = [];
    };

    // Walk elemen body berurutan (depth-aware): paragraf ATAU tabel.
    // <w:p/> self-closing (paragraf kosong khas Word) tidak boleh menelan
    // tag berikutnya, dan <w:tbl> bersarang di dalam sel tidak boleh
    // memotong fragmen tabel induk.
    for (const frag of this.walkTopElements(xml)) {
      if (frag.startsWith('<w:tbl')) {
        flushLines();
        rows.push(...this.parseTable(frag, usedRelIds, rows.length));
        seqNo = rows.length;
      } else {
        const line = this.extractText(frag, usedRelIds);
        if (line) pendingLines.push(line);
      }
    }
    flushLines();

    // Ambil buffer gambar yang benar-benar direferensikan.
    const images = new Map<string, { name: string; mime: string; buffer: Buffer }>();
    for (const relId of usedRelIds) {
      const target = relTargets.get(relId);
      if (!target) continue;
      const path = target.startsWith('word/') ? target : `word/${target}`;
      const file = zip.file(path) ?? zip.file(`word/media/${path.split('/').pop()}`);
      if (!file) continue;
      const name = path.split('/').pop() ?? `img-${relId}`;
      const ext = name.split('.').pop()?.toLowerCase() ?? '';
      const mime = QuestionsImportService.IMG_EXT_MIME[ext];
      if (!mime) continue; // format non-gambar (emf/wmf) — ditandai di warnings
      images.set(relId, {
        name,
        mime,
        buffer: await file.async('nodebuffer'),
      });
    }
    this.imageIndex = images;
    return { rows, images };
  }

  /**
   * Pecah XML jadi fragmen elemen top-level <w:p> / <w:tbl> secara
   * depth-aware: <w:tbl> bersarang dihitung supaya penutupnya tidak memotong
   * tabel induk, dan tag self-closing (<w:p/>) dikembalikan apa adanya.
   */
  private walkTopElements(xml: string): string[] {
    const frags: string[] = [];
    const re = /<w:(tbl|p)\b[^>]*?>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml))) {
      const tag = m[1];
      if (m[0].endsWith('/>')) {
        frags.push(m[0]); // self-closing — paragraf kosong
        continue;
      }
      let depth = 1;
      const inner = new RegExp(`<w:${tag}\\b[^>]*?>|<\\/w:${tag}>`, 'g');
      inner.lastIndex = re.lastIndex;
      let mm: RegExpExecArray | null;
      while ((mm = inner.exec(xml))) {
        if (mm[0].startsWith('</')) depth--;
        else if (!mm[0].endsWith('/>')) depth++;
        if (depth === 0) break;
      }
      frags.push(xml.slice(m.index, inner.lastIndex));
      re.lastIndex = inner.lastIndex;
    }
    return frags;
  }

  /**
   * Pecah isi container jadi daftar fragmen <w:tag>…</w:tag> pada kedalaman
   * tabel 0 — <w:tr>/<w:tc> di dalam <w:tbl> bersarang diabaikan. `tag`
   * diasumsikan tidak bersarang pada dirinya sendiri (tr/tc tidak menampung
   * tr/tc secara langsung; hanya lewat tabel bersarang).
   */
  private splitTopLevel(xml: string, tag: 'tr' | 'tc'): string[] {
    const out: string[] = [];
    const openRe = new RegExp(`<w:(?:tbl|${tag})\\b[^>]*?>|<\\/w:tbl>`, 'g');
    let depth = 0;
    let m: RegExpExecArray | null;
    while ((m = openRe.exec(xml))) {
      const tok = m[0];
      if (tok === '</w:tbl>') {
        depth = Math.max(0, depth - 1);
        continue;
      }
      if (tok.startsWith('<w:tbl')) {
        if (!tok.endsWith('/>')) depth++;
        continue;
      }
      if (depth !== 0) continue; // tr/tc di dalam tabel bersarang
      if (tok.endsWith('/>')) {
        out.push(tok);
        continue;
      }
      // Cari </w:tag> dengan tetap mengabaikan isi tabel bersarang.
      const closeRe = new RegExp(
        `<w:tbl\\b[^>]*?>|<\\/w:tbl>|<\\/w:${tag}>`,
        'g',
      );
      closeRe.lastIndex = openRe.lastIndex;
      let dd = 0;
      let cm: RegExpExecArray | null;
      let end = xml.length;
      while ((cm = closeRe.exec(xml))) {
        if (cm[0].startsWith('</')) {
          if (cm[0] === '</w:tbl>') dd = Math.max(0, dd - 1);
          else if (dd === 0) {
            end = closeRe.lastIndex;
            break;
          }
          // </w:tag> di dalam tabel bersarang — abaikan.
          continue;
        }
        if (!cm[0].endsWith('/>')) dd++;
      }
      out.push(xml.slice(m.index, end));
      openRe.lastIndex = end;
    }
    return out;
  }

  /** Lepas tag pembungkus <w:xxx>…</w:xxx> di ujung fragmen. */
  private unwrapTag(xml: string, tag: string): string {
    return xml
      .replace(new RegExp(`^<w:${tag}\\b[^>]*?>`), '')
      .replace(new RegExp(`<\\/w:${tag}>\\s*$`), '');
  }

  /**
   * Teks satu sel: paragraf langsung + isi <w:tbl> bersarang. Tabel dalam
   * ditulis sebagai blok `[TABEL]…[/TABEL]` (satu baris tabel = satu baris
   * "sel | sel") — dirender ulang jadi tabel asli oleh MathContent di web.
   */
  private cellText(tcXml: string, usedRelIds: Set<string>): string {
    const inner = this.unwrapTag(tcXml, 'tc');
    const parts: string[] = [];
    for (const child of this.walkTopElements(inner)) {
      if (child.startsWith('<w:tbl')) {
        const tblInner = this.unwrapTag(child, 'tbl');
        const lines: string[] = [];
        for (const trFrag of this.splitTopLevel(tblInner, 'tr')) {
          const trInner = this.unwrapTag(trFrag, 'tr');
          const cells = this.splitTopLevel(trInner, 'tc')
            .map((tc2) => {
              const pRe = /<w:p\b[^>]*?\/>|<w:p\b[^>]*?>[\s\S]*?<\/w:p>/g;
              const sub: string[] = [];
              let pm: RegExpExecArray | null;
              while ((pm = pRe.exec(tc2))) {
                const t = this.extractText(pm[0], usedRelIds);
                if (t) sub.push(t);
              }
              return sub.join(' ');
            })
            .filter(Boolean);
          if (cells.length) lines.push(cells.join(' | '));
        }
        if (lines.length) parts.push(`[TABEL]\n${lines.join('\n')}\n[/TABEL]`);
      } else {
        const t = this.extractText(child, usedRelIds);
        if (t) parts.push(t);
      }
    }
    return parts.join('\n');
  }

  /** Ekstrak teks + token [IMG:rId] dari fragmen XML (paragraf/sel). */
  private extractText(frag: string, usedRelIds: Set<string>): string {
    let out = '';
    const re =
      /<w:t[^>]*>([\s\S]*?)<\/w:t>|<a:blip[^>]*r:(?:embed|link)="(rId\d+)"[^>]*\/?>|<v:imagedata[^>]*r:id="(rId\d+)"[^>]*\/?>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(frag))) {
      if (m[1] !== undefined) out += unescapeXml(m[1]);
      else {
        const relId = m[2] ?? m[3];
        if (relId) {
          out += ` [IMG:${relId}] `;
          usedRelIds.add(relId);
        }
      }
    }
    return out.replace(/\s{2,}/g, ' ').trim();
  }

  /** Parser isi <w:tbl>: mode grid (header No|Tipe|Soal|Opsi…|Kunci|…) atau
   *  mode per-tabel (kolom 1 = label field, kolom 2 = nilai). */
  private parseTable(
    tblXml: string,
    usedRelIds: Set<string>,
    baseNo: number,
  ): ParsedRow[] {
    // Split baris/sel secara depth-aware — <w:tr> dan <w:tc> milik <w:tbl>
    // bersarang di dalam sel tidak ikut terhitung sebagai baris/sel tabel ini.
    const tblInner = this.unwrapTag(tblXml, 'tbl');
    const tableRows: string[][] = [];
    for (const trFrag of this.splitTopLevel(tblInner, 'tr')) {
      const trInner = this.unwrapTag(trFrag, 'tr');
      const cells = this.splitTopLevel(trInner, 'tc').map((tc) =>
        this.cellText(tc, usedRelIds),
      );
      if (cells.some((c) => c.trim())) tableRows.push(cells);
    }
    if (!tableRows.length) return [];

    // Deteksi header: minimal 2 sel cocok keyword kolom.
    const HEAD_KEYS = new Set([
      'no', 'nomor', 'tipe', 'type', 'soal', 'pertanyaan', 'isi soal',
      'kunci', 'jawaban', 'poin', 'kesulitan', 'pembahasan', 'solusi', 'gambar',
    ]);
    const isHeader = (c: string) =>
      HEAD_KEYS.has(c.toLowerCase().trim()) || /^opsi\s*[a-e]$/i.test(c.trim());
    const headerHits = tableRows[0].filter(isHeader).length;
    return headerHits >= 2
      ? this.parseTableGrid(tableRows, baseNo)
      : this.parseTableBlock(tableRows, baseNo);
  }

  /** Tabel grid — baris 1 header seperti template Excel. */
  private parseTableGrid(tableRows: string[][], baseNo: number): ParsedRow[] {
    const colOf = (c: string): { key?: string; optIdx?: number } => {
      const h = c.toLowerCase().trim();
      const optM = h.match(/^opsi\s*([a-e])$/) ?? h.match(/^([a-e])$/);
      if (optM) return { optIdx: OPTION_LETTERS.indexOf(optM[1].toUpperCase()) };
      if (/^(no|nomor)$/.test(h)) return { key: 'no' };
      if (/^(tipe|type)$/.test(h)) return { key: 'type' };
      if (/^(soal|pertanyaan|isi soal)$/.test(h)) return { key: 'content' };
      if (/^(kunci|jawaban)$/.test(h)) return { key: 'kunci' };
      if (/^poin/.test(h)) return { key: 'points' };
      if (/^(kesulitan|difficulty)/.test(h)) return { key: 'difficulty' };
      if (/^(pembahasan|solusi)/.test(h)) return { key: 'explanation' };
      if (/^(bacaan|stimulus|wacana|teks)$/.test(h)) return { key: 'stimulus' };
      if (/^(gambar|image|foto)$/.test(h)) return { key: 'image' };
      return {};
    };
    const cols = tableRows[0].map(colOf);
    const rows: ParsedRow[] = [];
    for (const cells of tableRows.slice(1)) {
      const row = this.newParsedRow(baseNo + rows.length + 1);
      cells.forEach((cell, i) => {
        const c = cols[i];
        if (!c) return;
        if (c.optIdx !== undefined && c.optIdx >= 0) {
          row.options[c.optIdx] = this.stripImgTokens(cell, this.optImages(row, c.optIdx));
        } else if (c.key === 'no') row.no = Number(cell) || row.no;
        else if (c.key === 'type') row.type = cell.trim() || undefined;
        else if (c.key === 'content')
          row.content = this.stripImgTokens(cell, row.contentImages);
        else if (c.key === 'kunci') row.kunci = cell.trim();
        else if (c.key === 'points') row.points = Number(cell) || undefined;
        else if (c.key === 'difficulty') row.difficulty = cell.trim() || undefined;
        else if (c.key === 'explanation')
          row.explanation = this.stripImgTokens(cell, row.explanationImages);
        else if (c.key === 'stimulus') row.stimulus = cell.trim();
        else if (c.key === 'image')
          this.stripImgTokens(cell, row.contentImages);
      });
      if (row.content || row.kunci || row.options.some(Boolean)) {
        this.compactOptions(row);
        rows.push(row);
      }
    }
    return rows;
  }

  /** Tabel blok — satu tabel = satu soal; kolom 1 label, kolom 2+ nilai. */
  private parseTableBlock(tableRows: string[][], baseNo: number): ParsedRow[] {
    const row = this.newParsedRow(baseNo + 1);
    let hasField = false;
    for (const cells of tableRows) {
      const label = cells[0]?.trim() ?? '';
      const val = cells.slice(1).join('\n').trim();
      const k = label.toLowerCase();
      if (/^(soal|pertanyaan|isi soal)$/.test(k)) {
        row.content = this.stripImgTokens(val, row.contentImages);
        hasField = true;
      } else if (/^(no|nomor)$/.test(k) || /^soal\s*\d+$/.test(k)) {
        const n = Number(val.replace(/\D/g, '')) || Number(label.replace(/\D/g, ''));
        if (n) row.no = n;
        hasField = true;
      } else if (/^(tipe|type)$/.test(k)) {
        row.type = val || undefined;
        hasField = true;
      } else if (/^(opsi\s*)?([a-e])\.?$/i.test(k)) {
        const idx = OPTION_LETTERS.indexOf(k.replace(/^opsi\s*/i, '').replace(/\.$/, '').toUpperCase());
        if (idx >= 0) {
          row.options[idx] = this.stripImgTokens(val, this.optImages(row, idx));
          hasField = true;
        }
      } else if (/^(kunci|jawaban)$/.test(k)) {
        row.kunci = val;
        hasField = true;
      } else if (/^poin/.test(k)) {
        row.points = Number(val) || undefined;
        hasField = true;
      } else if (/^(kesulitan|difficulty)/.test(k)) {
        row.difficulty = val || undefined;
        hasField = true;
      } else if (/^(pembahasan|solusi)/.test(k)) {
        row.explanation = this.stripImgTokens(val, row.explanationImages);
        hasField = true;
      } else if (/^(gambar|image|foto)$/.test(k)) {
        this.stripImgTokens(val, row.contentImages);
        hasField = true;
      } else if (label && val) {
        // Baris tanpa label jelas → gabungkan ke isi soal.
        row.content = `${row.content ? `${row.content}\n` : ''}${label}\n${this.stripImgTokens(val, row.contentImages)}`;
      } else if (!label && val) {
        row.content = `${row.content ? `${row.content}\n` : ''}${this.stripImgTokens(val, row.contentImages)}`;
      }
    }
    return hasField || row.content ? [row] : [];
  }

  /**
   * Buang slot opsi kosong dan rapikan indeks gambar opsi ke posisi padat.
   * Slot yang hanya berisi gambar (opsi bergambar, mis. opsi tabel/gambar
   * di Word) tetap dipertahankan — kontennya kosong tapi imageUrl-nya ada.
   */
  private compactOptions(r: ParsedRow) {
    const sparse = r.options;
    const denseOptions: string[] = [];
    const denseImages: Record<number, string[]> = {};
    for (let i = 0; i < sparse.length; i++) {
      const v = sparse[i];
      const hasImg = (r.optionImages[i]?.length ?? 0) > 0;
      if (v === undefined || v === '' || v === null) {
        if (!hasImg) continue;
        denseOptions.push('');
      } else {
        denseOptions.push(v);
      }
      const di = denseOptions.length - 1;
      if (hasImg) denseImages[di] = r.optionImages[i];
    }
    r.options = denseOptions;
    r.optionImages = denseImages;
  }

  private newParsedRow(no: number): ParsedRow {
    return {
      no,
      stimulus: '',
      content: '',
      options: [],
      kunci: '',
      contentImages: [],
      optionImages: {},
      explanationImages: [],
      warnings: [],
    };
  }

  /** Array penampung relId gambar untuk opsi ke-idx (lazy init). */
  private optImages(row: ParsedRow, idx: number): string[] {
    return (row.optionImages[idx] ??= []);
  }

  /** Pisahkan token [IMG:rId] dari teks — relIds dikumpulkan per field. */
  private stripImgTokens(
    text: string,
    target: string[],
    _optIdx?: number,
  ): string {
    const re = /\[IMG:(rId\d+)\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) target.push(m[1]);
    return text.replace(re, ' ').replace(/\s{2,}/g, ' ').trim();
  }

  /** Parser format teks: blok dimulai "SOAL n", field "Tipe:", "Kunci:", dst. */
  private parseLines(lines: string[], baseNo: number): ParsedRow[] {
    const rows: ParsedRow[] = [];
    let cur: ParsedRow | null = null;
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      if (/^SOAL\s+\d+/i.test(line)) {
        if (cur) rows.push(cur);
        cur = this.newParsedRow(
          Number(line.match(/\d+/)?.[0] ?? baseNo + rows.length + 1),
        );
        continue;
      }
      if (!cur) continue; // abaikan header/petunjuk sebelum SOAL pertama
      const kv = line.match(/^([A-Za-z]+)\s*:\s*(.*)$/);
      if (kv) {
        const key = kv[1].toUpperCase();
        const val = kv[2].trim();
        if (key === 'TIPE' || key === 'TYPE') cur.type = val;
        else if (key === 'KUNCI' || key === 'JAWABAN') cur.kunci = val;
        else if (key === 'POIN' || key === 'POINTS') cur.points = Number(val) || undefined;
        else if (key === 'KESULITAN') cur.difficulty = val;
        else if (key === 'PEMBAHASAN')
          cur.explanation = this.stripImgTokens(val, cur.explanationImages);
        else if (key === 'BACAAN' || key === 'STIMULUS' || key === 'WACANA') cur.stimulus = val;
        else if (key === 'SOAL') cur.content = this.stripImgTokens(val, cur.contentImages);
        else cur.content = cur.content ? `${cur.content}\n${this.stripImgTokens(line, cur.contentImages)}` : this.stripImgTokens(line, cur.contentImages);
        continue;
      }
      const opt = line.match(/^([A-E])\s*[.)]\s*(.*)$/);
      if (opt) {
        const idx = OPTION_LETTERS.indexOf(opt[1]);
        cur.options[idx] = this.stripImgTokens(opt[2].trim(), this.optImages(cur, idx));
        continue;
      }
      // Baris lanjutan isi soal.
      const stripped = this.stripImgTokens(line, cur.contentImages);
      cur.content = cur.content ? `${cur.content}\n${stripped}` : stripped;
    }
    if (cur) rows.push(cur);
    // Rapikan opsi sparse → padat; optionImages ikut di-remap ke indeks padat.
    for (const r of rows) this.compactOptions(r);
    return rows;
  }

  private async parseXlsx(buffer: Buffer): Promise<ParsedRow[]> {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    } catch {
      throw new BadRequestException(
        'File Excel tidak terbaca — gunakan template .xlsx yang disediakan.',
      );
    }
    const ws = wb.worksheets[0];
    if (!ws) throw new BadRequestException('Workbook tidak punya sheet.');
    const rows: ParsedRow[] = [];
    ws.eachRow((row, rowNum) => {
      if (rowNum === 1) return; // header
      const cell = (i: number) => {
        const v = row.getCell(i).value;
        if (v === null || v === undefined) return '';
        if (typeof v === 'object' && 'richText' in (v as object))
          return (v as ExcelJS.CellRichTextValue).richText
            .map((r) => r.text)
            .join('');
        if (v instanceof Date) return v.toISOString();
        return String(v).trim();
      };
      const no = Number(cell(1)) || rowNum - 1;
      const stimulus = cell(13);
      const content = cell(3);
      const kunci = cell(9);
      if (!content && !kunci) return; // baris kosong
      const r = this.newParsedRow(no);
      r.type = cell(2) || undefined;
      r.stimulus = stimulus;
      r.content = content;
      r.options = [cell(4), cell(5), cell(6), cell(7), cell(8)].filter(Boolean);
      r.kunci = kunci;
      r.points = cell(10) ? Number(cell(10)) || undefined : undefined;
      r.difficulty = cell(11) || undefined;
      r.explanation = cell(12) || undefined;
      rows.push(r);
    });
    return rows;
  }

  // ---------- VALIDASI → DTO ----------

  private toDto(row: ParsedRow): { dto?: CreateQuestionDto; errors: string[] } {
    const errors: string[] = [];
    const content = row.content.trim();
    if (!content) errors.push('Isi soal kosong.');

    // Kunci bisa berbentuk "B", "A,C", "Benar/Salah", atau teks isian.
    const kunciLetters = row.kunci
      .toUpperCase()
      .split(/[,\s/]+/)
      .filter((k) => OPTION_LETTERS.includes(k));

    let type: QuestionType | undefined = row.type
      ? TYPE_ALIASES[row.type.toUpperCase().trim()]
      : undefined;
    if (row.type && !type) errors.push(`Tipe "${row.type}" tidak dikenal (PG/PGK/BS/ISIAN/ESSAY).`);
    if (!type) {
      if (row.options.length > 0)
        type = kunciLetters.length > 1 ? 'MULTIPLE_CHOICE' : 'SINGLE_CHOICE';
      else if (/^(benar|salah|true|false|b|s)$/i.test(row.kunci.trim()))
        type = 'TRUE_FALSE';
      else if (row.kunci.trim()) type = 'SHORT_ANSWER';
      else type = 'ESSAY';
    }

    const dto: CreateQuestionDto = {
      type,
      content,
      options: [],
    };

    if (type === 'SINGLE_CHOICE' || type === 'MULTIPLE_CHOICE') {
      if (row.options.length < 2)
        errors.push('Soal pilihan ganda minimal punya 2 opsi (A–E).');
      if (!kunciLetters.length)
        errors.push('Kunci jawaban wajib diisi (huruf opsi, mis. B atau A,C).');
      dto.options = row.options.map((o, i) => ({
        content: o,
        isCorrect: kunciLetters.includes(OPTION_LETTERS[i]),
        sortOrder: i,
      }));
    } else if (type === 'TRUE_FALSE') {
      // Kunci multi-pernyataan "BENAR, SALAH, ..." → soal BS kompleks, setara
      // PGK: opsi ke-i bernilai benar bila kunci ke-i "Benar".
      const parts = row.kunci
        .split(/[,;|]+/)
        .map((p) => p.trim())
        .filter(Boolean);
      if (parts.length >= 2) {
        const marks = parts.map((p) => {
          const k = p.toLowerCase();
          if (['benar', 'true', 'b'].includes(k)) return true;
          if (['salah', 'false', 's'].includes(k)) return false;
          return null;
        });
        if (marks.includes(null) || marks.length !== row.options.length) {
          errors.push(
            'Kunci Benar/Salah per-pernyataan harus "Benar"/"Salah" dipisah koma dan sama banyak dengan jumlah opsi.',
          );
        } else {
          type = 'MULTIPLE_CHOICE';
          dto.type = type;
          dto.options = row.options.map((o, i) => ({
            content: o,
            isCorrect: marks[i] === true,
            sortOrder: i,
          }));
        }
      } else {
        const k = row.kunci.trim().toLowerCase();
        const benar = ['benar', 'true', 'b'].includes(k);
        const salah = ['salah', 'false', 's'].includes(k);
        if (!benar && !salah)
          errors.push('Kunci soal Benar/Salah harus berisi "Benar" atau "Salah".');
        dto.options = [
          { content: 'Benar', isCorrect: benar, sortOrder: 0 },
          { content: 'Salah', isCorrect: salah, sortOrder: 1 },
        ];
      }
    } else if (type === 'SHORT_ANSWER') {
      if (!row.kunci.trim())
        errors.push('Kunci jawaban isian singkat wajib diisi.');
      else dto.answerKey = row.kunci.trim();
    }

    if (row.points !== undefined) {
      if (!Number.isFinite(row.points) || row.points <= 0)
        errors.push('Poin harus angka positif.');
      else dto.points = row.points;
    }
    if (row.difficulty) {
      const d = row.difficulty.toUpperCase().trim();
      if (!DIFFICULTIES.has(d))
        errors.push(`Kesulitan "${row.difficulty}" tidak dikenal (EASY/MEDIUM/HARD).`);
      else dto.difficulty = d;
    }
    if (row.explanation) dto.explanation = row.explanation.trim();
    if (row.stimulus?.trim()) dto.stimulus = row.stimulus.trim();

    return { dto: errors.length ? undefined : dto, errors };
  }

  /**
   * Upload gambar yang diekstrak dari docx (relId → buffer di imageIndex)
   * ke pustaka media, lalu tempel URL-nya ke dto soal/opsi/pembahasan.
   * Gambar berlebih (>1 per field) ditandai sebagai warning.
   */
  private async attachImages(
    row: ParsedRow,
    dto: CreateQuestionDto,
    actorId: string,
    results: ImportRowResult[],
  ) {
    const notes: string[] = [];
    const upload = async (relId: string) => {
      const img = this.imageIndex.get(relId);
      if (!img) {
        notes.push('Ada gambar berformat tidak didukung (emf/wmf/tiff) — dilewati.');
        return null;
      }
      const asset = await this.media.saveBuffer(img.buffer, {
        mime: img.mime,
        originalName: `import-soal-${img.name}`,
        uploadedById: actorId,
        category: 'ACADEMIC',
      });
      return asset.url;
    };

    if (row.contentImages.length) {
      dto.imageUrl = (await upload(row.contentImages[0])) ?? dto.imageUrl;
      if (row.contentImages.length > 1)
        notes.push(`Gambar ke-${row.contentImages.length} di soal dilewati — 1 gambar per soal.`);
    }
    if (row.explanationImages.length) {
      dto.explanationImageUrl =
        (await upload(row.explanationImages[0])) ?? dto.explanationImageUrl;
      if (row.explanationImages.length > 1)
        notes.push('Gambar ke-2+ di pembahasan dilewati — 1 gambar per pembahasan.');
    }
    for (const [idxStr, relIds] of Object.entries(row.optionImages)) {
      const idx = Number(idxStr);
      const opt = dto.options?.[idx];
      if (!opt) continue;
      opt.imageUrl = (await upload(relIds[0])) ?? opt.imageUrl;
      if (relIds.length > 1)
        notes.push(`Gambar ke-2+ di opsi ${OPTION_LETTERS[idx] ?? idx + 1} dilewati.`);
    }
    if (notes.length) {
      const res = results.find((r) => r.no === row.no);
      res?.errors.push(...notes);
    }
  }

  // ---------- IMPORT ----------

  async importFile(
    actor: AuthenticatedUser,
    file:
      | { buffer: Buffer; mimetype: string; originalname: string; size: number }
      | undefined,
    refs: {
      programId?: string;
      levelId?: string;
      subjectId?: string;
      category?: string;
      dryRun?: boolean;
    },
  ): Promise<ImportResult> {
    if (!file?.buffer?.length)
      throw new BadRequestException('File soal wajib diupload.');

    // Tujuan wajib: jenjang + mapel + tipe — soal tak boleh masuk tanpa kategori.
    if (!refs.levelId)
      throw new BadRequestException('Pilih jenjang/kelas tujuan import.');
    if (!refs.subjectId)
      throw new BadRequestException('Pilih mapel tujuan import.');
    if (!refs.category)
      throw new BadRequestException('Pilih tipe/kategori soal.');

    const [level, subject] = await Promise.all([
      this.prisma.level.findUnique({ where: { id: refs.levelId } }),
      this.prisma.subject.findUnique({ where: { id: refs.subjectId } }),
    ]);
    if (!level) throw new BadRequestException('Jenjang/kelas tidak ditemukan.');
    if (!subject) throw new BadRequestException('Mapel tidak ditemukan.');
    if (refs.programId) {
      const program = await this.prisma.program.findUnique({
        where: { id: refs.programId },
      });
      if (!program) throw new BadRequestException('Program tidak ditemukan.');
    }
    await this.contentCategories.assertUsable(refs.category);

    // Tutor hanya boleh import ke jenjang/mapel/program yang dia ampu.
    const scope = await this.tutorScope.for(actor);
    if (scope) {
      const inScope =
        (refs.programId && scope.programIds.includes(refs.programId)) ||
        scope.levelIds.includes(refs.levelId) ||
        scope.subjectIds.includes(refs.subjectId);
      if (!inScope)
        throw new ForbiddenException(
          'Tujuan import di luar jenjang/mapel yang Anda ampu.',
        );
    }

    const name = file.originalname.toLowerCase();
    let rows: ParsedRow[];
    if (name.endsWith('.docx')) {
      const parsed = await this.parseDocx(file.buffer);
      rows = parsed.rows;
    } else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      rows = await this.parseXlsx(file.buffer);
    } else {
      throw new BadRequestException(
        'Format file harus .docx atau .xlsx — gunakan template yang disediakan.',
      );
    }

    if (!rows.length)
      throw new BadRequestException(
        'Tidak ada soal yang terbaca dari file — cek format template.',
      );

    const imgCount = (r: ParsedRow) =>
      r.contentImages.length +
      r.explanationImages.length +
      Object.values(r.optionImages).reduce((s, a) => s + a.length, 0);

    // Fingerprint soal yang sudah ada di tujuan — mencegah duplikat bila
    // file yang sama diimport ulang atau ada baris kembar dalam satu file.
    const fingerprints = await this.questions.existingFingerprints({
      programId: refs.programId,
      levelId: refs.levelId,
      subjectId: refs.subjectId,
      category: refs.category,
    });

    const results: ImportRowResult[] = [];
    const valid: { row: ParsedRow; dto: CreateQuestionDto }[] = [];
    // Baris duplikat — soal lama DIPERBARUI dengan isi file (bukan dilewati).
    const toUpdate: { row: ParsedRow; dto: CreateQuestionDto; existingId: string }[] = [];
    for (const row of rows) {
      const { dto, errors } = this.toDto(row);
      const warnings = [...row.warnings];
      if (dto) {
        dto.programId = refs.programId;
        dto.levelId = refs.levelId;
        dto.subjectId = refs.subjectId;
        dto.category = refs.category;
        const fp = this.questions.fingerprintOf({
          type: dto.type,
          stimulus: dto.stimulus,
          content: dto.content,
          imageUrl: dto.imageUrl,
          answerKey: dto.answerKey,
          options: dto.options,
        });
        const existingId = fingerprints.get(fp);
        if (existingId !== undefined) {
          toUpdate.push({ row, dto, existingId });
          results.push({
            no: row.no,
            content: dto.content.slice(0, 120),
            type: dto.type,
            ok: true,
            duplicate: true,
            questionId: existingId,
            errors: ['Duplikat — soal lama akan diperbarui dengan isi file ini.'],
            images: imgCount(row) || undefined,
          });
          continue;
        }
        fingerprints.set(fp, '__pending__');
        valid.push({ row, dto });
        results.push({
          no: row.no,
          content: dto.content,
          type: dto.type,
          ok: true,
          errors: warnings,
          images: imgCount(row) || undefined,
        });
      } else {
        results.push({
          no: row.no,
          content: row.content.slice(0, 120),
          ok: false,
          errors: [...errors, ...warnings],
          images: imgCount(row) || undefined,
        });
      }
    }

    let created = 0;
    let updated = 0;
    if (!refs.dryRun) {
      for (const { row, dto, existingId } of toUpdate) {
        await this.attachImages(row, dto, actor.id, results);
        try {
          await this.questions.update(existingId, dto, actor);
          updated++;
          const res = results.find((r) => r.no === row.no);
          if (res) res.updated = true;
        } catch (e) {
          const res = results.find((r) => r.no === row.no);
          if (res) {
            res.ok = false;
            res.errors = [
              `Gagal memperbarui soal lama: ${e instanceof Error ? e.message : 'error'}`,
            ];
          }
        }
      }
      for (const { row, dto } of valid) {
        // Upload gambar hasil ekstrak docx ke pustaka media, lalu tempel URL-nya.
        await this.attachImages(row, dto, actor.id, results);
        try {
          const q = await this.questions.create(actor, dto);
          created++;
          const res = results.find((r) => r.no === row.no);
          if (res) res.questionId = q.id;
        } catch (e) {
          // Balapan dua import — baris yang tiba-tiba duplikat ditandai, bukan abort.
          if (e instanceof ConflictException) {
            const res = results.find((r) => r.no === row.no);
            if (res) {
              res.duplicate = true;
              res.errors.push('Duplikat — soal identik sudah ada, dilewati.');
            }
            continue;
          }
          throw e;
        }
      }
    }

    return {
      parsed: rows.length,
      created,
      updated,
      dryRun: !!refs.dryRun,
      rows: results,
      // Semua id soal hasil import (baru + duplikat yang sudah ada) — dipakai
      // form ujian/latsol untuk langsung memilih soal tanpa cari manual.
      questionIds: results
        .map((r) => r.questionId)
        .filter((id): id is string => !!id),
    };
  }
}

function escapeXml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function unescapeXml(s: string) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}
