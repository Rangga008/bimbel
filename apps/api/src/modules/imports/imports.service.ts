// Fitur import massal (migrasi data) — students/parents/tutors via Excel/CSV.
// Setiap baris diproses lewat service create yang sama dengan form biasa
// (validasi & pembuatan akun user identik, tempPassword digenerate otomatis),
// tapi error per-baris tidak menggagalkan seluruh import — dikumpulkan ke
// laporan hasil supaya admin bisa memperbaiki baris yang gagal saja.
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PeopleService } from '../people/people.service';
import { ParentsService } from '../people/parents.service';
import { TutorsService } from '../people/tutors.service';
import { UsersService } from '../users/users.service';
import { parseCsv } from './csv-parser';

export type ImportEntity = 'students' | 'parents' | 'tutors';

export interface ImportResult {
  entity: ImportEntity;
  total: number;
  created: number;
  failed: number;
  /** Baris gagal — nomor baris (1-based termasuk header), pesan error. */
  errors: Array<{ row: number; email: string; message: string }>;
  /** Baris di-skip karena redundansi — email/no HP duplikat di file atau
   * sudah dipakai akun lain (bukan kegagalan — hanya dilewati). */
  skipped: number;
  warnings: Array<{ row: number; email: string; message: string }>;
  /** Kredensial sementara untuk akun yang berhasil dibuat — tampilkan sekali ke admin. */
  credentials: Array<{ email: string; name: string; tempPassword?: string }>;
}

const ENTITIES: ImportEntity[] = ['students', 'parents', 'tutors'];

// Tiap entitas: header + beberapa baris CONTOH dengan data berbeda supaya
// jelas satu baris = satu record dan tiap kolom diisi nilainya sendiri.
// Baris contoh & catatan diawali "#" — parser mengabaikannya saat import.
// Template .xlsx punya sheet PETUNJUK terpisah sehingga baris catatan tidak
// menumpuk di sheet data.
const TEMPLATES: Record<
  ImportEntity,
  { header: string; samples: string[]; notes: string }
> = {
  students: {
    header:
      'email;name;phone;password;dateOfBirth;address;gender;schoolOrigin;parentEmails;parentPhones',
    samples: [
      'siswa.contoh1@email.com;Siswa Contoh Satu;081200001111;;2012-05-14;Jl. Merdeka 1;M;SMPN 1 Jakarta;ortu.contoh@email.com;',
      'siswa.contoh2@email.com;Siswa Contoh Dua;081200002222;;2013-08-20;Jl. Sudirman 5;F;;;081300001111|081300002222',
      ';Siswa Contoh Tiga;;;2014-01-10;;M;;;081300001111',
    ],
    notes:
      'email opsional (kosong → digenerate otomatis, termasuk saat no HP juga kosong) · name wajib (min 3) · phone opsional (dipakai login & notifikasi) · password opsional (min 8 karakter; kosong → digenerate otomatis, tampil sekali di hasil import) · dateOfBirth format YYYY-MM-DD (opsional) · gender: M/F/OTHER (opsional) · schoolOrigin opsional · parentEmails/parentPhones: email/no HP ortu yang sudah terdaftar, pisahkan dengan | (opsional)',
  },
  parents: {
    header: 'email;name;phone;password;studentEmails;studentPhones',
    samples: [
      'ortu.contoh@email.com;Ortu Contoh;081300001111;;siswa.contoh1@email.com;',
      ';Ortu Contoh Dua;081300002222;;;081200001111|081200002222',
      'ortu.contoh3@email.com;Ortu Contoh Tiga;081300003333;;;',
    ],
    notes:
      'email opsional (kosong → digenerate otomatis, termasuk saat no HP juga kosong) · name wajib (min 3) · phone opsional tapi disarankan (dipakai ortu untuk login via No. HP & notifikasi WhatsApp) · password opsional (min 8 karakter; kosong → digenerate otomatis, tampil sekali di hasil import) · studentEmails/studentPhones: email/no HP siswa yang sudah terdaftar, pisahkan dengan | (opsional)',
  },
  tutors: {
    header: 'email;name;phone;password;specialization;bio',
    samples: [
      'tutor.contoh@email.com;Tutor Contoh;081400001111;;Matematika;"Lulusan FMIPA, pengalaman 5 tahun"',
      ';Tutor Contoh Dua;081400002222;;Bahasa Inggris;',
      'tutor.contoh3@email.com;Tutor Contoh Tiga;081400003333;;Fisika;"Guru SMA, 3 tahun"',
    ],
    notes:
      'email opsional (kosong → digenerate otomatis, termasuk saat no HP juga kosong) · name wajib (min 3) · phone opsional tapi disarankan (ditampilkan ke ortu & dipakai reminder jadwal) · password opsional (min 8 karakter; kosong → digenerate otomatis, tampil sekali di hasil import) · specialization & bio opsional',
  },
};

@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly people: PeopleService,
    private readonly parents: ParentsService,
    private readonly tutors: TutorsService,
  ) {}

  assertEntity(entity: string): asserts entity is ImportEntity {
    if (!ENTITIES.includes(entity as ImportEntity)) {
      throw new NotFoundException(
        `Entity import "${entity}" tidak dikenal. Pilihan: ${ENTITIES.join(', ')}.`,
      );
    }
  }

  template(entity: ImportEntity) {
    return TEMPLATES[entity];
  }

  /** Template .xlsx — sheet DATA berisi header + contoh, sheet PETUNJUK
   *  menjelaskan tiap kolom. Baris contoh diawali "#" di kolom pertama
   *  sehingga otomatis di-skip parser (boleh juga dihapus/diganti). */
  async templateXlsx(entity: ImportEntity): Promise<Buffer> {
    const t = TEMPLATES[entity];
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('DATA');
    const cols = t.header.split(';').map((h) => ({
      header: h,
      key: h,
      width: Math.max(14, h.length + 4),
    }));
    ws.columns = cols;
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF3F6FF' },
    };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    t.samples.forEach((line) => {
      const cells = line.split(';');
      // Tandai baris contoh dengan "#" di kolom pertama — parser skip,
      // user tinggal menimpanya dengan data asli.
      cells[0] = `#${cells[0]}`;
      ws.addRow(cells);
    });
    const guide = wb.addWorksheet('PETUNJUK');
    guide.getColumn(1).width = 100;
    guide.addRow([`TEMPLATE IMPORT ${entity.toUpperCase()}`]).font = {
      bold: true,
      size: 13,
    };
    guide.addRow(['']);
    guide.addRow(['Cara pakai:']);
    t.notes.split('·').forEach((note) => {
      guide.addRow([`• ${note.trim()}`]);
    });
    guide.addRow(['']);
    guide.addRow([
      'Baris contoh (kolom pertama diawali "#") otomatis dilewati saat import — timpa saja dengan data asli.',
    ]);
    guide.addRow(['Maksimal 500 baris data per import.']);
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  /** Nilai sel ExcelJS → string bersih (teks, angka, tanggal, formula). */
  private cellText(v: ExcelJS.CellValue): string {
    if (v === null || v === undefined) return '';
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === 'object') {
      const o = v as unknown as Record<string, unknown>;
      if (o.richText)
        return (o.richText as Array<{ text: string }>)
          .map((r) => r.text)
          .join('');
      if (o.result !== undefined) return this.cellText(o.result as ExcelJS.CellValue);
      if (o.text !== undefined) return String(o.text);
      return String(v);
    }
    return String(v);
  }

  /** File .xlsx → array objek berkunci header (sama bentuk dengan hasil
   *  parseCsv). Memindai SEMUA sheet dan memilih yang baris pertamanya
   *  memuat kolom "name" — jadi data yang ditulis di sheet lain tetap
   *  terbaca. Baris kosong & diawali "#" di kolom pertama di-skip. */
  private async parseXlsx(
    buffer: Buffer,
  ): Promise<Array<Record<string, string>>> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    let headerRow: ExcelJS.Row | undefined;
    let ws: ExcelJS.Worksheet | undefined;
    let headers: string[] = [];
    // Pass 1: cari sheet yang baris non-kosong pertamanya mengandung "name".
    for (const cand of wb.worksheets) {
      let found: ExcelJS.Row | undefined;
      let heads: string[] = [];
      cand.eachRow((row) => {
        if (found) return;
        const cells = (row.values as ExcelJS.CellValue[]).slice(1);
        const texts = cells.map((c) => this.cellText(c).trim().toLowerCase());
        if (texts.some((t) => t !== '')) {
          if (texts.includes('name')) {
            found = row;
            heads = texts;
          } else {
            // Baris non-kosong pertama tanpa kolom name → bukan sheet data.
            found = row; // tetap catat agar loop berhenti
            heads = [];
          }
        }
      });
      if (found && heads.includes('name')) {
        ws = cand;
        headerRow = found;
        headers = heads;
        break;
      }
    }
    // Pass 2 (fallback): sheet non-kosong pertama — header = baris pertamanya.
    if (!ws) {
      ws = wb.worksheets.find((s) => s.rowCount > 0);
      if (!ws) return [];
      ws.eachRow((row) => {
        if (headerRow) return;
        const cells = (row.values as ExcelJS.CellValue[]).slice(1);
        if (cells.some((c) => this.cellText(c).trim())) {
          headerRow = row;
          headers = cells.map((c) => this.cellText(c).trim().toLowerCase());
        }
      });
    }
    if (!headerRow) return [];
    const headerRowIdx = headerRow.number;
    const out: Array<Record<string, string>> = [];
    ws.eachRow((row, rowNumber) => {
      if (rowNumber <= headerRowIdx) return;
      const cells = (row.values as ExcelJS.CellValue[]).slice(1);
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => {
        obj[h] = this.cellText(cells[i]).trim();
      });
      const first = obj[headers[0]] ?? '';
      if (!first.startsWith('#') && Object.values(obj).some((v) => v !== '')) {
        out.push(obj);
      }
    });
    return out;
  }

  /**
   * Email/no HP -> id lookup untuk kolom relasi (parentEmails/parentPhones,
   * studentEmails/studentPhones). Case-insensitive + nomor HP dicocokkan ke
   * semua varian (0xxx/62xxx/+62xxx) — hasil di-cache per import run supaya
   * 500 baris tidak memicu 500 query (lookup ditarik sekali per batch).
   */
  private async loadIdMap(
    kind: 'parent' | 'student',
    refs: string[],
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (!refs.length) return map;
    const emails = refs.filter((r) => r.includes('@')).map((r) => r.toLowerCase());
    const phoneVariants = [
      ...new Set(
        refs.filter((r) => !r.includes('@')).flatMap((r) =>
          UsersService.phoneVariants(r),
        ),
      ),
    ];
    const where = {
      user: {
        OR: [
          ...(emails.length
            ? [{ email: { in: emails, mode: 'insensitive' as const } }]
            : []),
          ...(phoneVariants.length ? [{ phone: { in: phoneVariants } }] : []),
        ],
      },
    };
    const select = { id: true, user: { select: { email: true, phone: true } } };
    const rows =
      kind === 'parent'
        ? await this.prisma.parent.findMany({ where, select })
        : await this.prisma.student.findMany({ where, select });
    for (const r of rows) {
      if (r.user.email) map.set(r.user.email.toLowerCase(), r.id);
      if (r.user.phone) {
        for (const v of UsersService.phoneVariants(r.user.phone)) {
          map.set(v.toLowerCase(), r.id);
        }
      }
    }
    return map;
  }

  private resolveIds(
    map: Map<string, string>,
    refs: string[],
    label: string,
  ): string[] | undefined {
    if (!refs.length) return undefined;
    // Cocokkan persis lalu varian nomor HP (0xxx vs 62xxx).
    const keys = (r: string) => {
      const k = r.toLowerCase();
      if (map.has(k)) return [k];
      return UsersService.phoneVariants(r).map((v) => v.toLowerCase());
    };
    const missing = refs.filter((r) => !keys(r).some((k) => map.has(k)));
    if (missing.length) {
      throw new BadRequestException(
        `Email/no HP ${label} tidak ditemukan: ${missing.join(', ')}`,
      );
    }
    return refs.map((r) => map.get(keys(r).find((k) => map.has(k))!)!);
  }

  private splitEmails(raw: string | undefined): string[] {
    return (raw ?? '')
      .split('|')
      .map((e) => e.trim())
      .filter(Boolean);
  }

  private async createRow(
    entity: ImportEntity,
    row: Record<string, string>,
    maps: { parents: Map<string, string>; students: Map<string, string> },
  ) {
    const email = row.email?.trim() || undefined;
    if (!row.name?.trim()) throw new BadRequestException('Kolom name wajib diisi.');
    // password opsional — bila diisi harus ≥8 karakter (aturan sama dengan
    // form biasa); bila kosong service generate tempPassword otomatis.
    const password = row.password?.trim() || undefined;
    if (password && password.length < 8) {
      throw new BadRequestException('Kolom password minimal 8 karakter.');
    }
    // Email & no HP boleh dua-duanya kosong — service membuat email
    // placeholder otomatis supaya kolom unik users.email tetap terisi.

    if (entity === 'students') {
      const parentIds = this.resolveIds(
        maps.parents,
        [
          ...this.splitEmails(row.parentemails),
          ...this.splitEmails(row.parentphones),
        ],
        'orang tua',
      );
      const gender = row.gender?.trim().toUpperCase();
      if (gender && !['M', 'F', 'OTHER'].includes(gender)) {
        throw new BadRequestException('gender harus M, F, atau OTHER.');
      }
      const created = await this.people.createStudent({
        email,
        name: row.name.trim(),
        phone: row.phone || undefined,
        password,
        dateOfBirth: row.dateofbirth || undefined,
        address: row.address || undefined,
        gender: (gender || undefined) as 'M' | 'F' | 'OTHER' | undefined,
        schoolOrigin: row.schoolorigin || undefined,
        parentIds,
      });
      return { email: created.user.email, name: created.user.name, tempPassword: created.tempPassword };
    }

    if (entity === 'parents') {
      const studentIds = this.resolveIds(
        maps.students,
        [
          ...this.splitEmails(row.studentemails),
          ...this.splitEmails(row.studentphones),
        ],
        'siswa',
      );
      const created = await this.parents.create({
        email,
        name: row.name.trim(),
        phone: (row.phone?.trim() || undefined) as string,
        password,
        studentIds,
      });
      return { email: created.user.email, name: created.user.name, tempPassword: created.tempPassword };
    }

    const created = await this.tutors.create({
      email,
      name: row.name.trim(),
      phone: (row.phone?.trim() || undefined) as string,
      password,
      specialization: row.specialization || undefined,
      bio: row.bio || undefined,
    });
    return { email: created.user.email, name: created.user.name, tempPassword: created.tempPassword };
  }

  async run(
    entity: string,
    body: { csv?: string; xlsx?: string },
  ): Promise<ImportResult> {
    this.assertEntity(entity);
    let rows: Array<Record<string, string>>;
    if (body?.xlsx) {
      // File .xlsx dikirim sebagai base64 dari browser.
      try {
        rows = await this.parseXlsx(Buffer.from(body.xlsx, 'base64'));
      } catch {
        throw new BadRequestException(
          'File Excel tidak bisa dibaca — pastikan format .xlsx (bukan .xls lama).',
        );
      }
    } else if (typeof body?.csv === 'string' && body.csv.trim()) {
      rows = parseCsv(body.csv);
    } else {
      throw new BadRequestException(
        'Body { csv } atau { xlsx } wajib berisi data import.',
      );
    }
    if (!rows.length) {
      throw new BadRequestException(
        'File tidak berisi baris data — hanya header atau baris contoh (baris contoh diawali "#" di kolom pertama tidak ikut diimport). Isi data asli mulai baris ke-2.',
      );
    }
    if (rows.length > 500) {
      throw new BadRequestException(
        'Maksimal 500 baris per import — pecah file bila lebih.',
      );
    }
    // Pastikan kolom yang dibutuhkan ada — file dari template lama/lain
    // yang kekurangan kolom wajib ditolak jelas, bukan gagal per-baris.
    const requiredCols = TEMPLATES[entity].header.split(';').slice(0, 2);
    const missing = requiredCols.filter((c) => !(c in rows[0]));
    if (missing.length) {
      throw new BadRequestException(
        `Kolom wajib tidak ada di file: ${missing.join(', ')}. Unduh template terbaru lalu salin datanya.`,
      );
    }

    // Preload semua email relasi sekali (bukan per-baris) — query batch tunggal.
    const allRefEmails = rows.flatMap((r) =>
      entity === 'students'
        ? [...this.splitEmails(r.parentemails), ...this.splitEmails(r.parentphones)]
        : entity === 'parents'
          ? [...this.splitEmails(r.studentemails), ...this.splitEmails(r.studentphones)]
          : [],
    );
    const maps = {
      parents:
        entity === 'students'
          ? await this.loadIdMap('parent', allRefEmails)
          : new Map<string, string>(),
      students:
        entity === 'parents'
          ? await this.loadIdMap('student', allRefEmails)
          : new Map<string, string>(),
    };

    // Email/no HP duplikat di dalam file yang sama — baris kedua dst di-skip
    // sebagai WARNING (bukan error) agar admin tahu ada redundansi.
    const seenEmail = new Map<string, number>();
    const seenPhone = new Map<string, number>();
    const dupInFile = new Map<number, string>();
    const normPhone = (p?: string) => (p ?? '').replace(/\D/g, '');
    rows.forEach((r, i) => {
      const e = r.email?.trim().toLowerCase();
      if (e) {
        if (seenEmail.has(e)) dupInFile.set(i, `Email "${r.email?.trim()}" duplikat dengan baris lain di file.`);
        else seenEmail.set(e, i);
      }
      const p = normPhone(r.phone);
      if (p) {
        if (seenPhone.has(p)) dupInFile.set(i, `No HP "${r.phone?.trim()}" duplikat dengan baris lain di file.`);
        else seenPhone.set(p, i);
      }
    });

    const result: ImportResult = {
      entity,
      total: rows.length,
      created: 0,
      failed: 0,
      errors: [],
      skipped: 0,
      warnings: [],
      credentials: [],
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const dupMsg = dupInFile.get(i);
      if (dupMsg) {
        result.skipped++;
        result.warnings.push({ row: i + 2, email: row.email ?? '', message: `${dupMsg} — dilewati.` });
        continue;
      }
      try {
        const cred = await this.createRow(entity, row, maps);
        result.created++;
        result.credentials.push(cred);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Kesalahan tidak dikenal.';
        // Redundansi dengan data yang sudah ada (email/no HP dipakai akun
        // lain) → warning + skip, bukan kegagalan.
        if (e instanceof ConflictException || /sudah dipakai/i.test(msg)) {
          result.skipped++;
          result.warnings.push({ row: i + 2, email: row.email ?? '', message: `${msg} — dilewati.` });
        } else {
          result.failed++;
          result.errors.push({ row: i + 2, email: row.email ?? '', message: msg });
        }
      }
    }
    return result;
  }

  /** Export .xlsx data entitas — kolom administrasi saja, tanpa
   *  kredensial/hash. Email sintetis (wa.*@hp.bimbel.local) dikosongkan.
   *  Siswa mendukung filter asal daftar/kelompok/jenjang. */
  async exportXlsx(
    entity: ImportEntity,
    filters?: { origin?: 'external' | 'internal'; groupId?: string; levelId?: string },
  ): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('DATA');
    const fmtDate = (d?: Date | null) =>
      d ? d.toISOString().slice(0, 10) : '';
    const realEmail = (e?: string | null) =>
      e && !e.endsWith('@hp.bimbel.local') ? e : '';
    if (entity === 'students') {
      ws.columns = [
        { header: 'name', key: 'name', width: 26 },
        { header: 'email', key: 'email', width: 28 },
        { header: 'phone', key: 'phone', width: 16 },
        { header: 'nis', key: 'nis', width: 12 },
        { header: 'dateOfBirth', key: 'dob', width: 14 },
        { header: 'gender', key: 'gender', width: 9 },
        { header: 'schoolOrigin', key: 'school', width: 22 },
        { header: 'address', key: 'address', width: 30 },
        { header: 'status', key: 'status', width: 10 },
        { header: 'asalDaftar', key: 'origin', width: 16 },
        { header: 'orangTua', key: 'parents', width: 30 },
        { header: 'phoneOrangTua', key: 'parentPhones', width: 22 },
        { header: 'kelompok', key: 'groups', width: 28 },
      ];
      const where: Prisma.StudentWhereInput = {};
      if (filters?.origin === 'external') where.isExternal = true;
      if (filters?.origin === 'internal') where.isExternal = false;
      if (filters?.groupId) {
        where.groupMembers = { some: { groupId: filters.groupId } };
      }
      if (filters?.levelId) {
        where.groupMembers = {
          ...(where.groupMembers ?? {}),
          some: {
            ...(where.groupMembers?.some ?? {}),
            group: { levelId: filters.levelId },
          },
        };
      }
      const rows = await this.prisma.student.findMany({
        where,
        orderBy: { user: { name: 'asc' } },
        include: {
          user: true,
          parentStudents: {
            include: {
              parent: { include: { user: { select: { name: true, phone: true } } } },
            },
          },
          groupMembers: {
            include: {
              group: {
                select: {
                  name: true,
                  level: { select: { name: true } },
                },
              },
            },
          },
        },
      });
      for (const s of rows) {
        ws.addRow({
          name: s.user.name,
          email: realEmail(s.user.email),
          phone: s.user.phone ?? '',
          nis: s.nis ?? '',
          dob: fmtDate(s.dateOfBirth),
          gender: s.gender ?? '',
          school: s.schoolOrigin ?? '',
          address: s.address ?? '',
          status: s.isActive ? 'Aktif' : 'Nonaktif',
          origin: s.isExternal ? 'Daftar mandiri' : 'Terdaftar di GFS',
          parents: s.parentStudents
            .map((ps) => ps.parent.user.name)
            .join('; '),
          parentPhones: s.parentStudents
            .map((ps) => ps.parent.user.phone ?? '')
            .filter(Boolean)
            .join('; '),
          groups: s.groupMembers
            .map((gm) =>
              gm.group.level?.name
                ? `${gm.group.name} (${gm.group.level.name})`
                : gm.group.name,
            )
            .join('; '),
        });
      }
    } else if (entity === 'parents') {
      ws.columns = [
        { header: 'name', key: 'name', width: 26 },
        { header: 'email', key: 'email', width: 28 },
        { header: 'phone', key: 'phone', width: 16 },
        { header: 'status', key: 'status', width: 10 },
        { header: 'anak', key: 'children', width: 32 },
        { header: 'phoneAnak', key: 'childPhones', width: 24 },
      ];
      const rows = await this.prisma.parent.findMany({
        orderBy: { user: { name: 'asc' } },
        include: {
          user: true,
          parentStudents: {
            include: {
              student: { include: { user: { select: { name: true, phone: true } } } },
            },
          },
        },
      });
      for (const p of rows) {
        ws.addRow({
          name: p.user.name,
          email: realEmail(p.user.email),
          phone: p.user.phone ?? '',
          status: p.isActive ? 'Aktif' : 'Nonaktif',
          children: p.parentStudents
            .map((ps) => ps.student.user.name)
            .join('; '),
          childPhones: p.parentStudents
            .map((ps) => ps.student.user.phone ?? '')
            .filter(Boolean)
            .join('; '),
        });
      }
    } else {
      ws.columns = [
        { header: 'name', key: 'name', width: 26 },
        { header: 'email', key: 'email', width: 28 },
        { header: 'phone', key: 'phone', width: 16 },
        { header: 'specialization', key: 'spec', width: 20 },
        { header: 'status', key: 'status', width: 10 },
      ];
      const rows = await this.prisma.tutor.findMany({
        orderBy: { user: { name: 'asc' } },
        include: { user: true },
      });
      for (const t of rows) {
        ws.addRow({
          name: t.user.name,
          email: realEmail(t.user.email),
          phone: t.user.phone ?? '',
          spec: t.specialization ?? '',
          status: t.isActive ? 'Aktif' : 'Nonaktif',
        });
      }
    }
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF3F6FF' },
    };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    return Buffer.from(await wb.xlsx.writeBuffer());
  }
}
