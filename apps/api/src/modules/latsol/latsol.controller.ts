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
import { LatsolService } from './latsol.service';
import { LatsolWriteService } from './latsol-write.service';
import {
  CreateLatsolPackageDto,
  GradeEssayDto,
  SaveAnswerDto,
  SubmitLatsolDto,
  UpdateLatsolPackageDto,
} from './dto/latsol.dto';

function ctx(req: Request) {
  return { ipAddress: req.ip, userAgent: req.headers['user-agent'] };
}

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LatsolController {
  constructor(
    private readonly read: LatsolService,
    private readonly write: LatsolWriteService,
    private readonly audit: AuditService,
  ) {}

  @Get('latsol/packages')
  @RequirePermissions(PERMISSION_CODES.LATSOL_VIEW)
  listPackages(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('programId') programId?: string,
    @Query('levelId') levelId?: string,
    @Query('subjectId') subjectId?: string,
    @Query('category') category?: string,
    @Query('search') search?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.read.listPackages(actor, {
      programId,
      levelId,
      subjectId,
      category,
      search,
      includeInactive: includeInactive === 'true',
    });
  }

  @Get('latsol/attempts/mine')
  @RequirePermissions(PERMISSION_CODES.LATSOL_VIEW)
  myAttempts(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('packageId') packageId?: string,
  ) {
    return this.write.myAttempts(actor.id, packageId);
  }

  @Get('latsol/packages/:id')
  @RequirePermissions(PERMISSION_CODES.LATSOL_MANAGE)
  getPackage(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.read.getPackage(id, actor);
  }

  @Get('latsol/packages/:id/play')
  @RequirePermissions(PERMISSION_CODES.LATSOL_VIEW)
  playPackage(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.read.getPackageForStudent(id, actor);
  }

  @Post('latsol/packages')
  @RequirePermissions(PERMISSION_CODES.LATSOL_MANAGE)
  async createPackage(
    @Body() dto: CreateLatsolPackageDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const created = await this.write.createPackage(actor, dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'LATSOL_PACKAGE_CREATED',
      entity: 'LatsolPackage',
      entityId: created.id,
      newData: { title: dto.title, questionCount: dto.questionIds.length },
      ...ctx(req),
    });
    return created;
  }

  @Patch('latsol/packages/:id')
  @RequirePermissions(PERMISSION_CODES.LATSOL_MANAGE)
  async updatePackage(
    @Param('id') id: string,
    @Body() dto: UpdateLatsolPackageDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const before = await this.read.getPackage(id);
    const updated = await this.write.updatePackage(id, dto, actor);
    await this.audit.log({
      actorId: actor.id,
      action: 'LATSOL_PACKAGE_UPDATED',
      entity: 'LatsolPackage',
      entityId: id,
      oldData: { title: before.title },
      newData: { title: updated.title },
      ...ctx(req),
    });
    return updated;
  }

  @Delete('latsol/packages/:id')
  @RequirePermissions(PERMISSION_CODES.LATSOL_MANAGE)
  async deletePackage(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const before = await this.read.getPackage(id);
    await this.write.deletePackage(id, actor);
    await this.audit.log({
      actorId: actor.id,
      action: 'LATSOL_PACKAGE_DELETED',
      entity: 'LatsolPackage',
      entityId: id,
      oldData: { title: before.title },
      ...ctx(req),
    });
    return { success: true };
  }

  @Get('latsol/packages/:id/attempts')
  @RequirePermissions(PERMISSION_CODES.LATSOL_MANAGE)
  packageAttempts(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.write.packageAttempts(id, actor);
  }

  @Post('latsol/packages/:id/start')
  @RequirePermissions(PERMISSION_CODES.LATSOL_VIEW)
  startAttempt(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.write.start(actor.id, id);
  }

  @Get('latsol/attempts/:id')
  @RequirePermissions(PERMISSION_CODES.LATSOL_VIEW)
  attemptDetail(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.write.attemptDetail(actor.id, id);
  }

  @Post('latsol/attempts/:id/answers/:questionId')
  @RequirePermissions(PERMISSION_CODES.LATSOL_VIEW)
  saveAnswer(
    @Param('id') id: string,
    @Param('questionId') questionId: string,
    @Body() dto: SaveAnswerDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.write.saveAnswer(actor.id, id, questionId, dto);
  }

  @Post('latsol/attempts/:id/submit')
  @RequirePermissions(PERMISSION_CODES.LATSOL_VIEW)
  submitAttempt(
    @Param('id') id: string,
    @Body() dto: SubmitLatsolDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.write.submit(actor.id, id, dto);
  }

  @Patch('latsol/answers/:answerId/grade')
  @RequirePermissions(PERMISSION_CODES.LATSOL_MANAGE)
  async gradeAnswer(
    @Param('answerId') answerId: string,
    @Body() dto: GradeEssayDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const updated = await this.write.gradeAnswer(answerId, dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'LATSOL_ANSWER_GRADED',
      entity: 'LatsolAnswer',
      entityId: answerId,
      newData: { score: updated.score, isCorrect: updated.isCorrect },
      ...ctx(req),
    });
    return updated;
  }
}
