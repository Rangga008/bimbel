import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { RbacModule } from '../rbac/rbac.module';
import { ExamsModule } from '../exams/exams.module';

@Module({
  imports: [RbacModule, ExamsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
