import { Module } from '@nestjs/common';
import { AuditModule } from '../../common/audit/audit.module';
import { RbacModule } from '../rbac/rbac.module';
import { ExpenseController } from './expense.controller';
import { ExpenseService } from './expense.service';

@Module({
  imports: [AuditModule, RbacModule],
  controllers: [ExpenseController],
  providers: [ExpenseService],
  exports: [ExpenseService],
})
export class ExpenseModule {}