---
applyTo: "modules/exams/**,modules/exam-attempts/**,modules/exam-proctoring/**,modules/latsol/**,modules/question-bank/**,modules/results/**,modules/rankings/**"
---

# Instruksi: Exam, Latsol, Question Bank, Ranking
Ini modul **paling kritis** di aplikasi — utamakan kebenaran & keamanan di atas kecepatan development.

## Tipe Soal & Konten
Tipe minimal: pilihan tunggal, pilihan ganda, benar/salah, isian singkat, essay.
Soal & solusi harus mendukung: teks, simbol matematika (pakai **KaTeX/MathJax**), gambar pada soal, gambar pada opsi/jawaban, solusi teks atau gambar.

## Exam Timing — Server-Authoritative (WAJIB)
- Setiap exam punya `scheduled_start_at` & `scheduled_end_at` **global**, sama untuk semua peserta.
- Waktu dihitung dari jadwal global, **bukan** kapan siswa klik "mulai". Siswa masuk telat tetap kehabisan waktu di jam yang sama.
- Saat waktu habis: server menutup exam, semua attempt `IN_PROGRESS` auto-submit/close, siswa tidak bisa menjawab lagi.
- Siswa boleh submit lebih awal, tapi hasil tetap disembunyikan sampai waktu global berakhir untuk **semua** peserta.

## Autosave
Debounce autosave tiap perubahan jawaban ke server (source of truth). Local draft hanya safety-net terbatas. Retry saat request gagal + connection indicator di UI. Refresh/koneksi putus → attempt tetap bisa dilanjutkan selama belum `LOCKED` dan belum berakhir.

## Anti Answer Leak (WAJIB)
Sebelum exam selesai untuk siswa tsb: jangan kirim correct answer, solution, atau grading data ke client dalam bentuk apa pun (termasuk lewat response API yang "tidak dipakai" di UI). Validasi tetap di backend.

## Proctoring
Kontrol realistis (jangan klaim browser "mustahil ditutup"): request fullscreen, detect visibility change, detect blur/focus, detect tab/window leave, log event, warning counter, policy threshold → `LOCKED`.
**Unlock** hanya oleh permission global `exam_proctor.unlock` — bisa lintas kelompok/program/mapel, ditentukan oleh permission bukan relasi tutor-siswa. Semua LOCK/UNLOCK wajib masuk audit log.

## Result & Analytics
Setelah release (waktu global habis): skor, persentase, grade (bila dipakai), benar/salah, soal salah, solusi, analisis topik, tren performa, waktu pengerjaan.
Per-question analytics: jumlah attempt, jumlah benar/salah, accuracy, distribusi opsi dipilih, response time (bila tersedia). Tutor bisa memilih kumpulan soal untuk "Sesi Pembahasan".

## Latsol (beda dari ujian resmi)
Setelah siswa selesai: langsung tampil benar/salah, jawaban siswa, kunci (jika policy izinkan), solusi (teks/gambar). Feedback instan, bukan menunggu waktu global seperti ujian.

## Ranking
Leaderboard menampilkan nama siswa. Scope: kelompok belajar / tingkat / gedung. Point dari `score_rules` (jangan hardcode formula) + `point_transactions`. Ranking harus punya periode jelas.

## Definition of Done modul ini
- Simulasi exam dengan banyak peserta: semua auto-submit tepat di waktu global habis.
- Tidak ada endpoint yang membocorkan correct answer sebelum release.
- Proctor lock/unlock lintas kelompok berfungsi + tercatat di audit log.
- Demo exam berisi 5 jenis soal + soal matematika + gambar, sesuai `docs/phases/phase-3-learning-exam.md`.
