// Provider WhatsApp via HTTP API gateway (kompatibel Fonnte).
// Fonnte: POST {url}, header `Authorization: <token>`, body form
// `target` (nomor) + `message`. Dipilih via WHATSAPP_PROVIDER=fonnte
// dengan WHATSAPP_API_URL + WHATSAPP_API_TOKEN di env.
import { Injectable, Logger } from '@nestjs/common';
import type {
  WhatsAppMessage,
  WhatsAppProvider,
  WhatsAppSendResult,
} from '../whatsapp.provider';

/** "0812..." / "+62..." -> "62..." (format yang diterima gateway WA). */
function normalizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = `62${digits.slice(1)}`;
  return digits;
}

@Injectable()
export class HttpWhatsAppProvider implements WhatsAppProvider {
  readonly name = 'fonnte';
  private readonly logger = new Logger(HttpWhatsAppProvider.name);

  constructor(
    private readonly url: string,
    private readonly token: string,
    /** Nomor pengirim — diteruskan sebagai param `sender` (diabaikan gateway yang tidak mendukung, mis. Fonnte). */
    private readonly sender = '',
  ) {}

  async send(message: WhatsAppMessage): Promise<WhatsAppSendResult> {
    if (!this.token) {
      throw new Error(
        'WHATSAPP_API_TOKEN belum diisi — provider fonnte tidak bisa mengirim.',
      );
    }
    // Lampiran (file) hanya tersedia di paket Fonnte berbayar — kalau gateway
    // menolak, fallback kirim teks saja supaya pesan tetap sampai.
    if (message.attachment) {
      try {
        return await this.request(this.buildFormData(message));
      } catch (err) {
        this.logger.warn(
          `Kirim lampiran ditolak gateway, fallback teks: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    return this.request(this.buildFormData(message, true));
  }

  private buildFormData(message: WhatsAppMessage, skipAttachment = false) {
    const form = new FormData();
    form.set('target', normalizePhone(message.to));
    form.set('message', message.body);
    if (this.sender) form.set('sender', normalizePhone(this.sender));
    if (message.attachment && !skipAttachment) {
      form.set('filename', message.attachment.filename);
      form.set(
        'file',
        new Blob([new Uint8Array(message.attachment.content)], {
          type: message.attachment.mime,
        }),
        message.attachment.filename,
      );
    }
    return form;
  }

  private async request(form: FormData): Promise<WhatsAppSendResult> {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: { Authorization: this.token },
      body: form,
      signal: AbortSignal.timeout(30_000),
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Gateway WA merespons ${res.status}: ${text.slice(0, 200)}`);
    }

    // Fonnte: {status: true, process: "success"|"pending", id: ["...", ...]}
    try {
      const json = JSON.parse(text) as {
        status?: boolean;
        id?: string[] | string;
        detail?: string;
        reason?: string;
      };
      if (json.status === false) {
        throw new Error(
          `Gateway WA menolak pesan: ${json.reason ?? json.detail ?? text.slice(0, 200)}`,
        );
      }
      const ref = Array.isArray(json.id) ? json.id.join(',') : json.id;
      return { providerRef: ref };
    } catch (err) {
      if (err instanceof SyntaxError) {
        this.logger.warn(`Respons gateway bukan JSON: ${text.slice(0, 120)}`);
        return {};
      }
      throw err;
    }
  }
}
