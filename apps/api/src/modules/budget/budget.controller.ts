import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { PERMISSION_CODES } from '../rbac/permissions.constants';
import { AuditService } from '../../common/audit/audit.service';
import { BudgetService } from './budget.service';
import { CreateBudgetDto, UpdateBudgetDto } from './dto/budget.dto';

function ctx(req: Request) {
  return { ipAddress: req.ip, userAgent: req.headers['user-agent'] };
}

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BudgetController {
  constructor(
    private readonly budget: BudgetService,
    private readonly audit: AuditService,
  ) {}

  @Get('budgets')
  @RequirePermissions(PERMISSION_CODES.BUDGET_VIEW)
  list(
    @Query('period') period?: string,
    @Query('category') category?: string,
  ) {
    return this.budget.list({ period, category });
  }

  @Get('budgets/summary')
  @RequirePermissions(PERMISSION_CODES.BUDGET_VIEW)
  summary(@Query('period') period?: string) {
    return this.budget.getSummary(period);
  }

  @Get('budgets/vs-actual')
  @RequirePermissions(PERMISSION_CODES.BUDGET_VIEW)
  budgetVsActual(@Query('period') period: string) {
    return this.budget.getBudgetVsActual(period);
  }

  @Get('budgets/:id')
  @RequirePermissions(PERMISSION_CODES.BUDGET_VIEW)
  get(@Param('id') id: string) {
    return this.budget.get(id);
  }

  @Post('budgets')
  @RequirePermissions(PERMISSION_CODES.BUDGET_MANAGE)
  async create(
    @Body() dto: CreateBudgetDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const created = await this.budget.create(actor.id, dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'BUDGET_CREATED',
      entity: 'Budget',
      entityId: created.id,
      newData: { category: dto.category, period: dto.period, amount: dto.amount },
      ...ctx(req),
    });
    return created;
  }

  @Patch('budgets/:id')
  @RequirePermissions(PERMISSION_CODES.BUDGET_MANAGE)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateBudgetDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const before = await this.budget.get(id);
    const updated = await this.budget.update(id, dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'BUDGET_UPDATED',
      entity: 'Budget',
      entityId: id,
      oldData: { category: before.category, period: before.period, amount: before.amount },
      newData: { category: updated.category, period: updated.period, amount: updated.amount },
      ...ctx(req),
    });
    return updated;
  }

  @Delete('budgets/:id')
  @RequirePermissions(PERMISSION_CODES.BUDGET_MANAGE)
  async delete(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const before = await this.budget.get(id);
    await this.budget.delete(id);
    await this.audit.log({
      actorId: actor.id,
      action: 'BUDGET_DELETED',
      entity: 'Budget',
      entityId: id,
      oldData: { category: before.category, period: before.period, amount: before.amount },
      ...ctx(req),
    });
    return { success: true };
  }
}