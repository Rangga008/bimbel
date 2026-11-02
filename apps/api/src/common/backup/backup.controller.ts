import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { unlink } from 'fs/promises';
import { createGzip } from 'zlib';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../../modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../modules/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../modules/auth/types/authenticated-user.type';
import { PermissionsGuard } from '../../modules/rbac/permissions.guard';
import { RequirePermissions } from '../../modules/rbac/permissions.decorator';
import { PERMISSION_CODES } from '../../modules/rbac/permissions.constants';
import { AuditService } from '../audit/audit.service';
import { BackupService } from './backup.service';

const MAX_BACKUP_BYTES = 512 * 1024 * 1024; // 512MB

/**
 * Backup & restore database dari halaman Pengaturan.
 * GET  /backup/export → unduh dump SQL ter-gzip (streaming, tanpa file temp).
 * POST /backup/import → unggah .sql / .sql.gz → restore atomik via psql.
 * Keduanya wajib permission backup.manage (owner + admin).
 */
@Controller('backup')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BackupController {
  constructor(
    private readonly backup: BackupService,
    private readonly audit: AuditService,
  ) {}

  @Get('export')
  @RequirePermissions(PERMISSION_CODES.BACKUP_MANAGE)
  async export(@CurrentUser() actor: AuthenticatedUser, @Res() res: Response) {
    const iso = new Date().toISOString(); // 2026-07-29T12:34:56.789Z
    const stamp = `${iso.slice(0, 10).replace(/-/g, '')}-${iso
      .slice(11, 16)
      .replace(':', '')}`;
    const filename = `bimbel-backup-${stamp}.sql.gz`;

    const child = this.backup.spawnExport();
    const stderrChunks: Buffer[] = [];
    child.stderr.on('data', (c: Buffer) => stderrChunks.push(c));

    // Client menutup koneksi lebih dulu → hentikan proses pg_dump.
    res.on('close', () => {
      if (!child.killed) child.kill();
    });

    try {
      // Jangan langsung pipe ke response: kalau pg_dump gagal sebelum output,
      // gzip hanya mengirim header ~20B dengan status 200 dan browser menyimpan
      // file kosong. Tunggu chunk pertama; error awal bisa dibalas JSON 500.
      const firstChunk = await new Promise<Buffer | null>(
        (resolve, reject) => {
          const cleanup = () => {
            child.stdout.off('readable', onReadable);
            child.off('close', onClose);
            child.off('error', onError);
          };
          const onReadable = () => {
            const chunk = child.stdout.read() as Buffer | null;
            cleanup();
            resolve(chunk);
          };
          const onClose = (code: number | null) => {
            cleanup();
            if (code === 0) resolve(null);
            else {
              const detail = Buffer.concat(stderrChunks)
                .toString()
                .slice(-1000);
              reject(
                new Error(
                  `pg_dump gagal (kode ${code})${detail ? `: ${detail}` : ''}`,
                ),
              );
            }
          };
          const onError = (e: Error) => {
            cleanup();
            reject(e);
          };
          child.stdout.once('readable', onReadable);
          child.once('close', onClose);
          child.once('error', onError);
        },
      );
      if (!firstChunk?.length) {
        throw new Error('pg_dump tidak menghasilkan data SQL.');
      }

      res.setHeader('Content-Type', 'application/gzip');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      // Dump database berisi seluruh data aplikasi — jangan pernah dicache proxy/browser.
      res.setHeader('Cache-Control', 'no-store');

      const gzip = createGzip({ level: 6 });
      // Kembalikan chunk pertama ke antrean lalu stream sisanya — tidak ada
      // byte SQL yang hilang.
      child.stdout.unshift(firstChunk);
      child.stdout.pipe(gzip).pipe(res);

      await this.audit
        .log({
          actorId: actor.id,
          action: 'backup.export',
          entity: 'database',
          entityId: filename,
        })
        .catch(() => undefined);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!child.killed) child.kill();
      if (!res.headersSent && !res.destroyed) {
        res.status(500).json({ message: `Export backup gagal: ${msg}` });
      } else if (res.writable) {
        res.destroy(e instanceof Error ? e : new Error(msg));
      }
    }
  }

  /** Ringkasan pemakaian storage (DB + media + bukti) untuk panel Pengaturan. */
  @Get('storage')
  @RequirePermissions(PERMISSION_CODES.BACKUP_MANAGE)
  storage() {
    return this.backup.storageStats();
  }

  @Post('import')
  @RequirePermissions(PERMISSION_CODES.BACKUP_MANAGE)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: tmpdir(),
        filename: (
          _req: unknown,
          _file: unknown,
          cb: (err: Error | null, filename: string) => void,
        ) => cb(null, `bimbel-restore-${randomUUID()}.sql`),
      }),
      limits: { fileSize: MAX_BACKUP_BYTES },
    }),
  )
  async import(
    @UploadedFile()
    file: { path: string; originalname: string; size: number } | undefined,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    if (!file) throw new BadRequestException('File backup wajib diunggah.');
    const name = file.originalname.toLowerCase();
    if (!name.endsWith('.sql') && !name.endsWith('.sql.gz')) {
      await unlink(file.path).catch(() => undefined);
      throw new BadRequestException(
        'Format file tidak dikenal — gunakan file .sql atau .sql.gz hasil export.',
      );
    }
    if (file.size === 0) {
      await unlink(file.path).catch(() => undefined);
      throw new BadRequestException(
        'File backup kosong — unggah file hasil export yang berisi data.',
      );
    }
    // Restore DB besar bisa lebih lama dari request timeout default server.
    req.setTimeout(11 * 60 * 1000);
    await this.backup.importDump(file.path, name.endsWith('.gz'));
    await this.audit
      .log({
        actorId: actor.id,
        action: 'backup.import',
        entity: 'database',
        entityId: file.originalname,
        newData: { sizeBytes: file.size },
      })
      .catch(() => undefined);
    return {
      ok: true,
      message:
        'Restore selesai. Semua sesi login lama mungkin sudah tidak berlaku — silakan login ulang.',
      restoredBy: actor.email,
      restoredAt: new Date().toISOString(),
    };
  }
}
