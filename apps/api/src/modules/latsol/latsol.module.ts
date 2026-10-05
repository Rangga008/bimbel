import { Module } from '@nestjs/common';
import { ContentCategoriesModule } from '../content-categories/content-categories.module';
import { AuditModule } from '../../common/audit/audit.module';
import { RbacModule } from '../rbac/rbac.module';
import { PointTransactionsModule } from '../point-transactions/point-transactions.module';
import { LatsolController } from './latsol.controller';
import { LatsolService } from './latsol.service';
import { LatsolWriteService } from './latsol-write.service';

@Module({
  imports: [AuditModule, RbacModule, PointTransactionsModule, ContentCategoriesModule],
  controllers: [LatsolController],
  providers: [LatsolService, LatsolWriteService],
  exports: [LatsolService, LatsolWriteService],
})
export class LatsolModule {}
