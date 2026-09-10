import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [RbacModule],
  controllers: [DashboardController],
})
export class DashboardModule {}
