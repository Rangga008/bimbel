// ===========================================================================
// Fase 5b — Abstraksi provider WhatsApp (adapter pattern).
// Provider konkret BELUM dipilih final — semua pengiriman lewat interface ini
// supaya mengganti provider (Fonnte/Wablas/Twilio/dll) cukup dengan menambah
// adapter baru + mengubah env WHATSAPP_PROVIDER, tanpa menyentuh outbox atau
// pemicu notifikasi.
// ===========================================================================

/** Lampiran file (mis. PDF kwitansi) untuk dikirim bersama pesan. */
export interface WhatsAppAttachment {
  filename: string;
  mime: string;
  content: Buffer;
}

/** Pesan WhatsApp yang akan dikirim provider. */
export interface WhatsAppMessage {
  /** Nomor tujuan. Normalisasi format (mis. 08xx -> +62) urusan provider konkret. */
  to: string;
  /** Nama penerima (opsional — untuk log/personal greeting). */
  name?: string | null;
  /** Isi pesan teks. */
  body: string;
  /** Lampiran opsional — provider yang tidak mendukung wajib fallback ke teks. */
  attachment?: WhatsAppAttachment;
  /** Metadata tambahan (eventType, referenceType, referenceId) untuk provider yang butuh. */
  metadata?: Record<string, unknown>;
}

export interface WhatsAppSendResult {
  /** Referensi/id pesan di sisi provider — disimpan di outbox untuk rekonsiliasi. */
  providerRef?: string;
  /** Respons mentah provider — disimpan untuk diagnostik (dibatasi ukurannya). */
  raw?: unknown;
}

/** Hasil cek status pengiriman pesan di sisi provider. */
export interface WhatsAppDeliveryResult {
  /** Status dinormalisasi: sent|delivered|read|pending|processing|waiting|
   *  invalid|failed|expired|unknown. */
  status: string;
  /** Detail mentah dari provider (opsional). */
  raw?: unknown;
}

/** Kontrak yang WAJIB dipenuhi setiap provider WhatsApp. */
export interface WhatsAppProvider {
  /** Nama provider — dicatat di baris outbox untuk audit. */
  readonly name: string;
  /** Kirim pesan. Lempar error bila gagal — outbox yang menandai FAILED. */
  send(message: WhatsAppMessage): Promise<WhatsAppSendResult>;
  /**
   * Opsional — cek status pengiriman pesan yang sudah dikirim (rekonsiliasi
   * "API terima tapi pesan tidak sampai", mis. device Fonnte offline).
   */
  checkDelivery?(providerRef: string): Promise<WhatsAppDeliveryResult>;
}

/** Token DI — selalu injeksikan interface via token ini, JANGAN class konkret. */
export const WHATSAPP_PROVIDER = 'WHATSAPP_PROVIDER';
