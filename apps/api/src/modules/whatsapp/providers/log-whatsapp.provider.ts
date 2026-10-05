// Provider dummy untuk development: TIDAK mengirim pesan sungguhan —
// hanya menulis ke console log dan mengembalikan providerRef palsu supaya
// alur outbox (PENDING -> SENT) bisa diverifikasi end-to-end.
import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  WhatsAppMessage,
  WhatsAppProvider,
  WhatsAppSendResult,
} from '../whatsapp.provider';

@Injectable()
export class LogWhatsAppProvider implements WhatsAppProvider {
  readonly name = 'log';
  private readonly logger = new Logger(LogWhatsAppProvider.name);

  send(message: WhatsAppMessage): Promise<WhatsAppSendResult> {
    const providerRef = `LOG-${randomUUID()}`;
    const target = message.name
      ? `${message.to} (${message.name})`
      : message.to;
    const attachment = message.attachment
      ? ` [lampiran: ${message.attachment.filename}]`
      : '';
    this.logger.log(`[whatsapp->${target}] ${message.body}${attachment}`);
    return Promise.resolve({ providerRef });
  }
}
