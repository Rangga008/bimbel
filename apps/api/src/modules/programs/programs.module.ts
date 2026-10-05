import { Module } from '@nestjs/common';
import { AuditModule } from '../../common/audit/audit.module';
import { RbacModule } from '../rbac/rbac.module';
import { ProgramsService } from './programs.service';
import { LevelsService } from './levels.service';
import { PackagesService } from './packages.service';
import { ProgramsController } from './programs.controller';
import { LevelsController } from './levels.controller';
import { PackagesController } from './packages.controller';
import { PublicController } from './public.controller';

@Module({
  imports: [AuditModule, RbacModule],
  controllers: [
    ProgramsController,
    LevelsController,
    PackagesController,
    PublicController,
  ],
  providers: [ProgramsService, LevelsService, PackagesService],
  exports: [ProgramsService, LevelsService, PackagesService],
})
export class ProgramsModule {}
