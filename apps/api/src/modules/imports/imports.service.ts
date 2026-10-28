// Fitur import massal (migrasi data) — students/parents/tutors via CSV.
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
// Template memakai ";" sebagai pemisah kolom — Excel locale Indonesia
// memecah kolom CSV pada titik-koma, jadi template koma tampil menumpuk
// dalam satu kolom. Parser import menerima dua-duanya (auto-detect).
const TEMPLATES: Record<
  ImportEntity,
  { header: string; samples: string[]; notes: string }
> = {
  students: {
    header: 'email;name;phone;dateOfBirth;address;gender;schoolOrigin;parentEmails;parentPhones',
    samples: [
      'siswa.contoh1@email.com;Siswa Contoh Satu;081200001111;2012-05-14;Jl. Merdeka 1;M;SMPN 1 Jakarta;ortu.contoh@email.com;',
      'siswa.contoh2@email.com;Siswa Contoh Dua;081200002222;2013-08-20;Jl. Sudirman 5;F;;;081300001111|081300002222',
      ';Siswa Contoh Tiga;081200003333;2014-01-10;;M;;;081300001111',
    ],
    notes:
      'email opsional (kosong → digenerate otomatis dari no HP) · name wajib (min 3) · isi email ATAU phone minimal satu (phone dipakai login) · dateOfBirth format YYYY-MM-DD (opsional) · gender: M/F/OTHER (opsional) · schoolOrigin opsional · parentEmails/parentPhones: email/no HP ortu yang sudah terdaftar, pisahkan dengan | (opsional)',
  },
  parents: {
    header: 'email;name;phone;studentEmails;studentPhones',
    samples: [
      'ortu.contoh@email.com;Ortu Contoh;081300001111;siswa.contoh1@email.com;',
      ';Ortu Contoh Dua;081300002222;;081200001111|081200002222',
      'ortu.contoh3@email.com;Ortu Contoh Tiga;081300003333;;',
    ],
    notes:
      'email opsional (kosong → digenerate otomatis dari no HP) · name wajib (min 3) · phone WAJIB (dipakai ortu untuk login via No. HP & notifikasi WhatsApp) · studentEmails/studentPhones: email/no HP siswa yang sudah terdaftar, pisahkan dengan | (opsional)',
  },
  tutors: {
    header: 'email;name;phone;specialization;bio',
    samples: [
      'tutor.contoh@email.com;Tutor Contoh;081400001111;Matematika;"Lulusan FMIPA, pengalaman 5 tahun"',
      ';Tutor Contoh Dua;081400002222;Bahasa Inggris;',
      'tutor.contoh3@email.com;Tutor Contoh Tiga;081400003333;Fisika;"Guru SMA, 3 tahun"',
    ],
    notes:
      'email opsional (kosong → digenerate otomatis dari no HP) · name wajib (min 3) · phone WAJIB (ditampilkan ke ortu & dipakai reminder jadwal) · specialization & bio opsional · pakai tanda kutip bila isi mengandung koma',
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
      if (!email && !row.phone?.trim()) {
        throw new BadRequestException(
          'Isi kolom email ATAU phone — minimal satu (phone dipakai login).',
        );
      }
      const created = await this.people.createStudent({
        email,
        name: row.name.trim(),
        phone: row.phone || undefined,
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
      if (!row.phone?.trim()) {
        throw new BadRequestException(
          'Kolom phone wajib untuk ortu (dipakai login & notifikasi WA).',
        );
      }
      const created = await this.parents.create({
        email,
        name: row.name.trim(),
        phone: row.phone.trim(),
        studentIds,
      });
      return { email: created.user.email, name: created.user.name, tempPassword: created.tempPassword };
    }

    if (!row.phone?.trim()) {
      throw new BadRequestException(
        'Kolom phone wajib untuk tutor (ditampilkan ke ortu & dipakai reminder).',
      );
    }
    const created = await this.tutors.create({
      email,
      name: row.name.trim(),
      phone: row.phone.trim(),
      specialization: row.specialization || undefined,
      bio: row.bio || undefined,
    });
    return { email: created.user.email, name: created.user.name, tempPassword: created.tempPassword };
  }

  async run(entity: string, csv: string | undefined): Promise<ImportResult> {
    this.assertEntity(entity);
    if (typeof csv !== 'string' || !csv.trim()) {
      throw new BadRequestException('Body { csv } wajib berisi teks CSV.');
    }
    const rows = parseCsv(csv);
    if (!rows.length) {
      throw new BadRequestException(
        'CSV tidak berisi baris data (hanya header atau kosong).',
      );
    }
    if (rows.length > 500) {
      throw new BadRequestException(
        'Maksimal 500 baris per import — pecah file bila lebih.',
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
}
