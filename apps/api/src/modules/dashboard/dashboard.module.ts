import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [RbacModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
