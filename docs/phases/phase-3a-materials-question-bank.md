# Fase 3a — Materials & Question Bank

Bagian pertama Fase 3 (Learning & Exam), paling kritis di aplikasi. Urutan lengkap:
**3a Materials & Question Bank → 3b Latsol → 3c Exam Core & Timing → 3d Proctoring & Anti-Leak → 3e Result Release & Pembahasan.**
Prasyarat: Fase 1 (1a-1d) selesai — sudah ada Program/Level/Group.

## Tujuan
Konten dasar: materi belajar & bank soal. Murni CRUD, belum ada exam/latsol yang menjalankannya (itu 3b/3c).

## Cakupan
- Module `materials`: upload/kelola materi per Program/Level/Kelompok (dari Fase 1a/1b).
- Module `question-bank`: 5 tipe soal (pilihan tunggal, pilihan ganda, benar/salah, isian singkat, essay).
- Soal & opsi & solusi mendukung: teks, simbol matematika (**KaTeX/MathJax**), gambar.
- Halaman "Materi" & "Soal" (Admin Academic, Tutor) dengan data nyata.

## Di luar cakupan
Latsol/Exam yang memakai soal ini (3b/3c dst) — di sini baru bank soal berdiri sendiri.

## Definition of Done
- Bisa membuat soal dari 5 tipe, termasuk 1 soal dengan rumus KaTeX dan 1 soal dengan gambar.
- Rendering soal benar di desktop & mobile (360px) — cek khusus rumus & gambar tidak overflow.
- Materi bisa diunggah dan terlihat oleh siswa di kelompok terkait.

## Prompt siap-pakai (ringkas)
```
Kerjakan Fase 3a sesuai docs/phases/phase-3a-materials-question-bank.md.
Lingkup: module materials + question-bank (5 tipe soal + KaTeX + gambar) saja. JANGAN kerjakan latsol/exam dulu.
Kalau ada tambahan teknis di luar ini, tulis "Usulan Tambahan" saja.
Selesai: ringkas hasil + DoD yang terverifikasi.
```
