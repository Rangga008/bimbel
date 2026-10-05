// Module Fase 1d: attendance (input per sesi + koreksi + rekap 4 dimensi).
import { Module } from '@nestjs/common';
import { AuditModule } from '../../common/audit/audit.module';
import { RbacModule } from '../rbac/rbac.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { AttendanceRecapService } from './attendance-recap.service';

@Module({
  imports: [AuditModule, RbacModule, NotificationsModule],
  controllers: [AttendanceController],
  providers: [AttendanceService, AttendanceRecapService],
  exports: [AttendanceService, AttendanceRecapService],
})
export class AttendanceModule {}
