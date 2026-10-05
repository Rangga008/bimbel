import { Module } from '@nestjs/common';
import { AuditModule } from '../../common/audit/audit.module';
import { RbacModule } from '../rbac/rbac.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { ParentPaymentsController } from './parent-payments.controller';
import { PaymentWebhookController } from './payment-webhook.controller';

@Module({
  imports: [AuditModule, RbacModule, NotificationsModule],
  controllers: [PaymentsController, ParentPaymentsController, PaymentWebhookController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
