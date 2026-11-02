import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { createReadStream } from 'fs';
import { open, readdir, stat, unlink } from 'fs/promises';
import { join } from 'path';
import { createGunzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { PassThrough, Readable, Transform } from 'stream';
import { StringDecoder } from 'string_decoder';
import type { TransformCallback } from 'stream';
import { PrismaService } from '../prisma/prisma.service';

interface DbTarget {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
}

/**
 * pg_dump ≥17 mengeluarkan `SET transaction_timeout = 0;` di header dump dan
 * ≥17.4/18 menambah meta-command `\restrict`/`\unrestrict` — keduanya tidak
 * dikenal Postgres/psql versi lebih tua (mis. server PG16) sehingga restore
 * `ON_ERROR_STOP=1` gagal total (rollback) padahal data/schema sepenuhnya
 * kompatibel. Stream ini membuang baris-baris tsb saat lewat — hanya pengaturan
 * sesi/pengaman dump, tidak pernah bagian dari data. Aman dibuang dua arah:
 * file hasil export jadi portable & restore tidak lagi gagal di server lama.
 */
class StripUnsupportedLinesStream extends Transform {
  private pending = '';
  private readonly decoder = new StringDecoder('utf8');
  private static readonly DROP_LINE =
    /^[ \t]*(?:SET[ \t]+transaction_timeout[ \t]*=.*|\\(?:un)?restrict\b.*)$/i;

  override _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: TransformCallback,
  ): void {
    this.pending += this.decoder.write(chunk);
    // Proses hanya baris yang sudah utuh — sisa (mungkin baris terpotong atau
    // karakter UTF-8 multi-byte yang terbelah) ditahan untuk chunk berikut.
    const lastNl = this.pending.lastIndexOf('\n');
    if (lastNl < 0) {
      callback();
      return;
    }
    const done = this.pending.slice(0, lastNl + 1);
    this.pending = this.pending.slice(lastNl + 1);
    callback(null, this.strip(done));
  }

  override _flush(callback: TransformCallback): void {
    this.pending += this.decoder.end();
    callback(null, this.strip(this.pending));
    this.pending = '';
  }

  private strip(text: string): string {
    return text
      .split('\n')
      .filter((line) => !StripUnsupportedLinesStream.DROP_LINE.test(line))
      .join('\n');
  }
}

/**
 * Backup & restore database Postgres memakai utilitas resmi
 * (pg_dump / psql) yang terpasang di image API.
 *
 * - Export: `pg_dump --clean --if-exists` → dump berisi DROP+CREATE
 *   sehingga file yang sama bisa dipulihkan ke DB kosong maupun
 *   DB yang sudah terisi (restore idempotent untuk migrasi hosting).
 * - Import: `psql --single-transaction -v ON_ERROR_STOP=1` → seluruh
 *   restore jalan dalam SATU transaksi; kalau ada statement gagal,
 *   semuanya rollback — DB tidak pernah setengah-restore.
 * - Kredensial diambil dari DATABASE_URL runtime — password tidak pernah
 *   masuk log/perintah args (dilewatkan via env PGPASSWORD ke proses anak).
 */
@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);
  /** Mutex sederhana — dua restore paralel bisa saling menimpa DROP/CREATE. */
  private restoreInProgress = false;

  constructor(private readonly prisma: PrismaService) {}

  /** Parse DATABASE_URL → target koneksi untuk peralatan Postgres. */
  private target(): DbTarget {
    const raw = process.env.DATABASE_URL;
    if (!raw) {
      throw new InternalServerErrorException(
        'DATABASE_URL tidak terkonfigurasi — backup tidak tersedia.',
      );
    }
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new InternalServerErrorException(
        'DATABASE_URL tidak valid — backup tidak tersedia.',
      );
    }
    return {
      host: url.hostname,
      port: url.port || '5432',
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.replace(/^\//, ''),
    };
  }

  private childEnv(t: DbTarget): NodeJS.ProcessEnv {
    return { ...process.env, PGPASSWORD: t.password, PGCONNECT_TIMEOUT: '15' };
  }

  private args(t: DbTarget): string[] {
    return ['-h', t.host, '-p', t.port, '-U', t.user, '-d', t.database];
  }

  /**
   * Spawn pg_dump (format plain SQL) — caller men-stream stdout ke response.
   * Mengembalikan child process agar controller bisa menangani error/abort.
   */
  spawnExport(): ChildProcessWithoutNullStreams {
    const t = this.target();
    const child = spawn(
      'pg_dump',
      [
        ...this.args(t),
        '--clean',
        '--if-exists',
        '--no-owner',
        '--no-privileges',
        '--no-comments',
        '--encoding=UTF8',
      ],
      { env: this.childEnv(t) },
    );
    child.stderr.on('data', (chunk: Buffer) =>
      this.logger.warn(`pg_dump: ${chunk.toString().trim()}`),
    );
    return child;
  }

  /**
   * Stream yang membuang baris dump yang tidak didukung server tujuan
   * (lihat StripUnsupportedLinesStream). Dipakai di jalur import dan juga
   * disisipkan controller sebelum gzip pada export.
   */
  sanitizeDumpStream(): Transform {
    return new StripUnsupportedLinesStream();
  }

  /**
   * Restore file SQL (polos atau .gz) ke database secara atomik.
   * Melempar BadRequestException dengan ringkasan error psql bila gagal.
   */
  async importDump(filePath: string, expectGzip?: boolean): Promise<void> {
    if (this.restoreInProgress) {
      throw new BadRequestException(
        'Restore lain sedang berjalan — tunggu sampai selesai.',
      );
    }
    this.restoreInProgress = true;

    // Timeout menjaga restore tidak menggantung selamanya saat menunggu lock
    // dari koneksi aplikasi yang sedang aktif. Bisa ditambah di env produksi.
    const timeoutMs = Number(
      process.env.BACKUP_RESTORE_TIMEOUT_MS ?? 10 * 60 * 1000,
    );
    let timeout: NodeJS.Timeout | undefined;

    try {
      const t = this.target();
      const fileStat = await stat(filePath);
      if (fileStat.size === 0) {
        throw new BadRequestException(
          'File backup kosong — unggah file .sql/.sql.gz hasil export yang berisi data.',
        );
      }

      const head = Buffer.alloc(2);
      const fd = await open(filePath, 'r');
      try {
        await fd.read(head, 0, 2, 0);
      } finally {
        await fd.close();
      }
      const gzip = head[0] === 0x1f && head[1] === 0x8b;
      if (expectGzip === true && !gzip) {
        throw new BadRequestException(
          'File .sql.gz tidak valid atau rusak — isinya bukan arsip gzip.',
        );
      }
      if (expectGzip === false && gzip) {
        throw new BadRequestException(
          'File yang diunggah adalah gzip — gunakan nama berakhiran .sql.gz.',
        );
      }

      const source: Readable = gzip
        ? createReadStream(filePath).pipe(createGunzip())
        : createReadStream(filePath);
      const meter = new PassThrough();
      let sqlBytes = 0;
      meter.on('data', (chunk: Buffer) => {
        sqlBytes += chunk.length;
      });

      const stderrChunks: Buffer[] = [];
      const child = spawn(
        'psql',
        [
          ...this.args(t),
          '--single-transaction',
          '-v',
          'ON_ERROR_STOP=1',
          '-q',
        ],
        { env: this.childEnv(t) },
      );
      child.stderr.on('data', (c: Buffer) => stderrChunks.push(c));

      let timedOut = false;
      timeout = setTimeout(() => {
        timedOut = true;
        source.destroy();
        child.stdin.destroy();
        child.kill('SIGKILL');
      }, timeoutMs);

      const waitForClose = new Promise<void>((resolve, reject) => {
        child.on('error', reject);
        child.on('close', (code) =>
          code === 0
            ? resolve()
            : reject(
                new Error(
                  `psql keluar dengan kode ${code}: ${Buffer.concat(stderrChunks)
                    .toString()
                    .slice(-2000)}`,
                ),
              ),
        );
      });

      try {
        // allSettled dipakai supaya error asli psql tidak tertutup error pipe
        // (mis. EPIPE/premature close yang hanya akibat psql berhenti duluan).
        const [pipeResult, psqlResult] = await Promise.allSettled([
          pipeline(
            source,
            new StripUnsupportedLinesStream(),
            meter,
            child.stdin,
          ),
          waitForClose,
        ]);
        if (timedOut) {
          throw new Error(
            `Restore melebihi batas ${Math.round(timeoutMs / 60000)} menit — kemungkinan menunggu lock database. Transaksi dibatalkan otomatis; coba lagi saat aplikasi tidak sibuk.`,
          );
        }
        if (psqlResult.status === 'rejected') throw psqlResult.reason;
        if (pipeResult.status === 'rejected') throw pipeResult.reason;
        if (sqlBytes === 0) {
          throw new Error(
            'File backup tidak berisi perintah SQL — database tidak diubah.',
          );
        }
        this.logger.log('Restore database selesai (transaksi tunggal).');
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.error(`Restore database gagal: ${msg}`);
        throw new BadRequestException(
          `Restore gagal — database tidak berubah (rollback otomatis). Detail: ${msg.slice(-500)}`,
        );
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    } finally {
      this.restoreInProgress = false;
      await unlink(filePath).catch(() => undefined);
    }
  }

  /**
   * Ringkasan pemakaian storage untuk panel "Cadangan & Pemulihan":
   * ukuran DB, total bytes media (kolom data, per kategori), dan file di disk
   * (uploads/media aset lama + uploads/payment-proofs).
   */
  async storageStats() {
    const dbRows = await this.prisma.$queryRaw<{ size: bigint }[]>`
      SELECT pg_database_size(current_database()) AS size`;
    const groups = await this.prisma.mediaAsset.groupBy({
      by: ['category'],
      _count: { _all: true },
      _sum: { size: true },
    });
    const dirBytes = async (dir: string) => {
      try {
        const names = await readdir(dir);
        let bytes = 0;
        let count = 0;
        for (const name of names) {
          try {
            const st = await stat(join(dir, name));
            if (st.isFile()) {
              bytes += st.size;
              count++;
            }
          } catch {
            // abaikan file yang hilang di tengah iterasi
          }
        }
        return { count, bytes };
      } catch {
        return { count: 0, bytes: 0 };
      }
    };
    const uploadsRoot = join(process.cwd(), 'uploads');
    const [mediaDisk, proofDisk] = await Promise.all([
      dirBytes(join(uploadsRoot, 'media')),
      dirBytes(join(uploadsRoot, 'payment-proofs')),
    ]);
    return {
      databaseBytes: Number(dbRows[0]?.size ?? 0),
      mediaByCategory: groups.map((g) => ({
        category: g.category,
        count: g._count._all,
        bytes: g._sum.size ?? 0,
      })),
      mediaDbBytes: groups.reduce((a, g) => a + (g._sum.size ?? 0), 0),
      mediaDisk,
      proofDisk,
    };
  }
}
