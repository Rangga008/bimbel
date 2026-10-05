# Fase 5b — Notifikasi & WhatsApp Abstraction

Bagian terakhir Fase 5. **Prasyarat: Fase 5a selesai** (opsional secara teknis, tapi logis dikerjakan setelahnya karena payroll salah satu trigger notifikasi).
Notification skeleton (in-app saja) sudah ada dari Fase 1d — fase ini mengaktifkan trigger penuh + WhatsApp.

## Tujuan
Notifikasi otomatis lintas event penting + abstraksi WhatsApp (provider belum final).

## Cakupan
- `notifications` full: trigger otomatis untuk event: invoice baru, pembayaran terverifikasi, jadwal berubah, hasil ujian rilis, payroll dibayar, dsb.
- `whatsapp_outbox` + **interface abstraction provider** — provider WhatsApp belum dipilih final, jadi buat adapter pattern (interface `WhatsAppProvider` dengan method `send()`), provider dummy/log-only untuk development (tulis ke console/DB, bukan kirim beneran).
- Approval flow: pesan WhatsApp keluar masuk outbox dulu (status PENDING), baru terkirim (status SENT) — **jangan kirim langsung dari controller/service tanpa lewat outbox**.

## Di luar cakupan
Memilih/mengintegrasikan provider WhatsApp asli (di luar scope proyek ini untuk saat ini) — cukup interface + dummy provider.

## Definition of Done — sekaligus penutup seluruh Fase 5
- Event "pembayaran terverifikasi" (dari Fase 2) memicu entry baru di `whatsapp_outbox` dengan status PENDING → provider dummy proses → status SENT (log ke console/DB, bukan kirim asli).
- Notification in-app muncul near-real-time untuk role terkait saat event terjadi (mis. jadwal berubah → orang tua dapat notif).
- Event "payroll dibayar" (dari Fase 5a) memicu notifikasi ke tutor terkait.
- **Cek ulang Fase 5**: payroll (5a) dan notifikasi (5b) terhubung — perubahan status payroll memicu notif yang benar.

## Prompt siap-pakai (ringkas)
```
Kerjakan Fase 5b sesuai docs/phases/phase-5b-notification-whatsapp.md.
Fase 5a sudah selesai. WhatsApp provider belum final — WAJIB interface abstraction + outbox, JANGAN hardcode ke satu provider atau kirim langsung dari controller.
Setelah ini, seluruh Fase 5 dianggap tuntas.
Kalau ada tambahan teknis di luar ini, tulis "Usulan Tambahan" saja.
Selesai: ringkas hasil + DoD yang terverifikasi.
```
