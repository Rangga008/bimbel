// Module Fase 1c: schedules + sessions + overrides + facilities.
import { Module } from '@nestjs/common';
import { AuditModule } from '../../common/audit/audit.module';
import { RbacModule } from '../rbac/rbac.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { ConflictService } from './conflict.service';
import { FacilitiesService } from './facilities.service';
import { SchedulesService } from './schedules.service';
import { SessionsService } from './sessions.service';
import { SessionOverridesService } from './session-overrides.service';
import { SessionGenerateService } from './session-generate.service';
import { SchedulesController } from './schedules.controller';
import { SessionsController } from './sessions.controller';

@Module({
  imports: [AuditModule, RbacModule, NotificationsModule, WhatsAppModule],
  controllers: [SchedulesController, SessionsController],
  providers: [
    ConflictService,
    FacilitiesService,
    SchedulesService,
    SessionsService,
    SessionOverridesService,
    SessionGenerateService,
  ],
  exports: [ConflictService, SchedulesService, SessionsService],
})
export class SchedulesModule {}
