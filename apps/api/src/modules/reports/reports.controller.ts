// Fase 6 — Controller laporan lanjutan lintas modul + snapshot arsip.
// Route statis (snapshots/kinds/company-info) didaftarkan SEBELUM ':kind'
// supaya tidak tertangkap sebagai nilai param.
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Header,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { PERMISSION_CODES } from '../rbac/permissions.constants';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { AuditService } from '../../common/audit/audit.service';
import { ReportsService } from './reports.service';
import {
  REPORT_KIND_META,
  ReportFilters,
  reportDomainsForRoles,
} from './report-helpers';
import type { ReportKind } from './report-helpers';

function ctx(req: Request) {
  return { ipAddress: req.ip, userAgent: req.headers['user-agent'] };
}

/**
 * Pastikan domain laporan `kind` masih dalam cakupan role user
 * (finance→Keuangan, academic→Operasional+Akademik, owner→semua).
 */
function assertReportDomain(kind: string, roles: string[]) {
  const meta = REPORT_KIND_META[kind as ReportKind];
  if (!meta) return; // kind tak dikenal — biarkan service yang menolak
  const domains = reportDomainsForRoles(roles);
  if (domains && !domains.includes(meta.domain)) {
    throw new ForbiddenException(
      `Laporan domain ${meta.domain} di luar cakupan role Anda.`,
    );
  }
}

function filtersFromQuery(
  q: Record<string, string | undefined>,
): ReportFilters {
  return {
    period: q.period,
    from: q.from,
    to: q.to,
    groupId: q.groupId,
    programId: q.programId,
    levelId: q.levelId,
    tutorId: q.tutorId,
    studentId: q.studentId,
    status: q.status,
    channel: q.channel,
    search: q.search,
  };
}

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly audit: AuditService,
  ) {}

  /** Daftar jenis laporan dalam cakupan role user (untuk tab di UI). */
  @Get('reports/kinds')
  @RequirePermissions(PERMISSION_CODES.REPORT_EXPORT)
  kinds(@CurrentUser() actor: AuthenticatedUser) {
    const domains = reportDomainsForRoles(actor.roles);
    return Object.entries(REPORT_KIND_META)
      .filter(([, meta]) => !domains || domains.includes(meta.domain))
      .map(([kind, meta]) => ({ kind, ...meta }));
  }

  @Get('reports/company-info')
  @RequirePermissions(PERMISSION_CODES.REPORT_EXPORT)
  companyInfo() {
    return this.reports.getCompanyInfo();
  }

  /** Identitas bimbel untuk header kwitansi/cetak — cukup login (semua role). */
  @Get('company-info')
  companyInfoPublic() {
    return this.reports.getCompanyInfo();
  }

  // ---- Snapshot arsip (data beku) ----

  @Get('reports/snapshots')
  @RequirePermissions(PERMISSION_CODES.REPORT_EXPORT)
  listSnapshots(
    @Query('kind') kind?: string,
    @Query('period') period?: string,
  ) {
    return this.reports.listSnapshots({ kind, period });
  }

  @Post('reports/snapshots')
  @RequirePermissions(PERMISSION_CODES.REPORT_EXPORT)
  async createSnapshot(
    @Body()
    body: {
      kind?: string;
      title?: string;
      period?: string;
      from?: string;
      to?: string;
      groupId?: string;
      tutorId?: string;
      studentId?: string;
      status?: string;
      channel?: string;
      search?: string;
    },
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    if (!body?.kind) throw new BadRequestException('kind wajib diisi.');
    assertReportDomain(body.kind, actor.roles);
    const snap = await this.reports.createSnapshot(
      body.kind,
      filtersFromQuery(body),
      actor.id,
      body.title,
    );
    await this.audit.log({
      actorId: actor.id,
      action: 'REPORT_SNAPSHOT_CREATED',
      entity: 'ReportSnapshot',
      entityId: snap.id,
      newData: {
        kind: snap.reportKind,
        period: snap.period,
        title: snap.title,
      },
      ...ctx(req),
    });
    return snap;
  }

  @Get('reports/snapshots/:id')
  @RequirePermissions(PERMISSION_CODES.REPORT_EXPORT)
  getSnapshot(@Param('id') id: string) {
    return this.reports.getSnapshot(id);
  }

  @Delete('reports/snapshots/:id')
  @RequirePermissions(PERMISSION_CODES.REPORT_EXPORT)
  async deleteSnapshot(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const snap = await this.reports.deleteSnapshot(id);
    await this.audit.log({
      actorId: actor.id,
      action: 'REPORT_SNAPSHOT_DELETED',
      entity: 'ReportSnapshot',
      entityId: id,
      oldData: {
        kind: snap.reportKind,
        period: snap.period,
        title: snap.title,
      },
      ...ctx(req),
    });
    return { success: true };
  }

  // ---- Laporan dinamis ----

  /** JSON dokumen laporan (header + rows + summary). */
  @Get('reports/:kind')
  @RequirePermissions(PERMISSION_CODES.REPORT_EXPORT)
  report(
    @Param('kind') kind: string,
    @Query() query: Record<string, string>,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    assertReportDomain(kind, actor.roles);
    return this.reports.build(kind, filtersFromQuery(query));
  }

  /** Export CSV (dibuka Excel). Dataset kosong tetap menghasilkan file valid. */
  @Get('reports/:kind/export.csv')
  @RequirePermissions(PERMISSION_CODES.REPORT_EXPORT)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportCsv(
    @Param('kind') kind: string,
    @Query() query: Record<string, string>,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    assertReportDomain(kind, actor.roles);
    const doc = await this.reports.build(kind, filtersFromQuery(query));
    // BOM UTF-8 supaya Excel membaca karakter Indonesia dengan benar.
    return `\ufeff${this.reports.renderExcelCsv(doc)}`;
  }

  /** Export Excel nyata (.xlsx) — kolom terpisah, bukan CSV ber-delimiter. */
  @Get('reports/:kind/export.xlsx')
  @RequirePermissions(PERMISSION_CODES.REPORT_EXPORT)
  async exportXlsx(
    @Param('kind') kind: string,
    @Query() query: Record<string, string>,
    @CurrentUser() actor: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    assertReportDomain(kind, actor.roles);
    const doc = await this.reports.build(kind, filtersFromQuery(query));
    const out = await this.reports.renderXlsx(doc);
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${out.filename}"`,
    });
    res.send(out.buffer);
  }

  /** Export "PDF": HTML siap-print (frontend buka di tab baru → print/save PDF). */
  @Get('reports/:kind/export.pdf')
  @RequirePermissions(PERMISSION_CODES.REPORT_EXPORT)
  @Header('Content-Type', 'text/html; charset=utf-8')
  async exportPdf(
    @Param('kind') kind: string,
    @Query() query: Record<string, string>,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    assertReportDomain(kind, actor.roles);
    const doc = await this.reports.build(kind, filtersFromQuery(query));
    return this.reports.renderPdfHtml(doc);
  }
}
