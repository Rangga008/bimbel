// Mailer aplikasi — pengiriman email transaksional (mis. reset password).
// Konfigurasi SMTP dibaca dari setting `mail` (halaman Pengaturan). Jika
// host kosong, mailer berjalan dalam mode log (email dicetak ke log API)
// supaya flow tetap bisa diuji tanpa server SMTP sungguhan.
import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { SettingsService } from '../settings/settings.service';

export interface SendMailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);

  constructor(private readonly settings: SettingsService) {}

  async send(opts: SendMailOptions): Promise<{ mode: 'smtp' | 'log' }> {
    // raw: true — mail.pass disimpan termask untuk respons HTTP; di sini
    // kita butuh nilai asli untuk autentikasi SMTP.
    const mail = await this.settings.get('mail', { raw: true });
    if (!mail.host) {
      this.logger.log(
        `[mail-log] to=${opts.to} subject="${opts.subject}"\n${opts.text}`,
      );
      return { mode: 'log' };
    }
    const transport = nodemailer.createTransport({
      host: mail.host,
      port: mail.port,
      secure: mail.secure,
      auth: mail.user ? { user: mail.user, pass: mail.pass } : undefined,
      connectionTimeout: 15_000,
      socketTimeout: 15_000,
    });
    try {
      await transport.sendMail({
        from: mail.from || mail.user,
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
        html: opts.html,
      });
    } catch (e) {
      this.logger.error(
        `Gagal mengirim email ke ${opts.to}: ${e instanceof Error ? e.message : e}`,
      );
      throw e;
    }
    return { mode: 'smtp' };
  }
}
