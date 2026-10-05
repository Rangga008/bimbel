# Fase 3c — Exam Core & Timing

Bagian ketiga Fase 3 — **PALING KRITIS di seluruh aplikasi**. Utamakan kebenaran di atas kecepatan.
**Prasyarat: Fase 3a selesai** (bank soal). Fase 3b tidak wajib prasyarat tapi logisnya sudah selesai duluan.

## Tujuan
Mesin ujian dengan timing global server-authoritative, autosave, dan auto-submit — TANPA proctoring dulu (itu 3d) dan TANPA result release logic (itu 3e, hasil boleh sementara langsung kebuka untuk testing di fase ini, nanti dikunci di 3e).

## Cakupan
- Module `exams`: CRUD ujian dari bank soal (3a), `scheduled_start_at` & `scheduled_end_at` **global** (server-side, sama untuk semua peserta), publish/lock status.
- Module `exam-attempts`: siswa mulai attempt, autosave jawaban (debounce ke server sebagai source of truth), retry saat request gagal.
- **Auto-submit:** saat `scheduled_end_at` tercapai, server menutup semua attempt `IN_PROGRESS` — ini logic paling kritis di seluruh aplikasi, uji dengan simulasi concurrent.
- Waktu dihitung dari jadwal global, bukan kapan siswa klik "mulai" — siswa telat tetap habis waktu bersamaan.
- Halaman "Ujian" (Siswa, Tutor, Admin Academic) — siswa bisa mengerjakan, submit manual atau auto-submit.

## Di luar cakupan
Proctoring/anti-cheat (3d), result release & pembahasan (3e — untuk sementara hasil boleh langsung terlihat setelah attempt selesai, akan dikunci di 3e).

## Definition of Done
- Simulasi ≥3 "siswa" (akun berbeda) mengerjakan exam yang sama secara bersamaan.
- Saat `scheduled_end_at` tercapai, SEMUA attempt `IN_PROGRESS` otomatis tertutup di waktu yang sama — tidak ada race condition/attempt yang lolos.
- Siswa yang mulai terlambat tetap kehabisan waktu di jam global yang sama (bukan dapat durasi penuh sejak dia klik mulai).
- Autosave jawaban tersimpan ke server, teruji dengan refresh browser di tengah pengerjaan (jawaban tidak hilang).

## Prompt siap-pakai (ringkas)
```
Kerjakan Fase 3c sesuai docs/phases/phase-3c-exam-core-timing.md.
Fase 3a sudah selesai, pakai bank soal yang ada.
INI PALING KRITIS: scheduled_start_at/end_at GLOBAL server-side, auto-submit saat waktu habis, tidak boleh race condition.
JANGAN kerjakan proctoring atau result-release-lock dulu (fase terpisah).
Uji dengan simulasi minimal 3 attempt bersamaan sebelum lapor selesai.
Kalau ada tambahan teknis di luar ini, tulis "Usulan Tambahan" saja.
Selesai: jelaskan eksplisit bagaimana auto-submit & concurrency diverifikasi.
```
