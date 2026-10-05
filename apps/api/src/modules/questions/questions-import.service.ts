import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import type { QuestionType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TutorScopeService } from '../../common/tutor-scope/tutor-scope.service';
import { ContentCategoriesService } from '../content-categories/content-categories.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { QuestionsService } from './questions.service';
import type { CreateQuestionDto } from './dto/question.dto';

/** Satu soal hasil parse file import (sebelum divalidasi jadi DTO). */
interface ParsedRow {
  no: number;
  type?: string;
  content: string;
  options: string[];
  kunci: string;
  points?: number;
  difficulty?: string;
  explanation?: string;
}

export interface ImportRowResult {
  no: number;
  content: string;
  type?: string;
  ok: boolean;
  errors: string[];
}

export interface ImportResult {
  parsed: number;
  created: number;
  dryRun: boolean;
  rows: ImportRowResult[];
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
  '- Setiap soal diawali baris "SOAL <nomor>".',
  '- Baris "Tipe:" berisi: PG (pilihan ganda), PGK (ganda kompleks), BS (benar/salah), ISIAN, atau ESSAY.',
  '- Opsi jawaban ditulis per baris diawali huruf + titik: "A. ...", "B. ..." (maks E).',
  '- Baris "Kunci:" berisi huruf jawaban benar (mis. B, atau A,C untuk PGK), teks isian, atau Benar/Salah.',
  '- "Poin:" (opsional, angka), "Kesulitan:" (EASY/MEDIUM/HARD, opsional), "Pembahasan:" (opsional).',
  '- Jenjang, mapel, dan tipe/kategori DIPILIH di halaman import — tidak perlu ditulis di file.',
  '',
  'SOAL 1',
  'Tipe: PG',
  'Soal: Berapa hasil dari 7 x 8?',
  'A. 54',
  'B. 56',
  'C. 63',
  'D. 64',
  'Kunci: B',
  'Poin: 2',
  'Kesulitan: EASY',
  'Pembahasan: 7 x 8 = 56.',
  '',
  'SOAL 2',
  'Tipe: BS',
  'Soal: Indonesia berada di benua Asia.',
  'Kunci: Benar',
  'Poin: 1',
  '',
  'SOAL 3',
  'Tipe: PGK',
  'Soal: Manakah yang termasuk bilangan prima?',
  'A. 2',
  'B. 4',
  'C. 5',
  'D. 9',
  'Kunci: A,C',
  '',
  'SOAL 4',
  'Tipe: ISIAN',
  'Soal: Ibukota Indonesia adalah ...',
  'Kunci: Jakarta',
  '',
  'SOAL 5',
  'Tipe: ESSAY',
  'Soal: Jelaskan proses fotosintesis!',
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
];

const XLSX_EXAMPLE = [
  1,
  'PG',
  'Berapa hasil dari 7 x 8?',
  '54',
  '56',
  '63',
  '64',
  '',
  'B',
  2,
  'EASY',
  '7 x 8 = 56.',
];

@Injectable()
export class QuestionsImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly questions: QuestionsService,
    private readonly tutorScope: TutorScopeService,
    private readonly contentCategories: ContentCategoriesService,
  ) {}

  // ---------- TEMPLATE ----------

  async templateXlsx(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Soal');
    ws.columns = XLSX_HEADERS.map((h, i) => ({
      header: h,
      key: `c${i}`,
      width: i === 2 ? 50 : i >= 3 && i <= 7 ? 22 : 14,
    }));
    ws.getRow(1).font = { bold: true };
    ws.addRow(XLSX_EXAMPLE);
    ws.addRow([
      2,
      'BS',
      'Matahari terbit dari timur.',
      '',
      '',
      '',
      '',
      '',
      'Benar',
      1,
      'EASY',
      '',
    ]);
    ws.addRow([3, 'ISIAN', 'Ibukota Indonesia adalah ...', '', '', '', '', '', 'Jakarta', 1, 'MEDIUM', '']);
    const guide = wb.addWorksheet('Petunjuk');
    [
      'Isi kolom sesuai header di sheet "Soal".',
      'Tipe: PG | PGK | BS | ISIAN | ESSAY.',
      'Kunci: huruf opsi (B), beberapa huruf untuk PGK (A,C), Benar/Salah untuk BS, teks untuk ISIAN, kosong untuk ESSAY.',
      'Kesulitan: EASY | MEDIUM | HARD (opsional). Poin: angka (opsional).',
      'Jenjang, mapel, dan tipe/kategori dipilih di halaman import — tidak perlu kolom di sini.',
    ].forEach((t) => guide.addRow([t]));
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  async templateDocx(): Promise<Buffer> {
    const paragraphs = DOCX_TEMPLATE_LINES.map(
      (line) =>
        `<w:p><w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`,
    ).join('');
    const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}<w:sectPr/></w:body></w:document>`;
    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
    const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
    const zip = new JSZip();
    zip.file('[Content_Types].xml', contentTypes);
    zip.file('_rels/.rels', rels);
    zip.file('word/document.xml', document);
    return zip.generateAsync({ type: 'nodebuffer' });
  }

  // ---------- PARSE ----------

  private async parseDocx(buffer: Buffer): Promise<ParsedRow[]> {
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
    const xml = await doc.async('string');
    const paragraphs: string[] = [];
    const pRe = /<w:p[\s>][\s\S]*?<\/w:p>/g;
    let m: RegExpExecArray | null;
    while ((m = pRe.exec(xml))) {
      const texts: string[] = [];
      const tRe = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
      let tm: RegExpExecArray | null;
      while ((tm = tRe.exec(m[0]))) texts.push(tm[1]);
      const line = unescapeXml(texts.join('')).trim();
      if (line) paragraphs.push(line);
    }
    return this.parseLines(paragraphs);
  }

  /** Parser format teks: blok dimulai "SOAL n", field "Tipe:", "Kunci:", dst. */
  private parseLines(lines: string[]): ParsedRow[] {
    const rows: ParsedRow[] = [];
    let cur: ParsedRow | null = null;
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      if (/^SOAL\s+\d+/i.test(line)) {
        if (cur) rows.push(cur);
        cur = {
          no: Number(line.match(/\d+/)?.[0] ?? rows.length + 1),
          content: '',
          options: [],
          kunci: '',
        };
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
        else if (key === 'PEMBAHASAN') cur.explanation = val;
        else if (key === 'SOAL') cur.content = val;
        else cur.content = cur.content ? `${cur.content}\n${line}` : line;
        continue;
      }
      const opt = line.match(/^([A-E])\s*[.)]\s*(.*)$/);
      if (opt) {
        cur.options[OPTION_LETTERS.indexOf(opt[1])] = opt[2].trim();
        continue;
      }
      // Baris lanjutan isi soal.
      cur.content = cur.content ? `${cur.content}\n${line}` : line;
    }
    if (cur) rows.push(cur);
    // Rapikan opsi sparse → padat sesuai huruf yang dipakai.
    for (const r of rows) r.options = r.options.filter((o) => o !== undefined && o !== '');
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
      const content = cell(3);
      const kunci = cell(9);
      if (!content && !kunci) return; // baris kosong
      rows.push({
        no,
        type: cell(2) || undefined,
        content,
        options: [cell(4), cell(5), cell(6), cell(7), cell(8)].filter(Boolean),
        kunci,
        points: cell(10) ? Number(cell(10)) || undefined : undefined,
        difficulty: cell(11) || undefined,
        explanation: cell(12) || undefined,
      });
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
      const k = row.kunci.trim().toLowerCase();
      const benar = ['benar', 'true', 'b'].includes(k);
      const salah = ['salah', 'false', 's'].includes(k);
      if (!benar && !salah)
        errors.push('Kunci soal Benar/Salah harus berisi "Benar" atau "Salah".');
      dto.options = [
        { content: 'Benar', isCorrect: benar, sortOrder: 0 },
        { content: 'Salah', isCorrect: salah, sortOrder: 1 },
      ];
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

    return { dto: errors.length ? undefined : dto, errors };
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
    const rows = name.endsWith('.docx')
      ? await this.parseDocx(file.buffer)
      : name.endsWith('.xlsx') || name.endsWith('.xls')
        ? await this.parseXlsx(file.buffer)
        : (() => {
            throw new BadRequestException(
              'Format file harus .docx atau .xlsx — gunakan template yang disediakan.',
            );
          })();

    if (!rows.length)
      throw new BadRequestException(
        'Tidak ada soal yang terbaca dari file — cek format template.',
      );

    const results: ImportRowResult[] = [];
    const valid: { row: ParsedRow; dto: CreateQuestionDto }[] = [];
    for (const row of rows) {
      const { dto, errors } = this.toDto(row);
      if (dto) {
        dto.programId = refs.programId;
        dto.levelId = refs.levelId;
        dto.subjectId = refs.subjectId;
        dto.category = refs.category;
        valid.push({ row, dto });
        results.push({ no: row.no, content: dto.content, type: dto.type, ok: true, errors: [] });
      } else {
        results.push({ no: row.no, content: row.content.slice(0, 120), ok: false, errors });
      }
    }

    let created = 0;
    if (!refs.dryRun) {
      for (const { dto } of valid) {
        await this.questions.create(actor.id, dto);
        created++;
      }
    }

    return {
      parsed: rows.length,
      created,
      dryRun: !!refs.dryRun,
      rows: results,
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
