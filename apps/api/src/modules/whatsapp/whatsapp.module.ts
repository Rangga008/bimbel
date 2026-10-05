// Fase 5b — WhatsApp module: provider abstraction + outbox.
// Provider dipilih lewat Pengaturan (app_settings key "whatsapp", field
// provider/apiUrl/apiToken) — bisa diubah admin tanpa restart. Env
// WHATSAPP_PROVIDER dkk tetap jadi fallback bila setting kosong.
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RbacModule } from '../rbac/rbac.module';
import { SettingsService } from '../settings/settings.service';
import { WHATSAPP_PROVIDER } from './whatsapp.provider';
import type { WhatsAppProvider } from './whatsapp.provider';
import { SettingsWhatsAppProvider } from './providers/settings-whatsapp.provider';
import { WhatsAppOutboxService } from './whatsapp-outbox.service';
import { WhatsAppOutboxWorker } from './whatsapp-outbox.worker';
import { WhatsAppController } from './whatsapp.controller';

@Module({
  imports: [RbacModule],
  controllers: [WhatsAppController],
  providers: [
    {
      provide: WHATSAPP_PROVIDER,
      inject: [SettingsService, ConfigService],
      useFactory: (
        settings: SettingsService,
        config: ConfigService,
      ): WhatsAppProvider => new SettingsWhatsAppProvider(settings, config),
    },
    WhatsAppOutboxService,
    WhatsAppOutboxWorker,
  ],
  exports: [WhatsAppOutboxService],
})
export class WhatsAppModule {}
