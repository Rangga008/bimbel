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

    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    // Dump database berisi seluruh data aplikasi — jangan pernah dicache proxy/browser.
    res.setHeader('Cache-Control', 'no-store');

    const child = this.backup.spawnExport();
    const gzip = createGzip({ level: 6 });

    child.on('error', (e) => {
      if (!res.headersSent) {
        res
          .status(500)
          .json({ message: `pg_dump tidak tersedia di server: ${e.message}` });
      } else res.destroy(e);
    });
    // Client menutup koneksi lebih dulu → hentikan proses pg_dump.
    res.on('close', () => {
      if (!child.killed) child.kill();
    });
    child.on('close', (code) => {
      if (code !== 0) {
        const msg = `pg_dump gagal (kode ${code}) — backup dibatalkan.`;
        // Belum ada byte terkirim → masih bisa balas JSON 500.
        if (!res.headersSent) res.status(500).json({ message: msg });
        else if (res.writable) res.destroy(new Error(msg));
      }
    });

    child.stdout.pipe(gzip).pipe(res);

    await this.audit
      .log({
        actorId: actor.id,
        action: 'backup.export',
        entity: 'database',
        entityId: filename,
      })
      .catch(() => undefined);
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
