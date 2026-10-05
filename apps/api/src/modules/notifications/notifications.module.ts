// Module Fase 1d: notification skeleton in-app.
// Fase 5b: trigger otomatis (NotificationEventsService) + scanner rilis
// hasil ujian + integrasi WhatsApp outbox (WhatsAppModule).
import { Module } from '@nestjs/common';
import { AuditModule } from '../../common/audit/audit.module';
import { RbacModule } from '../rbac/rbac.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { MediaModule } from '../media/media.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationEventsService } from './notification-events.service';
import { ExamResultReleaseScheduler } from './exam-result-release.scheduler';

@Module({
  imports: [AuditModule, RbacModule, WhatsAppModule, MediaModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationEventsService,
    ExamResultReleaseScheduler,
  ],
  exports: [NotificationsService, NotificationEventsService],
})
export class NotificationsModule {}
