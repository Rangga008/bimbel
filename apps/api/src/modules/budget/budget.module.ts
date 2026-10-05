import { Module } from '@nestjs/common';
import { AuditModule } from '../../common/audit/audit.module';
import { RbacModule } from '../rbac/rbac.module';
import { BudgetController } from './budget.controller';
import { BudgetService } from './budget.service';

@Module({
  imports: [AuditModule, RbacModule],
  controllers: [BudgetController],
  providers: [BudgetService],
  exports: [BudgetService],
})
export class BudgetModule {}