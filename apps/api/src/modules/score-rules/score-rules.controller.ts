/**
 * Fase 4b — Score Rules Controller
 * Data-driven scoring system management
 * Role-based access control for Admin Academic and Owner
 */
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { PERMISSION_CODES } from '../rbac/permissions.constants';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { AuditService } from '../../common/audit/audit.service';
import { ScoreRulesService } from './score-rules.service';
import { CreateScoreRuleDto } from './dto/create-score-rule.dto';
import { UpdateScoreRuleDto } from './dto/update-score-rule.dto';

function ctx(req: Request) {
  return { ipAddress: req.ip, userAgent: req.headers['user-agent'] };
}

@Controller('score-rules')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ScoreRulesController {
  constructor(
    private readonly scoreRulesService: ScoreRulesService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Create a new score rule
   * Access: Admin Academic, Owner
   */
  @Post()
  @RequirePermissions(PERMISSION_CODES.SCORE_RULES_CREATE)
  async create(
    @Body() createScoreRuleDto: CreateScoreRuleDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const created = await this.scoreRulesService.create(createScoreRuleDto);
    await this.audit.log({
      actorId: actor.id,
      action: 'SCORE_RULE_CREATED',
      entity: 'ScoreRule',
      entityId: created.id,
      newData: {
        name: created.name,
        entityType: created.entityType,
        entityValue: created.entityValue,
        pointsPerUnit: created.pointsPerUnit,
        bonusThreshold: created.bonusThreshold,
        bonusPoints: created.bonusPoints,
      },
      ...ctx(req),
    });
    return created;
  }

  /**
   * Get all score rules
   * Access: Admin Academic, Owner
   */
  @Get()
  @RequirePermissions(PERMISSION_CODES.SCORE_RULES_VIEW)
  async findAll(
    @Query('entityType') entityType?: string,
    @Query('isActive') isActive?: string,
  ) {
    const filters: { entityType?: string; isActive?: boolean } = {};
    if (entityType) filters.entityType = entityType;
    if (isActive !== undefined) filters.isActive = isActive === 'true';

    return this.scoreRulesService.findAll(filters);
  }

  /**
   * Get a specific score rule
   * Access: Admin Academic, Owner
   */
  @Get(':id')
  @RequirePermissions(PERMISSION_CODES.SCORE_RULES_VIEW)
  async findOne(@Param('id') id: string) {
    return this.scoreRulesService.findOne(id);
  }

  /**
   * Update a score rule
   * Access: Admin Academic, Owner
   */
  @Put(':id')
  @RequirePermissions(PERMISSION_CODES.SCORE_RULES_UPDATE)
  async update(
    @Param('id') id: string,
    @Body() updateScoreRuleDto: UpdateScoreRuleDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const before = await this.scoreRulesService.findOne(id);
    const updated = await this.scoreRulesService.update(id, updateScoreRuleDto);
    await this.audit.log({
      actorId: actor.id,
      action: 'SCORE_RULE_UPDATED',
      entity: 'ScoreRule',
      entityId: id,
      oldData: {
        name: before.name,
        pointsPerUnit: before.pointsPerUnit,
        bonusThreshold: before.bonusThreshold,
        bonusPoints: before.bonusPoints,
        isActive: before.isActive,
      },
      newData: {
        name: updated.name,
        pointsPerUnit: updated.pointsPerUnit,
        bonusThreshold: updated.bonusThreshold,
        bonusPoints: updated.bonusPoints,
        isActive: updated.isActive,
      },
      ...ctx(req),
    });
    return updated;
  }

  /**
   * Delete a score rule (soft delete)
   * Access: Admin Academic, Owner
   */
  @Delete(':id')
  @RequirePermissions(PERMISSION_CODES.SCORE_RULES_DELETE)
  async remove(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const before = await this.scoreRulesService.findOne(id);
    const removed = await this.scoreRulesService.remove(id);
    await this.audit.log({
      actorId: actor.id,
      action: 'SCORE_RULE_DELETED',
      entity: 'ScoreRule',
      entityId: id,
      oldData: { name: before.name, isActive: before.isActive },
      newData: { isActive: removed.isActive },
      ...ctx(req),
    });
    return removed;
  }

  /**
   * Get active rules for an entity type
   * Access: Admin Academic, Owner
   */
  @Get('active/:entityType')
  @RequirePermissions(PERMISSION_CODES.SCORE_RULES_VIEW)
  async getActiveRules(
    @Param('entityType') entityType: string,
    @Query('entityValue') entityValue?: string,
  ) {
    return this.scoreRulesService.getActiveRules(entityType, entityValue);
  }

  /**
   * Calculate points for an exam attempt (for testing/admin use)
   * Access: Admin Academic, Owner
   */
  @Post('calculate/exam/:attemptId')
  @RequirePermissions(PERMISSION_CODES.SCORE_RULES_VIEW)
  async calculateExamPoints(@Param('attemptId') attemptId: string) {
    return this.scoreRulesService.calculateExamPoints(attemptId);
  }

  /**
   * Calculate points for a latsol attempt (for testing/admin use)
   * Access: Admin Academic, Owner
   */
  @Post('calculate/latsol/:attemptId')
  @RequirePermissions(PERMISSION_CODES.SCORE_RULES_VIEW)
  async calculateLatsolPoints(@Param('attemptId') attemptId: string) {
    return this.scoreRulesService.calculateLatsolPoints(attemptId);
  }
}
