import { Module } from '@nestjs/common';
import { ContentCategoriesModule } from '../content-categories/content-categories.module';
import { AuditModule } from '../../common/audit/audit.module';
import { RbacModule } from '../rbac/rbac.module';
import { MaterialsController } from './materials.controller';
import { MaterialsService } from './materials.service';

@Module({
  imports: [AuditModule, RbacModule, ContentCategoriesModule],
  controllers: [MaterialsController],
  providers: [MaterialsService],
  exports: [MaterialsService],
})
export class MaterialsModule {}