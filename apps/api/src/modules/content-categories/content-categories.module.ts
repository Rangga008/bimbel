import { Module } from '@nestjs/common';
import { AuditModule } from '../../common/audit/audit.module';
import { RbacModule } from '../rbac/rbac.module';
import { ContentCategoriesController } from './content-categories.controller';
import { ContentCategoriesService } from './content-categories.service';

@Module({
  imports: [AuditModule, RbacModule],
  controllers: [ContentCategoriesController],
  providers: [ContentCategoriesService],
  exports: [ContentCategoriesService],
})
export class ContentCategoriesModule {}
