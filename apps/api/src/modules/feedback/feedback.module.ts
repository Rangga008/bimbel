import { Module } from '@nestjs/common';
import { AuditModule } from '../../common/audit/audit.module';
import { RbacModule } from '../rbac/rbac.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { FeedbackService } from './feedback.service';
import { FeedbackController } from './feedback.controller';

@Module({
  imports: [AuditModule, RbacModule, WhatsAppModule],
  controllers: [FeedbackController],
  providers: [FeedbackService],
  exports: [FeedbackService],
})
export class FeedbackModule {}
