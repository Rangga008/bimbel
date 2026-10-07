// Fase 6 — Pengaturan aplikasi (key-value JSON di tabel app_settings).
// SETTING_DEFS adalah sumber tunggal daftar key valid + default + validator:
// GET selalu mengembalikan default yang di-merge dengan nilai tersimpan,
// sehingga field baru tetap terbaca walau baris setting lama belum punya key tsb.
import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface CompanySettings {
  name: string;
  address: string;
  phone: string;
  email: string;
}

export interface FinanceSettings {
  /** Jatuh tempo default (hari) saat invoice diterbitkan tanpa dueDate eksplisit. */
  invoiceDueDays: number;
  /** Nama penandatangan kwitansi (mis. bendahara). Kosong = nama verifikator. */
  receiptSignerName: string;
  /** Jabatan penandatangan (mis. "Bendahara"). Kosong = "Admin Finance". */
  receiptSignerTitle: string;
  /** URL gambar tanda tangan (/api/media/…/file atau eksternal). Kosong = tanpa gambar. */
  receiptSignatureUrl: string;
}

export interface WhatsAppSettings {
  /** Provider pengiriman: "log" = dummy (pesan dicetak ke log API), "fonnte" = gateway HTTP Fonnte-compatible. */
  provider: string;
  /** URL endpoint gateway (default API Fonnte). */
  apiUrl: string;
  /** Token API gateway — secret, dimask saat dibaca lewat GET /settings. */
  apiToken: string;
  /** Nomor WA pengirim — harus nomor yang dipairing ke akun gateway. */
  senderNumber: string;
  /** Nomor WA admin penerima notifikasi otomatis (mis. bukti bayar baru masuk). */
  adminPhone: string;
  notifyInvoiceIssued: boolean;
  notifyPaymentVerified: boolean;
  notifyPaymentRejected: boolean;
  notifyPaymentProof: boolean;
  notifyPayrollPaid: boolean;
}

export interface BrandingSettings {
  /** Nama aplikasi yang tampil di sidebar, login, landing, dan email. */
  appName: string;
  tagline: string;
  /** URL logo (internal /api/media/:id/file atau eksternal). Kosong = default. */
  logoUrl: string;
  /** URL publik aplikasi (mis. https://bimbel.id) — basis link di WA/email. */
  appUrl: string;
}

export interface MailSettings {
  /** Host SMTP; kosong = mode log (email hanya dicetak di log API). */
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  /** Alamat pengirim, mis. "Bimbel GFS <no-reply@bimbel.id>". */
  from: string;
}

export interface ReminderSettings {
  /** Placeholder: {{children}} {{group}} {{detail}} */
  paymentDue: string;
  /** Placeholder: {{children}} {{group}} {{week}} {{days}} */
  weeklySchedule: string;
  /** Placeholder: {{children}} {{group}} {{month}} {{detail}} */
  monthlyPerformance: string;
  /** Placeholder: {{children}} {{group}} */
  feedback: string;
  /** Placeholder: {{children}} {{tutor}} {{datetime}} {{subject}} {{group}} {{reason}} */
  tutorAbsence: string;
}

export interface MidtransSettings {
  /** Gateway aktif: true = pembayaran online via Midtrans Snap. */
  enabled: boolean;
  /** true = environment produksi, false = sandbox.midtrans.com. */
  isProduction: boolean;
  /** Server Key dari dashboard Midtrans — secret, dimask saat dibaca. */
  serverKey: string;
  /** Client Key (untuk Snap.js di frontend bila nanti dipakai). */
  clientKey: string;
}

type SettingValue =
  | CompanySettings
  | FinanceSettings
  | WhatsAppSettings
  | BrandingSettings
  | MailSettings
  | MidtransSettings
  | ReminderSettings;

interface SettingDef<T extends SettingValue> {
  defaults: T;
  /** Lempar BadRequestException bila nilai tidak valid; kembalikan nilai ternormalisasi. */
  validate(raw: unknown): T;
}

const asString = (v: unknown, field: string, maxLen = 200): string => {
  if (typeof v !== 'string') {
    throw new BadRequestException(`${field} wajib berupa teks.`);
  }
  if (v.length > maxLen) {
    throw new BadRequestException(`${field} maksimal ${maxLen} karakter.`);
  }
  return v.trim();
};

const asBool = (v: unknown, field: string): boolean => {
  if (typeof v !== 'boolean') {
    throw new BadRequestException(`${field} wajib boolean (true/false).`);
  }
  return v;
};

const asIntRange = (
  v: unknown,
  field: string,
  min: number,
  max: number,
): number => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new BadRequestException(
      `${field} wajib bilangan bulat antara ${min}–${max}.`,
    );
  }
  return n;
};

const PHONE_RE = /^[0-9+\-\s()]{0,20}$/;

export const SETTING_DEFS: {
  company: SettingDef<CompanySettings>;
  finance: SettingDef<FinanceSettings>;
  whatsapp: SettingDef<WhatsAppSettings>;
  branding: SettingDef<BrandingSettings>;
  mail: SettingDef<MailSettings>;
  midtrans: SettingDef<MidtransSettings>;
  reminders: SettingDef<ReminderSettings>;
} = {
  company: {
    defaults: {
      name: 'BimbelGFS',
      address: '',
      phone: '',
      email: '',
    },
    validate(raw) {
      const o = (raw ?? {}) as Record<string, unknown>;
      const email = asString(o.email, 'company.email', 120);
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        throw new BadRequestException('company.email bukan alamat email valid.');
      }
      return {
        name: asString(o.name, 'company.name', 120),
        address: asString(o.address, 'company.address', 300),
        phone: asString(o.phone, 'company.phone', 30),
        email,
      };
    },
  },
  finance: {
    defaults: {
      invoiceDueDays: 14,
      receiptSignerName: '',
      receiptSignerTitle: '',
      receiptSignatureUrl: '',
    },
    validate(raw) {
      const o = (raw ?? {}) as Record<string, unknown>;
      return {
        invoiceDueDays: asIntRange(
          o.invoiceDueDays,
          'finance.invoiceDueDays',
          0,
          365,
        ),
        receiptSignerName: asString(
          o.receiptSignerName,
          'finance.receiptSignerName',
          100,
        ),
        receiptSignerTitle: asString(
          o.receiptSignerTitle,
          'finance.receiptSignerTitle',
          80,
        ),
        receiptSignatureUrl: asString(
          o.receiptSignatureUrl,
          'finance.receiptSignatureUrl',
          500,
        ),
      };
    },
  },
  whatsapp: {
    defaults: {
      provider: 'log',
      apiUrl: 'https://api.fonnte.com/send',
      apiToken: '',
      senderNumber: '',
      adminPhone: '',
      notifyInvoiceIssued: true,
      notifyPaymentVerified: true,
      notifyPaymentRejected: true,
      notifyPaymentProof: true,
      notifyPayrollPaid: true,
    },
    validate(raw) {
      const o = (raw ?? {}) as Record<string, unknown>;
      const provider = asString(o.provider, 'whatsapp.provider', 20);
      if (!['log', 'fonnte', 'http'].includes(provider)) {
        throw new BadRequestException(
          'whatsapp.provider hanya boleh "log" atau "fonnte".',
        );
      }
      const apiUrl = asString(o.apiUrl, 'whatsapp.apiUrl', 300);
      if (apiUrl && !/^https:\/\//.test(apiUrl)) {
        throw new BadRequestException(
          'whatsapp.apiUrl harus URL https:// yang valid.',
        );
      }
      const adminPhone = asString(o.adminPhone, 'whatsapp.adminPhone', 20);
      if (adminPhone && !PHONE_RE.test(adminPhone)) {
        throw new BadRequestException(
          'whatsapp.adminPhone hanya boleh berisi angka, +, -, spasi, ().',
        );
      }
      const senderNumber = asString(
        o.senderNumber,
        'whatsapp.senderNumber',
        20,
      );
      if (senderNumber && !PHONE_RE.test(senderNumber)) {
        throw new BadRequestException(
          'whatsapp.senderNumber hanya boleh berisi angka, +, -, spasi, ().',
        );
      }
      return {
        provider,
        apiUrl,
        apiToken: asString(o.apiToken, 'whatsapp.apiToken', 200),
        senderNumber,
        adminPhone,
        notifyInvoiceIssued: asBool(
          o.notifyInvoiceIssued,
          'whatsapp.notifyInvoiceIssued',
        ),
        notifyPaymentVerified: asBool(
          o.notifyPaymentVerified,
          'whatsapp.notifyPaymentVerified',
        ),
        notifyPaymentRejected: asBool(
          o.notifyPaymentRejected,
          'whatsapp.notifyPaymentRejected',
        ),
        notifyPaymentProof: asBool(
          o.notifyPaymentProof,
          'whatsapp.notifyPaymentProof',
        ),
        notifyPayrollPaid: asBool(
          o.notifyPayrollPaid,
          'whatsapp.notifyPayrollPaid',
        ),
      };
    },
  },
  branding: {
    defaults: { appName: 'Bimbel GFS', tagline: '', logoUrl: '', appUrl: '' },
    validate(raw) {
      const o = (raw ?? {}) as Record<string, unknown>;
      const appUrl = asString(o.appUrl, 'branding.appUrl', 200).replace(
        /\/+$/,
        '',
      );
      if (appUrl && !/^https?:\/\//.test(appUrl)) {
        throw new BadRequestException(
          'branding.appUrl harus URL http(s):// yang valid.',
        );
      }
      return {
        appName: asString(o.appName, 'branding.appName', 80),
        tagline: asString(o.tagline, 'branding.tagline', 160),
        logoUrl: asString(o.logoUrl, 'branding.logoUrl', 500),
        appUrl,
      };
    },
  },
  mail: {
    defaults: {
      host: '',
      port: 587,
      secure: false,
      user: '',
      pass: '',
      from: '',
    },
    validate(raw) {
      const o = (raw ?? {}) as Record<string, unknown>;
      return {
        host: asString(o.host, 'mail.host', 200),
        port: asIntRange(o.port, 'mail.port', 1, 65535),
        secure: asBool(o.secure, 'mail.secure'),
        user: asString(o.user, 'mail.user', 200),
        pass: asString(o.pass, 'mail.pass', 200),
        from: asString(o.from, 'mail.from', 200),
      };
    },
  },
  midtrans: {
    defaults: {
      enabled: false,
      isProduction: false,
      serverKey: '',
      clientKey: '',
    },
    validate(raw) {
      const o = (raw ?? {}) as Record<string, unknown>;
      const enabled = asBool(o.enabled, 'midtrans.enabled');
      const serverKey = asString(o.serverKey, 'midtrans.serverKey', 100);
      if (enabled && !serverKey) {
        throw new BadRequestException(
          'midtrans.serverKey wajib diisi bila gateway diaktifkan.',
        );
      }
      return {
        enabled,
        isProduction: asBool(o.isProduction, 'midtrans.isProduction'),
        serverKey,
        clientKey: asString(o.clientKey, 'midtrans.clientKey', 100),
      };
    },
  },
  reminders: {
    defaults: {
      paymentDue:
        '*Bimbel GFS — Reminder Pembayaran*\n' +
        'Yth. Bapak/Ibu orang tua {{children}},\n\n' +
        'Terdapat tagihan belum lunas:\n{{detail}}\n\n' +
        'Mohon segera diselesaikan sebelum jatuh tempo. Terima kasih.',
      weeklySchedule:
        '*Bimbel GFS — Jadwal Mingguan*\n' +
        'Yth. Bapak/Ibu orang tua {{children}},\n\n' +
        'Kelompok: {{group}}\nMinggu {{week}}\n\n{{days}}\n\n' +
        'Mohon hadir tepat waktu. Terima kasih.',
      monthlyPerformance:
        '*Bimbel GFS — Performa Bulanan {{month}}*\n' +
        'Yth. Bapak/Ibu orang tua {{children}},\n\n' +
        'Kelompok: {{group}}\n\n{{detail}}\n\n' +
        'Terus semangat belajar! Detail lengkap tersedia di aplikasi.',
      feedback:
        '*Bimbel GFS — Feedback Mingguan*\n' +
        'Yth. Bapak/Ibu orang tua {{children}},\n\n' +
        'Mohon luangkan waktu mengisi feedback mingguan tentang materi yang dipelajari ' +
        '{{children}} di sekolah pada pekan ini (kelompok {{group}}). ' +
        'Feedback membantu tutor menyesuaikan materi bimbel. Buka menu *Feedback* di aplikasi. Terima kasih.',
      tutorAbsence:
        '*Bimbel GFS — Info Tutor Berhalangan*\n' +
        'Yth. Bapak/Ibu orang tua {{children}},\n\n' +
        'Tutor {{tutor}} berhalangan hadir pada sesi {{datetime}} ({{subject}}, kelompok {{group}}).\n' +
        'Alasan: {{reason}}\n\n' +
        'Info tutor pengganti/penjadwalan ulang akan kami sampaikan menyusul. Terima kasih.',
    },
    validate(raw) {
      const o = (raw ?? {}) as Record<string, unknown>;
      const req = (v: unknown, f: string) => {
        const s = asString(v, f, 4000);
        if (!s) throw new BadRequestException(`${f} tidak boleh kosong.`);
        return s;
      };
      return {
        paymentDue: req(o.paymentDue, 'reminders.paymentDue'),
        weeklySchedule: req(o.weeklySchedule, 'reminders.weeklySchedule'),
        monthlyPerformance: req(
          o.monthlyPerformance,
          'reminders.monthlyPerformance',
        ),
        feedback: req(o.feedback, 'reminders.feedback'),
        tutorAbsence: req(o.tutorAbsence, 'reminders.tutorAbsence'),
      };
    },
  },
};

export type SettingKey = keyof typeof SETTING_DEFS;

/** Nilai yang dikirim balik ke UI untuk field secret — bukan nilai asli. */
export const SECRET_MASK = '********';

/** Field yang nilainya tidak boleh bocor ke respons GET /settings. */
const SECRET_FIELDS: Partial<Record<SettingKey, string[]>> = {
  whatsapp: ['apiToken'],
  mail: ['pass'],
  midtrans: ['serverKey'],
};

function maskSecrets(key: SettingKey, value: Record<string, unknown>) {
  const fields = SECRET_FIELDS[key];
  if (!fields) return value;
  const masked = { ...value };
  for (const f of fields) {
    if (typeof masked[f] === 'string' && masked[f]) masked[f] = SECRET_MASK;
  }
  return masked;
}

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  private assertKey(key: string): asserts key is SettingKey {
    if (!Object.hasOwn(SETTING_DEFS, key)) {
      throw new BadRequestException(
        `Key pengaturan "${key}" tidak dikenal. Pilihan: ${Object.keys(SETTING_DEFS).join(', ')}.`,
      );
    }
  }

  /**
   * Nilai efektif sebuah key (default di-merge dengan nilai tersimpan).
   * Field secret (password SMTP, token WA) diganti SECRET_MASK kecuali
   * `raw: true` — konsumen internal (mailer, provider WA) wajib pakai raw.
   */
  async get<K extends SettingKey>(
    key: K,
    opts?: { raw?: boolean },
  ): Promise<(typeof SETTING_DEFS)[K]['defaults']> {
    this.assertKey(key);
    const row = await this.prisma.appSetting.findUnique({ where: { key } });
    const def = SETTING_DEFS[key];
    const merged = {
      ...def.defaults,
      ...(row?.value as object | undefined),
    } as Record<string, unknown>;
    return (
      opts?.raw ? merged : maskSecrets(key, merged)
    ) as never;
  }

  /** Semua setting ter-group per key — dipakai halaman Pengaturan. */
  async getAll() {
    const rows = await this.prisma.appSetting.findMany();
    const stored = new Map(rows.map((r) => [r.key, r.value]));
    const out: Record<string, unknown> = {};
    for (const [key, def] of Object.entries(SETTING_DEFS)) {
      const merged = {
        ...def.defaults,
        ...(stored.get(key) as object | undefined),
      } as Record<string, unknown>;
      out[key] = maskSecrets(key as SettingKey, merged);
    }
    return out;
  }

  /** Simpan nilai key (divalidasi dulu). Mengembalikan nilai efektif. */
  async set(key: string, value: unknown, updatedBy: string | null) {
    this.assertKey(key);
    const before = await this.prisma.appSetting.findUnique({ where: { key } });
    // Field secret yang dikirim sebagai SECRET_MASK artinya "tidak diubah" —
    // pertahankan nilai lama sebelum validasi.
    const incoming = { ...(value as Record<string, unknown>) };
    const prev = (before?.value ?? {}) as Record<string, unknown>;
    for (const f of SECRET_FIELDS[key] ?? []) {
      if (incoming[f] === SECRET_MASK) incoming[f] = prev[f] ?? '';
    }
    const normalized = SETTING_DEFS[key].validate(incoming);
    const jsonValue = normalized as unknown as Prisma.InputJsonValue;
    const row = await this.prisma.appSetting.upsert({
      where: { key },
      create: { key, value: jsonValue, updatedBy },
      update: { value: jsonValue, updatedBy },
    });
    return { row, oldValue: before?.value ?? null, newValue: normalized };
  }
}
