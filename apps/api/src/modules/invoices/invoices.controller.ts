import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { PERMISSION_CODES } from '../rbac/permissions.constants';
import { AuditService } from '../../common/audit/audit.service';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { CreateInvoiceFromPackageDto, IssueInvoiceDto } from './dto/from-package.dto';

/** Fase 2a — CRUD Invoice (Admin Finance). Tanpa logic payment (itu 2b). */
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService, private readonly audit: AuditService) {}

  ctx(req: Request) {
    return { ipAddress: req.ip, userAgent: req.headers['user-agent'] };
  }

  @Get('invoices')
  @RequirePermissions(PERMISSION_CODES.INVOICE_VIEW)
  list(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('studentId') studentId?: string,
    @Query('programId') programId?: string,
    @Query('levelId') levelId?: string,
  ) {
    return this.invoices.list({ search, status, studentId, programId, levelId });
  }

  @Get('invoices/:id')
  @RequirePermissions(PERMISSION_CODES.INVOICE_VIEW)
  get(@Param('id') id: string) {
    return this.invoices.get(id);
  }

  @Post('invoices')
  @RequirePermissions(PERMISSION_CODES.INVOICE_MANAGE)
  async create(@Body() dto: CreateInvoiceDto, @CurrentUser() actor: AuthenticatedUser, @Req() req: Request) {
    const created = await this.invoices.create(dto);
    await this.audit.log({
      actorId: actor.id, action: 'INVOICE_CREATED', entity: 'Invoice', entityId: created.id,
      newData: { studentId: dto.studentId, packageId: dto.packageId ?? null, total: String(created.totalAmount) },
      ...this.ctx(req),
    });
    return created;
  }

  @Post('invoices/from-package')
  @RequirePermissions(PERMISSION_CODES.INVOICE_MANAGE)
  async fromPackage(@Body() dto: CreateInvoiceFromPackageDto, @CurrentUser() actor: AuthenticatedUser, @Req() req: Request) {
    const created = await this.invoices.createFromPackage(dto);
    await this.audit.log({
      actorId: actor.id, action: 'INVOICE_CREATED', entity: 'Invoice', entityId: created.id,
      newData: { studentId: dto.studentId, packageId: dto.packageId, total: String(created.totalAmount) },
      ...this.ctx(req),
    });
    return created;
  }

  @Patch('invoices/:id/issue')
  @RequirePermissions(PERMISSION_CODES.INVOICE_MANAGE)
  async issue(@Param('id') id: string, @Body() dto: IssueInvoiceDto, @CurrentUser() actor: AuthenticatedUser, @Req() req: Request) {
    const before = await this.invoices.get(id);
    const updated = await this.invoices.issue(id, dto);
    await this.audit.log({
      actorId: actor.id, action: 'INVOICE_ISSUED', entity: 'Invoice', entityId: id,
      oldData: { status: before.status }, newData: { status: 'ISSUED' }, ...this.ctx(req),
    });
    return updated;
  }

  @Patch('invoices/:id/void')
  @RequirePermissions(PERMISSION_CODES.INVOICE_MANAGE)
  async void(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser, @Req() req: Request) {
    const before = await this.invoices.get(id);
    const updated = await this.invoices.void(id);
    await this.audit.log({
      actorId: actor.id, action: 'INVOICE_VOIDED', entity: 'Invoice', entityId: id,
      oldData: { status: before.status }, newData: { status: 'VOID' }, ...this.ctx(req),
    });
    return updated;
  }

  @Get('financial-accounts')
  @RequirePermissions(PERMISSION_CODES.INVOICE_VIEW)
  accounts() {
    return this.invoices.listAccounts();
  }

  /** Fase 6 — kelola akun kas/bank dari halaman Pengaturan. */
  @Post('financial-accounts')
  @RequirePermissions(PERMISSION_CODES.SETTINGS_MANAGE)
  async createAccount(
    @Body() dto: { name: string; code?: string; type?: string },
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const created = await this.invoices.createAccount(dto);
    await this.audit.log({
      actorId: actor.id, action: 'FINANCIAL_ACCOUNT_CREATED', entity: 'FinancialAccount', entityId: created.id,
      newData: { name: created.name, code: created.code, type: created.type },
      ...this.ctx(req),
    });
    return created;
  }

  @Patch('financial-accounts/:id')
  @RequirePermissions(PERMISSION_CODES.SETTINGS_MANAGE)
  async updateAccount(
    @Param('id') id: string,
    @Body() dto: { name?: string; code?: string | null; type?: string; isActive?: boolean },
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const before = await this.invoices.listAccounts().then((rows) => rows.find((a) => a.id === id));
    const updated = await this.invoices.updateAccount(id, dto);
    await this.audit.log({
      actorId: actor.id, action: 'FINANCIAL_ACCOUNT_UPDATED', entity: 'FinancialAccount', entityId: id,
      oldData: before ? { name: before.name, code: before.code, type: before.type, isActive: before.isActive } : null,
      newData: { name: updated.name, code: updated.code, type: updated.type, isActive: updated.isActive },
      ...this.ctx(req),
    });
    return updated;
  }

  /** Hapus akun kas/bank — ditolak service bila masih punya transaksi. */
  @Delete('financial-accounts/:id')
  @RequirePermissions(PERMISSION_CODES.SETTINGS_MANAGE)
  async deleteAccount(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const before = await this.invoices
      .listAccounts()
      .then((rows) => rows.find((a) => a.id === id));
    await this.invoices.deleteAccount(id);
    await this.audit.log({
      actorId: actor.id, action: 'FINANCIAL_ACCOUNT_DELETED', entity: 'FinancialAccount', entityId: id,
      oldData: before ? { name: before.name, code: before.code, type: before.type } : null,
      ...this.ctx(req),
    });
    return { success: true };
  }
}
