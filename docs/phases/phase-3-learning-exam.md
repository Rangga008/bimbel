# Fase 3 — Learning Content & Exam Engine

**Urutan asli (prompt.md §39):** Langkah 6 (Question bank + Latsol) + Langkah 7 (Exam + autosave + proctoring + timer + results).

## Tujuan

Domain paling kritis di aplikasi: materi belajar, bank soal, latsol, dan mesin ujian lengkap dengan timing global & proctoring.

## Cakupan

Ikuti `.github/instructions/exam.instructions.md` sepenuhnya. Ringkas cakupan:

- Module `materials`: upload/kelola materi per program/level/kelompok.
- Module `question-bank`: 5 tipe soal, dukung teks/KaTeX/gambar di soal, opsi, dan solusi.
- Module `latsol`: siswa kerjakan, feedback instan (benar/salah + solusi) segera setelah selesai.
- Module `exams`: CRUD ujian, `scheduled_start_at`/`scheduled_end_at` global, publish/lock.
- Module `exam-attempts`: mulai attempt, autosave jawaban (debounce), auto-submit saat waktu global habis.
- Module `exam-proctoring`: fullscreen/visibility/blur detection, warning counter, lock, unlock by permission (lintas kelompok).
- Result release: hasil baru terlihat setelah waktu global exam berakhir untuk semua peserta.
- Halaman Ujian/Latsol/Bank Soal/Pembahasan di semua role terkait — isi data nyata.

## Di luar cakupan

Analytics mendalam & ranking (Fase 4) — cukup simpan data mentah (score, jawaban, waktu) yang dibutuhkan Fase 4.

## Definition of Done

- Simulasi ujian dengan ≥3 "siswa" (akun berbeda) berjalan bersamaan; saat `scheduled_end_at` tercapai, semua attempt `IN_PROGRESS` otomatis tertutup.
- Tidak ada response API yang mengandung correct answer sebelum result release, untuk siswa manapun.
- Proctor unlock lintas kelompok berfungsi & tercatat audit log.
- Latsol menampilkan solusi langsung setelah siswa submit.
- Soal dengan simbol matematika (KaTeX) dan gambar tampil benar di kedua mode (desktop/mobile).

## Prompt siap-pakai untuk Copilot Agent

```
Kerjakan Fase 3 (Learning & Exam) sesuai docs/phases/phase-3-learning-exam.md dan .github/instructions/exam.instructions.md.
Ini domain paling kritis — utamakan kebenaran timing & keamanan anti-leak di atas kecepatan.
Jika ada hal teknis yang menurutmu perlu ditambahkan di luar cakupan file ini, ikuti aturan "Inisiatif Agent" di copilot-instructions.md — jangan langsung implementasi besar, tulis sebagai "Usulan Tambahan".
Setelah selesai, jelaskan secara eksplisit bagaimana auto-submit dan anti-leak diverifikasi, dan sertakan Usulan Tambahan (jika ada).
```
