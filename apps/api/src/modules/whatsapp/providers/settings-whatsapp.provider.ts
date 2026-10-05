// Provider WhatsApp yang konfigurasinya dibaca dari Pengaturan (app_settings
// key "whatsapp") — diubah admin lewat UI tanpa restart server. Nilai env
// WHATSAPP_PROVIDER/API_URL/API_TOKEN tetap jadi fallback bila setting belum
// diisi (kompatibel deployment lama).
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SettingsService } from '../../settings/settings.service';
import type {
  WhatsAppMessage,
  WhatsAppProvider,
  WhatsAppSendResult,
} from '../whatsapp.provider';
import { HttpWhatsAppProvider } from './http-whatsapp.provider';
import { LogWhatsAppProvider } from './log-whatsapp.provider';

@Injectable()
export class SettingsWhatsAppProvider implements WhatsAppProvider {
  private readonly logger = new Logger(SettingsWhatsAppProvider.name);
  private inner: WhatsAppProvider | null = null;
  private innerKey = '';

  /** Nama provider aktif terakhir — dipakai outbox untuk audit baris pesan. */
  get name() {
    return this.inner?.name ?? 'settings';
  }

  constructor(
    private readonly settings: SettingsService,
    private readonly config: ConfigService,
  ) {}

  private async resolve(): Promise<WhatsAppProvider> {
    const wa = await this.settings.get('whatsapp', { raw: true });
    const provider = (
      wa.provider ||
      this.config.get<string>('WHATSAPP_PROVIDER') ||
      'log'
    ).toLowerCase();
    const url =
      wa.apiUrl ||
      this.config.get<string>('WHATSAPP_API_URL') ||
      'https://api.fonnte.com/send';
    const token =
      wa.apiToken || this.config.get<string>('WHATSAPP_API_TOKEN') || '';
    const key = `${provider}|${url}|${token}|${wa.senderNumber}`;
    if (this.inner && this.innerKey === key) return this.inner;

    this.innerKey = key;
    switch (provider) {
      case 'fonnte':
      case 'http':
        this.inner = new HttpWhatsAppProvider(url, token, wa.senderNumber);
        break;
      default:
        this.inner = new LogWhatsAppProvider();
    }
    this.logger.log(`Provider WhatsApp aktif: "${this.inner.name}"`);
    return this.inner;
  }

  async send(message: WhatsAppMessage): Promise<WhatsAppSendResult> {
    return (await this.resolve()).send(message);
  }
}
