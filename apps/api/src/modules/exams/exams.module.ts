import { Module } from '@nestjs/common';
import { ContentCategoriesModule } from '../content-categories/content-categories.module';
import { AuditModule } from '../../common/audit/audit.module';
import { RbacModule } from '../rbac/rbac.module';
import { QuestionsModule } from '../questions/questions.module';
import { ExamsController } from './exams.controller';
import { ExamsService } from './exams.service';

@Module({
  imports: [AuditModule, RbacModule, QuestionsModule, ContentCategoriesModule],
  controllers: [ExamsController],
  providers: [ExamsService],
  exports: [ExamsService],
})
export class ExamsModule {}
