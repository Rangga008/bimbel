import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { PERMISSION_CODES } from '../rbac/permissions.constants';
import { AuditService } from '../../common/audit/audit.service';
import { ExpenseService } from './expense.service';
import { CreateExpenseDto, UpdateExpenseDto } from './dto/expense.dto';

function ctx(req: Request) {
  return { ipAddress: req.ip, userAgent: req.headers['user-agent'] };
}

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ExpenseController {
  constructor(
    private readonly expense: ExpenseService,
    private readonly audit: AuditService,
  ) {}

  @Get('expenses')
  @RequirePermissions(PERMISSION_CODES.EXPENSE_VIEW)
  list(
    @Query('period') period?: string,
    @Query('category') category?: string,
    @Query('accountId') accountId?: string,
    @Query('search') search?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.expense.list({ period, category, accountId, search, from, to });
  }

  @Get('expenses/summary')
  @RequirePermissions(PERMISSION_CODES.EXPENSE_VIEW)
  summary(@Query('period') period?: string) {
    return this.expense.getSummary(period);
  }

  @Get('expenses/:id')
  @RequirePermissions(PERMISSION_CODES.EXPENSE_VIEW)
  get(@Param('id') id: string) {
    return this.expense.get(id);
  }

  @Post('expenses')
  @RequirePermissions(PERMISSION_CODES.EXPENSE_MANAGE)
  async create(
    @Body() dto: CreateExpenseDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const created = await this.expense.create(actor.id, dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'EXPENSE_CREATED',
      entity: 'Expense',
      entityId: created.id,
      newData: { category: dto.category, amount: dto.amount, accountId: dto.accountId },
      ...ctx(req),
    });
    return created;
  }

  @Patch('expenses/:id')
  @RequirePermissions(PERMISSION_CODES.EXPENSE_MANAGE)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateExpenseDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const before = await this.expense.get(id);
    const updated = await this.expense.update(id, dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'EXPENSE_UPDATED',
      entity: 'Expense',
      entityId: id,
      oldData: { category: before.category, amount: before.amount, accountId: before.accountId },
      newData: { category: updated.category, amount: updated.amount, accountId: updated.accountId },
      ...ctx(req),
    });
    return updated;
  }

  @Delete('expenses/:id')
  @RequirePermissions(PERMISSION_CODES.EXPENSE_MANAGE)
  async delete(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const before = await this.expense.get(id);
    await this.expense.delete(id);
    await this.audit.log({
      actorId: actor.id,
      action: 'EXPENSE_DELETED',
      entity: 'Expense',
      entityId: id,
      oldData: { category: before.category, amount: before.amount, accountId: before.accountId },
      ...ctx(req),
    });
    return { success: true };
  }
}