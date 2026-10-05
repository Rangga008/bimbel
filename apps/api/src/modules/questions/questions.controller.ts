import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { PERMISSION_CODES } from '../rbac/permissions.constants';
import { AuditService } from '../../common/audit/audit.service';
import { QuestionsService } from './questions.service';
import { QuestionsImportService } from './questions-import.service';
import { CreateQuestionDto, UpdateQuestionDto } from './dto/question.dto';

function ctx(req: Request) {
  return { ipAddress: req.ip, userAgent: req.headers['user-agent'] };
}

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class QuestionsController {
  constructor(
    private readonly questions: QuestionsService,
    private readonly importer: QuestionsImportService,
    private readonly audit: AuditService,
  ) {}

  /** Template import soal: ?format=xlsx (default) atau docx. */
  @Get('questions/import/template')
  @RequirePermissions(PERMISSION_CODES.QUESTION_MANAGE)
  async template(
    @Query('format') format: string | undefined,
    @Res() res: Response,
  ) {
    const isDocx = format === 'docx';
    const buf = isDocx
      ? await this.importer.templateDocx()
      : await this.importer.templateXlsx();
    res.setHeader(
      'Content-Type',
      isDocx
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="template-import-soal.${isDocx ? 'docx' : 'xlsx'}"`,
    );
    res.send(buf);
  }

  /**
   * Import massal soal dari Word/Excel. Field multipart: file + programId?,
   * levelId*, subjectId*, category* — semua soal diarahkan ke taksonomi itu.
   * `dryRun=1` → hanya parse + validasi, tanpa menyimpan (untuk preview).
   */
  @Post('questions/import')
  @RequirePermissions(PERMISSION_CODES.QUESTION_MANAGE)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  async import(
    @UploadedFile()
    file:
      | { buffer: Buffer; mimetype: string; originalname: string; size: number }
      | undefined,
    @Body('programId') programId: string | undefined,
    @Body('levelId') levelId: string | undefined,
    @Body('subjectId') subjectId: string | undefined,
    @Body('category') category: string | undefined,
    @Body('dryRun') dryRun: string | undefined,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const isDry = dryRun === '1' || dryRun === 'true';
    const result = await this.importer.importFile(actor, file, {
      programId: programId || undefined,
      levelId: levelId || undefined,
      subjectId: subjectId || undefined,
      category: category || undefined,
      dryRun: isDry,
    });
    if (!isDry) {
      await this.audit.log({
        actorId: actor.id,
        action: 'QUESTION_IMPORTED',
        entity: 'Question',
        entityId: file?.originalname ?? 'import',
        newData: {
          file: file?.originalname,
          parsed: result.parsed,
          created: result.created,
          levelId,
          subjectId,
          category,
        },
        ...ctx(req),
      });
    }
    return result;
  }

  @Get('questions')
  @RequirePermissions(PERMISSION_CODES.QUESTION_VIEW)
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('programId') programId?: string,
    @Query('levelId') levelId?: string,
    @Query('subjectId') subjectId?: string,
    @Query('category') category?: string,
    @Query('type') type?: string,
    @Query('difficulty') difficulty?: string,
    @Query('search') search?: string,
  ) {
    return this.questions.list(actor, {
      programId,
      levelId,
      subjectId,
      category,
      type,
      difficulty,
      search,
    });
  }

  @Get('questions/summary')
  @RequirePermissions(PERMISSION_CODES.QUESTION_VIEW)
  summary(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('programId') programId?: string,
    @Query('levelId') levelId?: string,
    @Query('subjectId') subjectId?: string,
  ) {
    return this.questions.getSummary(actor, { programId, levelId, subjectId });
  }

  @Get('questions/:id')
  @RequirePermissions(PERMISSION_CODES.QUESTION_VIEW)
  get(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.questions.get(id, actor);
  }

  @Post('questions')
  @RequirePermissions(PERMISSION_CODES.QUESTION_MANAGE)
  async create(
    @Body() dto: CreateQuestionDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const created = await this.questions.create(actor.id, dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'QUESTION_CREATED',
      entity: 'Question',
      entityId: created.id,
      newData: { type: dto.type, content: dto.content, programId: dto.programId, levelId: dto.levelId },
      ...ctx(req),
    });
    return created;
  }

  @Patch('questions/:id')
  @RequirePermissions(PERMISSION_CODES.QUESTION_MANAGE)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateQuestionDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const before = await this.questions.get(id);
    const updated = await this.questions.update(id, dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'QUESTION_UPDATED',
      entity: 'Question',
      entityId: id,
      oldData: { type: before.type, content: before.content },
      newData: { type: updated.type, content: updated.content },
      ...ctx(req),
    });
    return updated;
  }

  @Delete('questions/:id')
  @RequirePermissions(PERMISSION_CODES.QUESTION_MANAGE)
  async delete(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const before = await this.questions.get(id);
    await this.questions.delete(id);
    await this.audit.log({
      actorId: actor.id,
      action: 'QUESTION_DELETED',
      entity: 'Question',
      entityId: id,
      oldData: { type: before.type, content: before.content },
      ...ctx(req),
    });
    return { success: true };
  }
}