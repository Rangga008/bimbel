# Fase 5 — Tutor Payroll & Notifikasi/WhatsApp

**Urutan asli (prompt.md §39):** Langkah 9 (Tutor payroll) + Langkah 10 (Notification + WhatsApp abstraction).

## Tujuan
Menghitung honor tutor dari data operasional (Fase 1 & 3), dan mengaktifkan notifikasi lintas kanal termasuk abstraksi WhatsApp.

## Cakupan
- `tutor_rates`, `tutor_work_items` (dari sesi reguler/private/kelas tambahan/tugas khusus — ambil dari data Fase 1 & 3).
- Perhitungan payroll per periode: gross, adjustment (dengan alasan wajib), net, status pembayaran.
- Halaman Payroll di Admin Finance, Owner, dan Profil & Status Kepegawaian Tutor.
- `notifications` full: trigger otomatis untuk event penting (invoice baru, pembayaran terverifikasi, jadwal berubah, hasil ujian rilis, dst).
- `whatsapp_outbox` + interface abstraction provider (belum pilih provider final — buat adapter pattern, provider dummy/log-only untuk dev).
- Approval flow untuk pesan WhatsApp keluar (sesuai catatan §41: provider belum dikunci, siapkan dulu sebagai abstraction/outbox).

## Di luar cakupan
Laporan arsip lanjutan (Fase 6), hardening performa (Fase 7).

## Definition of Done
- Payroll 1 tutor dengan kombinasi sesi reguler + private + adjustment menghasilkan net pay yang benar dan bisa diaudit ke work items sumbernya.
- Event "pembayaran terverifikasi" memicu entry di `whatsapp_outbox` (status pending/sent, provider dummy log ke console/DB).
- Notification in-app muncul real-time/near-real-time untuk role terkait.

## Prompt siap-pakai untuk Copilot Agent
```
Kerjakan Fase 5 (Payroll & Notifikasi/WhatsApp) sesuai docs/phases/phase-5-payroll-whatsapp.md
dan bagian Payroll di .github/instructions/finance.instructions.md.
WhatsApp provider belum final — implementasikan sebagai interface + outbox, JANGAN hardcode ke satu provider.
Jika ada hal teknis yang menurutmu perlu ditambahkan di luar cakupan file ini, ikuti aturan "Inisiatif Agent" di copilot-instructions.md — jangan langsung implementasi besar, tulis sebagai "Usulan Tambahan".
Setelah selesai, ringkas apa yang dibuat, Definition of Done mana yang terverifikasi, dan sertakan Usulan Tambahan (jika ada).
```
