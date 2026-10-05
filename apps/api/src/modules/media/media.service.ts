import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PERMISSION_CODES } from '../rbac/permissions.constants';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';

/**
 * Pustaka media terbagi per kategori:
 * - ACADEMIC (default): gambar/PDF untuk soal & materi — media.manage.
 * - FINANCE: kwitansi & bukti keuangan — media.finance.manage.
 * - BRANDING: logo/identitas aplikasi — settings.manage (atau media.manage).
 * - PROFILE: foto profil user — diupload lewat endpoint profil mandiri
 *   (bukan pustaka), jadi sengaja tidak masuk MEDIA_CATEGORIES/permission
 *   manapun — tidak muncul di pustaka dan tidak bisa diupload via /media.
 * OWNER boleh semua kategori pustaka (ACADEMIC/FINANCE/BRANDING). File disajikan publik via GET /media/:id/file
 * (id UUID tak bisa ditebak) supaya <img> soal tetap render untuk siswa.
 * Mengikuti pola penyimpanan proof pembayaran: buffer memori -> disk lokal
 * <cwd>/uploads/media (volume api-uploads di docker-compose).
 */
export type MediaCategory = 'ACADEMIC' | 'FINANCE' | 'BRANDING' | 'PROFILE';
const MEDIA_CATEGORIES: MediaCategory[] = ['ACADEMIC', 'FINANCE', 'BRANDING'];

@Injectable()
export class MediaService {
  private readonly mediaDir = join(process.cwd(), 'uploads', 'media');

  static readonly ALLOWED_MIME_EXT: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'image/svg+xml': '.svg',
    'application/pdf': '.pdf',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      '.docx',
  };

  /** Batas ukuran per kelompok tipe — dokumen materi boleh lebih besar dari gambar. */
  private static readonly MAX_SIZE: Record<string, number> = {
    'application/pdf': 10 * 1024 * 1024,
    'application/msword': 10 * 1024 * 1024,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      10 * 1024 * 1024,
  };

  /** MIME yang dianggap "dokumen" (kind=pdf) — PDF + Word. */
  private static readonly DOC_MIMES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];
  private static readonly DEFAULT_MAX_SIZE = 2 * 1024 * 1024;

  private toDto(asset: {
    id: string;
    originalName: string;
    mime: string;
    size: number;
    category: string;
    createdAt: Date;
    uploadedById: string | null;
    uploadedBy?: { name: string } | null;
  }) {
    return {
      id: asset.id,
      name: asset.originalName,
      mime: asset.mime,
      size: asset.size,
      category: asset.category,
      // Path relatif API — frontend mem-prefix origin API saat merender <img>.
      url: `/api/media/${asset.id}/file`,
      uploadedBy: asset.uploadedBy?.name ?? null,
      createdAt: asset.createdAt,
    };
  }

  /** Kategori yang boleh dikelola actor berdasar permission-nya. */
  private allowedCategories(actor: AuthenticatedUser): MediaCategory[] {
    if (actor.roles.includes('OWNER')) return [...MEDIA_CATEGORIES];
    const allowed: MediaCategory[] = [];
    if (actor.permissions.includes(PERMISSION_CODES.MEDIA_MANAGE))
      allowed.push('ACADEMIC', 'BRANDING');
    if (actor.permissions.includes(PERMISSION_CODES.MEDIA_FINANCE_MANAGE))
      allowed.push('FINANCE');
    if (
      actor.permissions.includes(PERMISSION_CODES.SETTINGS_MANAGE) &&
      !allowed.includes('BRANDING')
    )
      allowed.push('BRANDING');
    return allowed;
  }

  private assertCategoryAllowed(
    actor: AuthenticatedUser,
    category: MediaCategory,
  ) {
    if (!this.allowedCategories(actor).includes(category)) {
      throw new ForbiddenException(
        category === 'FINANCE'
          ? 'Pustaka keuangan hanya untuk admin finance/owner.'
          : 'Anda tidak punya akses ke kategori media ini.',
      );
    }
  }

  private parseCategory(raw?: string): MediaCategory | undefined {
    if (!raw) return undefined;
    const c = raw.trim().toUpperCase() as MediaCategory;
    if (!MEDIA_CATEGORIES.includes(c)) {
      throw new BadRequestException('Kategori media tidak dikenal.');
    }
    return c;
  }

  async upload(
    file:
      | {
          buffer: Buffer;
          mimetype: string;
          originalname: string;
          size: number;
        }
      | undefined,
    actor: AuthenticatedUser,
    categoryRaw?: string,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('File kosong atau tidak terbaca.');
    }
    const category = this.parseCategory(categoryRaw) ?? 'ACADEMIC';
    this.assertCategoryAllowed(actor, category);
    const ext = MediaService.ALLOWED_MIME_EXT[file.mimetype];
    if (!ext) {
      throw new BadRequestException(
        'Format file harus JPG, PNG, WebP, GIF, SVG, atau PDF.',
      );
    }
    const maxSize =
      MediaService.MAX_SIZE[file.mimetype] ?? MediaService.DEFAULT_MAX_SIZE;
    if (file.size > maxSize) {
      throw new BadRequestException(
        `Ukuran file melebihi batas ${Math.round(maxSize / 1024 / 1024)}MB.`,
      );
    }
    return this.saveBuffer(file.buffer, {
      mime: file.mimetype,
      originalName: file.originalname,
      uploadedById: actor.id,
      maxSize,
      category,
    });
  }

  /**
   * Simpan buffer sebagai aset media (dipakai juga untuk file hasil generate
   * server seperti PDF kwitansi). Mengembalikan DTO sama seperti upload().
   */
  async saveBuffer(
    buffer: Buffer,
    opts: {
      mime: string;
      originalName?: string;
      uploadedById?: string | null;
      maxSize?: number;
      category?: MediaCategory;
    },
  ) {
    if (!buffer.length) {
      throw new BadRequestException('File kosong atau tidak terbaca.');
    }
    const ext = MediaService.ALLOWED_MIME_EXT[opts.mime];
    if (!ext) {
      throw new BadRequestException(
        'Format file harus JPG, PNG, WebP, GIF, SVG, atau PDF.',
      );
    }
    const maxSize =
      opts.maxSize ?? MediaService.MAX_SIZE[opts.mime] ?? MediaService.DEFAULT_MAX_SIZE;
    if (buffer.length > maxSize) {
      throw new BadRequestException(
        `Ukuran file melebihi batas ${Math.round(maxSize / 1024 / 1024)}MB.`,
      );
    }
    await mkdir(this.mediaDir, { recursive: true });
    const filename = `${randomUUID()}${ext}`;
    await writeFile(join(this.mediaDir, filename), buffer);
    const asset = await this.prisma.mediaAsset.create({
      data: {
        filename,
        // Nama asli bisa mengandung karakter aneh — pangkas wajar saja.
        originalName: opts.originalName?.slice(0, 200) || filename,
        mime: opts.mime,
        size: buffer.length,
        category: opts.category ?? 'ACADEMIC',
        uploadedById: opts.uploadedById ?? null,
      },
    });
    return this.toDto(asset);
  }

  /** Ekstensi → daftar MIME untuk filter "tipe file" yang presisi. */
  private static readonly EXT_MIMES: Record<string, string[]> = {
    jpg: ['image/jpeg'],
    jpeg: ['image/jpeg'],
    png: ['image/png'],
    webp: ['image/webp'],
    gif: ['image/gif'],
    svg: ['image/svg+xml'],
    pdf: ['application/pdf'],
    doc: ['application/msword'],
    docx: [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
  };

  /**
   * List aset. `category` membatasi satu kategori (bila diizinkan); tanpa
   * category, kembalikan semua kategori yang boleh dikelola actor.
   * Filter tambahan: rentang tanggal upload (from/to), tipe file presisi
   * (ext: png/pdf/docx/dst.), dan asal/uploader (nama pengupload).
   */
  async list(
    actor: AuthenticatedUser,
    search?: string,
    kind?: 'image' | 'pdf',
    categoryRaw?: string,
    filters: { from?: string; to?: string; ext?: string; uploader?: string } = {},
  ) {
    const requested = this.parseCategory(categoryRaw);
    const allowed = this.allowedCategories(actor);
    const categories = requested
      ? (this.assertCategoryAllowed(actor, requested), [requested])
      : allowed;
    if (!categories.length) return [];

    // Tipe file: ext presisi (pdf/png/docx/…) lebih utama dari kind kasar.
    const ext = filters.ext?.trim().toLowerCase().replace(/^\./, '');
    let mimeFilter: Record<string, unknown> | undefined;
    if (ext) {
      const mimes = MediaService.EXT_MIMES[ext];
      if (!mimes) throw new BadRequestException('Tipe file tidak dikenal.');
      mimeFilter = { mime: { in: mimes } };
    } else if (kind === 'image') {
      mimeFilter = { mime: { startsWith: 'image/' } };
    } else if (kind === 'pdf') {
      mimeFilter = { mime: { in: MediaService.DOC_MIMES } };
    }

    // Rentang tanggal upload (inklusif sehari penuh untuk `to`).
    const from = filters.from ? new Date(filters.from) : undefined;
    const to = filters.to ? new Date(filters.to) : undefined;
    if (from && isNaN(from.getTime()))
      throw new BadRequestException('Tanggal "dari" tidak valid.');
    if (to && isNaN(to.getTime()))
      throw new BadRequestException('Tanggal "sampai" tidak valid.');
    if (to) to.setHours(23, 59, 59, 999);

    const assets = await this.prisma.mediaAsset.findMany({
      where: {
        category: { in: categories },
        ...(search
          ? { originalName: { contains: search, mode: 'insensitive' as const } }
          : {}),
        ...(mimeFilter ?? {}),
        ...(from || to
          ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
          : {}),
        ...(filters.uploader
          ? {
              uploadedBy: {
                name: { contains: filters.uploader, mode: 'insensitive' as const },
              },
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { uploadedBy: { select: { name: true } } },
    });
    return assets.map((a) => this.toDto(a));
  }

  /** Daftar nama pengupload (untuk opsi filter "asal"). */
  async listUploaders(actor: AuthenticatedUser, categoryRaw?: string) {
    const requested = this.parseCategory(categoryRaw);
    const allowed = this.allowedCategories(actor);
    const categories = requested
      ? (this.assertCategoryAllowed(actor, requested), [requested])
      : allowed;
    if (!categories.length) return [];
    const rows = await this.prisma.mediaAsset.findMany({
      where: { category: { in: categories }, uploadedById: { not: null } },
      select: { uploadedBy: { select: { name: true } } },
      distinct: ['uploadedById'],
    });
    return rows
      .map((r) => r.uploadedBy?.name)
      .filter((n): n is string => Boolean(n))
      .sort();
  }

  async remove(actor: AuthenticatedUser, id: string) {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException('Gambar tidak ditemukan.');
    this.assertCategoryAllowed(actor, asset.category as MediaCategory);
    await this.prisma.mediaAsset.delete({ where: { id } });
    await unlink(join(this.mediaDir, asset.filename)).catch(() => undefined);
    return { ok: true };
  }

  /** Hapus aset tanpa cek permission — untuk cleanup internal (mis. ganti foto profil). */
  async deleteAssetInternal(id: string) {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!asset) return;
    await this.prisma.mediaAsset.delete({ where: { id } });
    await unlink(join(this.mediaDir, asset.filename)).catch(() => undefined);
  }

  async getFile(id: string) {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException('Gambar tidak ditemukan.');
    return {
      path: join(this.mediaDir, asset.filename),
      contentType: asset.mime,
      // SVG disajikan inline bisa membawa script — paksa download agar aman.
      disposition: asset.mime === 'image/svg+xml' ? 'attachment' : 'inline',
      stream: () => createReadStream(join(this.mediaDir, asset.filename)),
    };
  }

  constructor(private readonly prisma: PrismaService) {}
}
