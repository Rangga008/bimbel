import { Module } from '@nestjs/common';
import { AuditModule } from '../../common/audit/audit.module';
import { RbacModule } from '../rbac/rbac.module';
import { UsersModule } from '../users/users.module';
import { PeopleService } from './people.service';
import { PeopleOverviewService } from './people-overview.service';
import { ParentsService } from './parents.service';
import { TutorsService } from './tutors.service';
import { ParentStudentService } from './parent-student.service';
import { StudentsController } from './students.controller';
import { ParentsController } from './parents.controller';
import { TutorsController } from './tutors.controller';

@Module({
  imports: [AuditModule, RbacModule, UsersModule],
  controllers: [StudentsController, ParentsController, TutorsController],
  providers: [
    PeopleService,
    PeopleOverviewService,
    ParentsService,
    TutorsService,
    ParentStudentService,
  ],
  exports: [
    PeopleService,
    PeopleOverviewService,
    ParentsService,
    TutorsService,
    ParentStudentService,
  ],
})
export class PeopleModule {}
