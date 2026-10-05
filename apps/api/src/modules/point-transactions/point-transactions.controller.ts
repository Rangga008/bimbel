/**
 * Fase 4b — Point Transactions Controller
 * Manages point transactions and leaderboard access
 * Role-based access control for different user types
 */
import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  Body,
  NotFoundException,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { PERMISSION_CODES } from '../rbac/permissions.constants';
import { PointTransactionsService } from './point-transactions.service';
import { CreatePointTransactionDto } from './dto/create-point-transaction.dto';
import { PointEventType } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';

function ctx(req: Request) {
  return { ipAddress: req.ip, userAgent: req.headers['user-agent'] };
}

@Controller('point-transactions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PointTransactionsController {
  constructor(
    private readonly pointTransactionsService: PointTransactionsService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Create a manual point transaction (bonus/penalty)
   * Access: Admin Academic, Owner
   */
  @Post()
  @RequirePermissions(PERMISSION_CODES.POINT_TRANSACTIONS_CREATE)
  async create(
    @Body() createPointTransactionDto: CreatePointTransactionDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const created = await this.pointTransactionsService.create(
      createPointTransactionDto,
    );
    await this.audit.log({
      actorId: actor.id,
      action: 'POINT_TRANSACTION_CREATED',
      entity: 'PointTransaction',
      entityId: created.id,
      newData: {
        studentId: created.studentId,
        eventType: created.eventType,
        points: created.points,
        description: created.description,
      },
      ...ctx(req),
    });
    return created;
  }

  /**
   * Get point transactions for a student
   * Access: Student (own data), Parent (child data), Tutor (group students), Admin Academic
   */
  @Get('student/:studentId')
  @RequirePermissions(PERMISSION_CODES.POINT_TRANSACTIONS_VIEW)
  async findByStudent(
    @Param('studentId') studentId: string,
    @Query('eventType') eventType?: PointEventType,
    @Query('period') period?: string,
    @Query('limit') limit?: string,
  ) {
    const filters: {
      eventType?: PointEventType;
      period?: string;
      limit?: number;
    } = {};
    if (eventType) filters.eventType = eventType;
    if (period) filters.period = period;
    if (limit) filters.limit = parseInt(limit);

    return this.pointTransactionsService.findByStudent(studentId, filters);
  }

  /**
   * Get total points for a student
   * Access: Student (own data), Parent (child data), Tutor (group students), Admin Academic
   */
  @Get('student/:studentId/total')
  @RequirePermissions(PERMISSION_CODES.POINT_TRANSACTIONS_VIEW)
  async getStudentTotalPoints(
    @Param('studentId') studentId: string,
    @Query('period') period?: string,
  ) {
    return this.pointTransactionsService.getStudentTotalPoints(
      studentId,
      period,
    );
  }

  /**
   * Get own point transactions (for student)
   * Access: Student (own data only)
   */
  @Get('my-transactions')
  @RequirePermissions(PERMISSION_CODES.POINT_TRANSACTIONS_VIEW_OWN)
  async getMyTransactions(
    @CurrentUser() user: AuthenticatedUser,
    @Query('eventType') eventType?: PointEventType,
    @Query('period') period?: string,
    @Query('limit') limit?: string,
  ) {
    const student = await this.prisma.student.findUnique({
      where: { userId: user.id },
    });

    if (!student) {
      throw new NotFoundException('Student profile not found');
    }

    const filters: {
      eventType?: PointEventType;
      period?: string;
      limit?: number;
    } = {};
    if (eventType) filters.eventType = eventType;
    if (period) filters.period = period;
    if (limit) filters.limit = parseInt(limit);

    return this.pointTransactionsService.findByStudent(student.id, filters);
  }

  /**
   * Get own total points (for student)
   * Access: Student (own data only)
   */
  @Get('my-total')
  @RequirePermissions(PERMISSION_CODES.POINT_TRANSACTIONS_VIEW_OWN)
  async getMyTotalPoints(
    @CurrentUser() user: AuthenticatedUser,
    @Query('period') period?: string,
  ) {
    const student = await this.prisma.student.findUnique({
      where: { userId: user.id },
    });

    if (!student) {
      throw new NotFoundException('Student profile not found');
    }

    return this.pointTransactionsService.getStudentTotalPoints(
      student.id,
      period,
    );
  }

  /**
   * Get leaderboard
   * Access: Student, Parent, Tutor, Admin Academic, Owner
   */
  @Get('leaderboard')
  @RequirePermissions(PERMISSION_CODES.LEADERBOARD_VIEW)
  async getLeaderboard(
    @CurrentUser() user: AuthenticatedUser,
    @Query('groupId') groupId?: string,
    @Query('levelId') levelId?: string,
    @Query('programId') programId?: string,
    @Query('buildingId') buildingId?: string,
    @Query('myGroup') myGroup?: string,
    @Query('period') period?: string,
    @Query('limit') limit?: string,
  ) {
    const filters: {
      groupId?: string;
      levelId?: string;
      programId?: string;
      buildingId?: string;
      myGroup?: boolean;
      period?: string;
      limit?: number;
    } = {};
    if (groupId) filters.groupId = groupId;
    if (levelId) filters.levelId = levelId;
    if (programId) filters.programId = programId;
    if (buildingId) filters.buildingId = buildingId;
    if (myGroup === 'true') filters.myGroup = true;
    if (period) filters.period = period;
    if (limit) filters.limit = parseInt(limit);

    return this.pointTransactionsService.getLeaderboard(filters, user.id);
  }

  /**
   * Create point transaction for exam completion (internal/system use)
   * Access: System (or Admin for manual trigger)
   */
  @Post('exam/:attemptId')
  @RequirePermissions(PERMISSION_CODES.POINT_TRANSACTIONS_CREATE)
  async createExamTransaction(
    @Param('attemptId') attemptId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const result =
      await this.pointTransactionsService.createExamTransaction(attemptId);
    await this.audit.log({
      actorId: actor.id,
      action: 'POINT_TRANSACTION_EXAM_TRIGGERED',
      entity: 'ExamAttempt',
      entityId: attemptId,
      newData: {
        alreadyProcessed: result.alreadyProcessed,
        transactionCount: result.transactions.length,
      },
      ...ctx(req),
    });
    return result;
  }

  /**
   * Create point transaction for latsol completion (internal/system use)
   * Access: System (or Admin for manual trigger)
   */
  @Post('latsol/:attemptId')
  @RequirePermissions(PERMISSION_CODES.POINT_TRANSACTIONS_CREATE)
  async createLatsolTransaction(
    @Param('attemptId') attemptId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const result =
      await this.pointTransactionsService.createLatsolTransaction(attemptId);
    await this.audit.log({
      actorId: actor.id,
      action: 'POINT_TRANSACTION_LATSOL_TRIGGERED',
      entity: 'LatsolAttempt',
      entityId: attemptId,
      newData: {
        alreadyProcessed: result.alreadyProcessed,
        transactionCount: result.transactions.length,
      },
      ...ctx(req),
    });
    return result;
  }

  /**
   * Create manual adjustment (bonus/penalty)
   * Access: Admin Academic, Owner
   */
  @Post('manual-adjustment/:studentId')
  @RequirePermissions(PERMISSION_CODES.POINT_TRANSACTIONS_CREATE)
  async createManualAdjustment(
    @Param('studentId') studentId: string,
    @Body('points') points: number,
    @Body('description') description: string | undefined,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const created = await this.pointTransactionsService.createManualAdjustment(
      studentId,
      points,
      description,
    );
    await this.audit.log({
      actorId: actor.id,
      action: 'POINT_MANUAL_ADJUSTMENT',
      entity: 'PointTransaction',
      entityId: created.id,
      newData: { studentId, points, description: description ?? null },
      ...ctx(req),
    });
    return created;
  }

  /**
   * Get a specific point transaction
   * Access: Admin Academic, Owner
   */
  @Get(':id')
  @RequirePermissions(PERMISSION_CODES.POINT_TRANSACTIONS_VIEW)
  async findOne(@Param('id') id: string) {
    return this.pointTransactionsService.findOne(id);
  }
}
