import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { createReadStream } from 'fs';
import { unlink } from 'fs/promises';
import { createGunzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

interface DbTarget {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
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
   * Restore file SQL (polos atau .gz) ke database secara atomik.
   * Melempar BadRequestException dengan ringkasan error psql bila gagal.
   */
  async importDump(filePath: string): Promise<void> {
    if (this.restoreInProgress) {
      throw new BadRequestException(
        'Restore lain sedang berjalan — tunggu sampai selesai.',
      );
    }
    this.restoreInProgress = true;
    const t = this.target();
    const head = Buffer.alloc(2);
    const fd = await (await import('fs/promises')).open(filePath, 'r');
    try {
      await fd.read(head, 0, 2, 0);
    } finally {
      await fd.close();
    }
    const gzip = head[0] === 0x1f && head[1] === 0x8b;
    const source: Readable = gzip
      ? createReadStream(filePath).pipe(createGunzip())
      : createReadStream(filePath);

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

    try {
      await Promise.all([
        pipeline(source, child.stdin),
        new Promise<void>((resolve, reject) => {
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
        }),
      ]);
      this.logger.log('Restore database selesai (transaksi tunggal).');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`Restore database gagal: ${msg}`);
      throw new BadRequestException(
        `Restore gagal — database tidak berubah (rollback otomatis). Detail: ${msg.slice(-500)}`,
      );
    } finally {
      this.restoreInProgress = false;
      await unlink(filePath).catch(() => undefined);
    }
  }
}
