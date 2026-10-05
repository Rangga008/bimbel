import { Module } from '@nestjs/common';
import { ContentCategoriesModule } from '../content-categories/content-categories.module';
import { AuditModule } from '../../common/audit/audit.module';
import { RbacModule } from '../rbac/rbac.module';
import { QuestionsController } from './questions.controller';
import { QuestionsService } from './questions.service';
import { QuestionsImportService } from './questions-import.service';

@Module({
  imports: [AuditModule, RbacModule, ContentCategoriesModule],
  controllers: [QuestionsController],
  providers: [QuestionsService, QuestionsImportService],
  exports: [QuestionsService],
})
export class QuestionsModule {}