import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermissions } from '../rbac/permissions.decorator';
import { PERMISSION_CODES } from '../rbac/permissions.constants';
import { MediaService } from './media.service';

/**
 * Pustaka media (akademik / keuangan / branding).
 * - upload/list/delete: wajib login + salah satu permission media — service
 *   menegakkan kategori mana yang boleh dikelola actor.
 * - GET /:id/file: PUBLIK (tanpa guard) — id UUID tidak bisa ditebak, dan file
 *   harus bisa dirender <img> untuk semua role termasuk siswa saat mengerjakan
 *   soal bergambar.
 */
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequireAnyPermissions(
    PERMISSION_CODES.MEDIA_MANAGE,
    PERMISSION_CODES.MEDIA_FINANCE_MANAGE,
    PERMISSION_CODES.SETTINGS_MANAGE,
  )
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  upload(
    @UploadedFile()
    file:
      | {
          buffer: Buffer;
          mimetype: string;
          originalname: string;
          size: number;
        }
      | undefined,
    @CurrentUser() actor: AuthenticatedUser,
    @Body('category') category?: string,
  ) {
    return this.media.upload(file, actor, category);
  }

  @Get()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequireAnyPermissions(
    PERMISSION_CODES.MEDIA_MANAGE,
    PERMISSION_CODES.MEDIA_FINANCE_MANAGE,
    PERMISSION_CODES.SETTINGS_MANAGE,
  )
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('search') search?: string,
    @Query('kind') kind?: 'image' | 'pdf',
    @Query('category') category?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('ext') ext?: string,
    @Query('uploader') uploader?: string,
  ) {
    return this.media.list(actor, search, kind, category, {
      from,
      to,
      ext,
      uploader,
    });
  }

  /** Opsi pengupload untuk filter "asal file" di pustaka media. */
  @Get('uploaders')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequireAnyPermissions(
    PERMISSION_CODES.MEDIA_MANAGE,
    PERMISSION_CODES.MEDIA_FINANCE_MANAGE,
    PERMISSION_CODES.SETTINGS_MANAGE,
  )
  uploaders(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('category') category?: string,
  ) {
    return this.media.listUploaders(actor, category);
  }

  @Get(':id/file')
  async file(@Param('id') id: string, @Res() res: Response) {
    const file = await this.media.getFile(id);
    // Aset publik ini di-embed <img> dari origin web (localhost:3001) —
    // longgarkan CORP hanya untuk endpoint file media, bukan seluruh API.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', file.disposition);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    file.stream().pipe(res);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequireAnyPermissions(
    PERMISSION_CODES.MEDIA_MANAGE,
    PERMISSION_CODES.MEDIA_FINANCE_MANAGE,
    PERMISSION_CODES.SETTINGS_MANAGE,
  )
  remove(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.media.remove(actor, id);
  }
}
