// Controller Fase 6 — halaman Audit (Owner): list audit_logs dengan filter
// actor/action/entity/periode + meta (distinct actions/entities/actors)
// untuk mengisi dropdown filter di UI.
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../../modules/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../modules/rbac/permissions.guard';
import { RequirePermissions } from '../../modules/rbac/permissions.decorator';
import { PERMISSION_CODES } from '../../modules/rbac/permissions.constants';

@Controller('audit-logs')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AuditLogsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions(PERMISSION_CODES.AUDIT_VIEW)
  async list(
    @Query('actorId') actorId?: string,
    @Query('action') action?: string,
    @Query('entity') entity?: string,
    @Query('entityId') entityId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const where: Record<string, unknown> = {};
    if (actorId) where.actorId = actorId;
    // action difilter contains (case-insensitive) supaya "PAYMENT" menangkap
    // PAYMENT_VERIFIED, PAYMENT_REJECTED, dst.
    if (action) where.action = { contains: action, mode: 'insensitive' };
    if (entity) where.entity = { equals: entity, mode: 'insensitive' };
    if (entityId) where.entityId = entityId;
    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: new Date(`${from}T00:00:00`) } : {}),
        ...(to ? { lte: new Date(`${to}T23:59:59.999`) } : {}),
      };
    }

    const take = Math.min(Math.max(parseInt(pageSize ?? '', 10) || 50, 1), 200);
    const pageNum = Math.max(parseInt(page ?? '', 10) || 1, 1);

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        include: { actor: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * take,
        take,
      }),
    ]);

    return { total, page: pageNum, pageSize: take, data: rows };
  }

  /** Nilai unik untuk dropdown filter (actor/action/entity). */
  @Get('meta')
  @RequirePermissions(PERMISSION_CODES.AUDIT_VIEW)
  async meta() {
    const [actions, entities, actors] = await Promise.all([
      this.prisma.auditLog.findMany({
        select: { action: true },
        distinct: ['action'],
        orderBy: { action: 'asc' },
      }),
      this.prisma.auditLog.findMany({
        select: { entity: true },
        distinct: ['entity'],
        orderBy: { entity: 'asc' },
      }),
      this.prisma.auditLog.findMany({
        where: { actorId: { not: null } },
        select: { actor: { select: { id: true, name: true, email: true } } },
        distinct: ['actorId'],
      }),
    ]);

    return {
      actions: actions.map((r) => r.action),
      entities: entities.map((r) => r.entity),
      actors: actors
        .map((r) => r.actor)
        .filter((a): a is NonNullable<typeof a> => a !== null),
    };
  }
}
