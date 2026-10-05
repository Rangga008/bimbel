# Fase 1d — Attendance & Notification Skeleton

Bagian terakhir dari Fase 1. **Prasyarat: Fase 1a, 1b, 1c sudah selesai** (jadwal/sesi konkret sudah ada).

## Tujuan
Tutor bisa mencatat kehadiran per sesi, dan menyiapkan skeleton notifikasi in-app (belum WhatsApp — itu Fase 5).

## Cakupan
Ikuti `.github/instructions/attendance-schedule.instructions.md` bagian attendance. Ringkas:
- Module `attendance`: input oleh tutor per Session (dari 1c), status hadir/terlambat/izin/sakit/alfa.
- Koreksi absensi dengan permission tertentu + **wajib** tercatat di `audit_logs` (old_data/new_data).
- Rekap attendance per siswa/kelompok/tutor/periode.
- `notifications` skeleton: skema `Notification`, `NotificationPreference`, hanya in-app (belum trigger otomatis penuh, belum WhatsApp).
- Halaman "Absensi" (tutor, admin) dan "Kehadiran" (orang tua) dengan data nyata.

## Di luar cakupan
Trigger notifikasi otomatis lintas modul & WhatsApp abstraction (Fase 5) — cukup skema & 1 contoh manual trigger.

## Definition of Done — sekaligus penutup seluruh Fase 1
- Tutor input absensi 1 sesi penuh (semua siswa di kelompok itu) lewat UI.
- Koreksi 1 data absensi menghasilkan entry di `audit_logs`.
- Rekap attendance benar untuk 4 dimensi (siswa/kelompok/tutor/periode) via API.
- Orang tua melihat rekap kehadiran anaknya di halaman "Kehadiran".
- **Cek ulang seluruh Fase 1**: Dashboard "Beranda" tiap role sudah menampilkan data nyata (bukan skeleton) untuk bagian yang relevan Fase 1 (people, groups, schedule, attendance).

## Prompt siap-pakai untuk Copilot Agent
```
Kerjakan Fase 1d (Attendance & Notification Skeleton) sesuai docs/phases/phase-1d-attendance-notification.md
dan .github/instructions/attendance-schedule.instructions.md.
Fase 1a, 1b, 1c sudah selesai — gunakan Session yang sudah ada, jangan buat ulang skema jadwal.
Setelah fase ini selesai, seluruh Fase 1 (Core Operations) dianggap tuntas — verifikasi ulang Definition of Done gabungan di akhir file ini.
Jika ada hal teknis yang menurutmu perlu ditambahkan di luar cakupan file ini, ikuti aturan "Inisiatif Agent" di copilot-instructions.md — tulis sebagai "Usulan Tambahan", jangan langsung implementasi besar.
Setelah selesai, ringkas apa yang dibuat, Definition of Done mana yang terverifikasi, dan sertakan Usulan Tambahan (jika ada).
```
