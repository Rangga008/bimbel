import { Module } from '@nestjs/common';
import { AuditModule } from '../../common/audit/audit.module';
import { RbacModule } from '../rbac/rbac.module';
import { PeopleModule } from '../people/people.module';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';

@Module({
  imports: [AuditModule, RbacModule, PeopleModule],
  controllers: [ImportsController],
  providers: [ImportsService],
})
export class ImportsModule {}
