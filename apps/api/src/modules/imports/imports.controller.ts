// Endpoint import massal: GET /import/template/:entity -> CSV template,
// POST /import/:entity {csv} -> proses baris-per-baris (error dikumpulkan).
// Permission mengikuti entity: students->people.student.manage, dst.
import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { PERMISSION_CODES } from '../rbac/permissions.constants';
import { AuditService } from '../../common/audit/audit.service';
import { ImportsService } from './imports.service';

const PERMISSION_BY_ENTITY: Record<string, string> = {
  students: PERMISSION_CODES.PEOPLE_STUDENT_MANAGE,
  parents: PERMISSION_CODES.PEOPLE_PARENT_MANAGE,
  tutors: PERMISSION_CODES.PEOPLE_TUTOR_MANAGE,
};

@Controller('import')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ImportsController {
  constructor(
    private readonly imports: ImportsService,
    private readonly audit: AuditService,
  ) {}

  private permissionFor(entity: string) {
    const code = PERMISSION_BY_ENTITY[entity];
    if (!code) {
      throw new NotFoundException(`Entity import "${entity}" tidak dikenal.`);
    }
    return code;
  }

  @Get('template/:entity')
  @RequirePermissions(
    PERMISSION_CODES.PEOPLE_STUDENT_MANAGE,
    PERMISSION_CODES.PEOPLE_PARENT_MANAGE,
    PERMISSION_CODES.PEOPLE_TUTOR_MANAGE,
  )
  template(@Param('entity') entity: string, @Res() res: Response) {
    this.imports.assertEntity(entity);
    const t = this.imports.template(entity);
    const comment = (s: string) => `# ${s}`;
    // Baris "#" diabaikan parser — contoh & catatan aman ikut ter-upload.
    // Baris `sep=;` diabaikan parser import tapi dibaca Excel sebagai petunjuk
    // delimiter — template selalu terbuka sebagai kolom di semua locale.
    const csv = [
      'sep=;',
      comment(`TEMPLATE IMPORT ${entity.toUpperCase()} — hapus abaikan baris berawalan #`),
      comment(`Format: ${t.notes}`),
      t.header,
      ...t.samples.map(comment),
      '',
    ].join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="template-import-${entity}.csv"`,
    );
    res.send(`﻿${csv}`);
  }

  @Post(':entity')
  async run(
    @Param('entity') entity: string,
    @Body() body: { csv?: string },
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    // Permission dicek manual per-entity (dekorator statis tidak bisa
    // membaca param): role tanpa akses langsung 403 lewat guard manual.
    const required = this.permissionFor(entity);
    if (!actor.permissions.includes(required)) {
      throw new NotFoundException(
        `Anda tidak punya izin import untuk ${entity}.`,
      );
    }
    const result = await this.imports.run(entity, body?.csv);
    await this.audit.log({
      actorId: actor.id,
      action: 'BULK_IMPORT',
      entity: 'Import',
      entityId: entity,
      newData: {
        total: result.total,
        created: result.created,
        failed: result.failed,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return result;
  }
}
