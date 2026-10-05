import { Global, Module } from '@nestjs/common';
import { MailerService } from './mailer.service';

// Global supaya modul lain (auth, notifications, dst.) bisa kirim email
// tanpa impor berulang — pola sama seperti SettingsModule.
@Global()
@Module({
  providers: [MailerService],
  exports: [MailerService],
})
export class MailerModule {}
