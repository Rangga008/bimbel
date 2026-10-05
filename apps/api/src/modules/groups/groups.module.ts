import { Module } from '@nestjs/common';
import { AuditModule } from '../../common/audit/audit.module';
import { RbacModule } from '../rbac/rbac.module';
import { SchedulesModule } from '../schedules/schedules.module';
import { GroupsService } from './groups.service';
import { GroupsController } from './groups.controller';

@Module({
  imports: [AuditModule, RbacModule, SchedulesModule],
  controllers: [GroupsController],
  providers: [GroupsService],
  exports: [GroupsService],
})
export class GroupsModule {}