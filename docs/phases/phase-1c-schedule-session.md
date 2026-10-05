# Fase 1c — Schedule & Session

Bagian ketiga dari Fase 1. **Prasyarat: Fase 1a & 1b sudah selesai** (kelompok, siswa, tutor sudah ada).

## Tujuan
Jadwal konkret bertanggal-waktu untuk tiap kelompok/sesi, dengan deteksi konflik.

## Cakupan
Ikuti `.github/instructions/attendance-schedule.instructions.md` bagian schedule/session. Ringkas:
- `Schedule` & `Session` sebagai entitas mandiri (bisa diubah), bukan menempel statis ke kelompok.
- Override jadwal per-siswa (Admin bisa ubah manual untuk 1 siswa tanpa mengubah jadwal kelompok).
- Conflict detection: tutor bentrok waktu, siswa double-booking, ruangan bentrok (butuh entitas `Room`/`Building` minimal).
- Isi halaman "Jadwal" semua role dengan data nyata.

## Di luar cakupan
Input absensi aktual (Fase 1d) — sesi di fase ini baru berupa jadwal, belum ada catatan kehadiran.

## Definition of Done
- Membuat jadwal untuk 1 kelompok menghasilkan beberapa Session dengan tanggal-waktu konkret.
- Override jadwal 1 siswa tidak mengubah jadwal siswa lain di kelompok yang sama.
- Conflict detection menolak: 2 sesi tutor sama-waktu-beda-tempat, siswa double-booking, ruangan bentrok — teruji manual untuk ketiganya.

## Prompt siap-pakai untuk Copilot Agent
```
Kerjakan Fase 1c (Schedule & Session) sesuai docs/phases/phase-1c-schedule-session.md
dan .github/instructions/attendance-schedule.instructions.md.
Fase 1a & 1b sudah selesai — gunakan entitas yang sudah ada, jangan buat ulang.
Jangan kerjakan Attendance dulu (sub-fase 1d terpisah).
Jika ada hal teknis yang menurutmu perlu ditambahkan di luar cakupan file ini, ikuti aturan "Inisiatif Agent" di copilot-instructions.md — tulis sebagai "Usulan Tambahan", jangan langsung implementasi besar.
Setelah selesai, ringkas apa yang dibuat, Definition of Done mana yang terverifikasi, dan sertakan Usulan Tambahan (jika ada).
```
