import { Global, Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

// Global supaya service lain (reports, invoices, notifications) bisa membaca
// pengaturan tanpa impor berulang — pola sama seperti AuditModule.
@Global()
@Module({
  imports: [RbacModule],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
