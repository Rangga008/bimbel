import { Module } from '@nestjs/common';
import { AuditModule } from '../../common/audit/audit.module';
import { RbacModule } from '../rbac/rbac.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RefundsController } from './refunds.controller';
import { RefundsService } from './refunds.service';

@Module({
  imports: [AuditModule, RbacModule, NotificationsModule],
  controllers: [RefundsController],
  providers: [RefundsService],
  exports: [RefundsService],
})
export class RefundsModule {}
