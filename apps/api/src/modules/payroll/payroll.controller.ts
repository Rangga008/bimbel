import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { PERMISSION_CODES } from '../rbac/permissions.constants';
import { AuditService } from '../../common/audit/audit.service';
import { PayrollService } from './payroll.service';
import {
  CreateAdjustmentDto,
  CreateManualWorkItemDto,
  CreateTutorRateDto,
  GeneratePayrollRunsDto,
  GenerateWorkItemsDto,
  PayPayrollRunDto,
  RepriceWorkItemsDto,
  UpdateTutorRateDto,
  UpdateWorkItemDto,
} from './dto/payroll.dto';

function ctx(req: Request) {
  return { ipAddress: req.ip, userAgent: req.headers['user-agent'] };
}

/**
 * Fase 5a — Payroll tutor. Admin Finance/Owner kelola tarif, work items,
 * payroll run, adjustment & pembayaran. Tutor melihat honornya sendiri
 * via /payroll/me (permission payroll.view_own).
 */
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PayrollController {
  constructor(
    private readonly payroll: PayrollService,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------------ rates

  @Get('tutor-rates')
  @RequirePermissions(PERMISSION_CODES.PAYROLL_VIEW)
  listRates(@Query('tutorId') tutorId?: string) {
    return this.payroll.listRates(tutorId);
  }

  @Post('tutor-rates')
  @RequirePermissions(PERMISSION_CODES.PAYROLL_MANAGE)
  async createRate(
    @Body() dto: CreateTutorRateDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const created = await this.payroll.createRate(dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'TUTOR_RATE_CREATED',
      entity: 'TutorRate',
      entityId: created.id,
      newData: {
        tutorId: dto.tutorId,
        workType: dto.workType,
        amount: dto.amount,
      },
      ...ctx(req),
    });
    return created;
  }

  @Patch('tutor-rates/:id')
  @RequirePermissions(PERMISSION_CODES.PAYROLL_MANAGE)
  async updateRate(
    @Param('id') id: string,
    @Body() dto: UpdateTutorRateDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const updated = await this.payroll.updateRate(id, dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'TUTOR_RATE_UPDATED',
      entity: 'TutorRate',
      entityId: id,
      newData: dto,
      ...ctx(req),
    });
    return updated;
  }

  // ------------------------------------------------------------- work items

  @Get('payroll/work-items')
  @RequirePermissions(PERMISSION_CODES.PAYROLL_VIEW)
  listWorkItems(
    @Query('period') period?: string,
    @Query('tutorId') tutorId?: string,
  ) {
    return this.payroll.listWorkItems({ period, tutorId });
  }

  /** Tarik work items dari sesi COMPLETED — sumber data operasional, bukan input manual. */
  @Post('payroll/work-items/generate')
  @RequirePermissions(PERMISSION_CODES.PAYROLL_MANAGE)
  async generateWorkItems(
    @Body() dto: GenerateWorkItemsDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const result = await this.payroll.generateWorkItems(
      actor.id,
      dto.period,
      dto.tutorId,
    );
    await this.audit.log({
      actorId: actor.id,
      action: 'PAYROLL_WORK_ITEMS_GENERATED',
      entity: 'TutorWorkItem',
      entityId: dto.period,
      newData: result,
      ...ctx(req),
    });
    return result;
  }

  /** Reprice item periode tsb setelah tarif dibuat/diubah (item PAID tidak disentuh). */
  @Post('payroll/work-items/reprice')
  @RequirePermissions(PERMISSION_CODES.PAYROLL_MANAGE)
  async repriceWorkItems(
    @Body() dto: RepriceWorkItemsDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const result = await this.payroll.repriceWorkItems(dto.period, dto.tutorId);
    await this.audit.log({
      actorId: actor.id,
      action: 'PAYROLL_WORK_ITEMS_REPRICED',
      entity: 'TutorWorkItem',
      entityId: dto.period,
      newData: result,
      ...ctx(req),
    });
    return result;
  }

  /** Input manual — hanya untuk tugas khusus (SPECIAL_TASK) tanpa sesi sumber. */
  @Post('payroll/work-items')
  @RequirePermissions(PERMISSION_CODES.PAYROLL_MANAGE)
  async createWorkItem(
    @Body() dto: CreateManualWorkItemDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const created = await this.payroll.createManualWorkItem(actor.id, dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'PAYROLL_WORK_ITEM_CREATED',
      entity: 'TutorWorkItem',
      entityId: created.id,
      newData: {
        tutorId: dto.tutorId,
        description: dto.description,
        amount: created.amount,
      },
      ...ctx(req),
    });
    return created;
  }

  @Patch('payroll/work-items/:id')
  @RequirePermissions(PERMISSION_CODES.PAYROLL_MANAGE)
  async updateWorkItem(
    @Param('id') id: string,
    @Body() dto: UpdateWorkItemDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const updated = await this.payroll.updateWorkItem(id, dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'PAYROLL_WORK_ITEM_UPDATED',
      entity: 'TutorWorkItem',
      entityId: id,
      newData: dto,
      ...ctx(req),
    });
    return updated;
  }

  @Delete('payroll/work-items/:id')
  @RequirePermissions(PERMISSION_CODES.PAYROLL_MANAGE)
  async deleteWorkItem(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const deleted = await this.payroll.deleteWorkItem(id);
    await this.audit.log({
      actorId: actor.id,
      action: 'PAYROLL_WORK_ITEM_DELETED',
      entity: 'TutorWorkItem',
      entityId: id,
      oldData: {
        description: deleted.description,
        amount: deleted.amount,
        sessionId: deleted.sessionId,
      },
      ...ctx(req),
    });
    return { success: true };
  }

  // ------------------------------------------------------------ payroll run

  @Get('payroll/runs')
  @RequirePermissions(PERMISSION_CODES.PAYROLL_VIEW)
  listRuns(@Query('period') period?: string, @Query('status') status?: string) {
    return this.payroll.listRuns({ period, status });
  }

  @Get('payroll/runs/:id')
  @RequirePermissions(PERMISSION_CODES.PAYROLL_VIEW)
  getRun(@Param('id') id: string) {
    return this.payroll.getRun(id);
  }

  /** Buat/hitung ulang payroll per periode dari work items yang sudah ditarik. */
  @Post('payroll/runs/generate')
  @RequirePermissions(PERMISSION_CODES.PAYROLL_MANAGE)
  async generateRuns(
    @Body() dto: GeneratePayrollRunsDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const result = await this.payroll.generateRuns(
      actor.id,
      dto.period,
      dto.tutorId,
    );
    await this.audit.log({
      actorId: actor.id,
      action: 'PAYROLL_RUNS_GENERATED',
      entity: 'PayrollRun',
      entityId: dto.period,
      newData: result,
      ...ctx(req),
    });
    return result;
  }

  @Post('payroll/runs/:id/adjustments')
  @RequirePermissions(PERMISSION_CODES.PAYROLL_MANAGE)
  async addAdjustment(
    @Param('id') id: string,
    @Body() dto: CreateAdjustmentDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const updated = await this.payroll.addAdjustment(id, actor.id, dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'PAYROLL_ADJUSTMENT_CREATED',
      entity: 'PayrollRun',
      entityId: id,
      newData: {
        amount: dto.amount,
        reason: dto.reason,
        netAmount: updated.netAmount,
      },
      ...ctx(req),
    });
    return updated;
  }

  @Delete('payroll/runs/:id/adjustments/:adjustmentId')
  @RequirePermissions(PERMISSION_CODES.PAYROLL_MANAGE)
  async removeAdjustment(
    @Param('id') id: string,
    @Param('adjustmentId') adjustmentId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const { deleted } = await this.payroll.removeAdjustment(id, adjustmentId);
    await this.audit.log({
      actorId: actor.id,
      action: 'PAYROLL_ADJUSTMENT_DELETED',
      entity: 'PayrollRun',
      entityId: id,
      oldData: { amount: deleted.amount, reason: deleted.reason },
      ...ctx(req),
    });
    return { success: true };
  }

  /** Tandai payroll dibayar — transaction: PAID + expense HONOR_PEGAWAI + ledger OUT. */
  @Post('payroll/runs/:id/pay')
  @RequirePermissions(PERMISSION_CODES.PAYROLL_MANAGE)
  async payRun(
    @Param('id') id: string,
    @Body() dto: PayPayrollRunDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const paid = await this.payroll.pay(id, actor.id, dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'PAYROLL_PAID',
      entity: 'PayrollRun',
      entityId: id,
      newData: {
        number: paid.number,
        netAmount: paid.netAmount,
        accountId: dto.accountId,
      },
      ...ctx(req),
    });
    return paid;
  }

  // ------------------------------------------------------------- tutor self

  /** Profil & rincian honor tutor yang sedang login. */
  @Get('payroll/me')
  @RequirePermissions(PERMISSION_CODES.PAYROLL_VIEW_OWN)
  myPayroll(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('period') period?: string,
  ) {
    return this.payroll.myPayroll(actor.id, period);
  }
}
