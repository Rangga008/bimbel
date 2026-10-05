# Fase 4 — Analytics & Ranking

**Urutan asli (prompt.md §39):** Langkah 8 (Analytics + ranking).

## Tujuan
Mengubah data mentah hasil ujian/latsol (dari Fase 3) menjadi insight: analitik per-soal, dashboard performa, dan leaderboard.

## Cakupan
- Per-question analytics: jumlah attempt, akurasi, distribusi opsi dipilih, response time.
- Dashboard performa siswa (tren nilai, topik lemah/kuat) untuk Siswa, Orang Tua, Tutor, Admin Academic.
- `score_rules`: konfigurasi bobot/poin per jenis soal & exam — jangan hardcode formula di kode.
- `point_transactions` + leaderboard scoped (kelompok/tingkat/gedung), dengan periode jelas.
- Halaman Performa, Ranking, Analisis di role terkait — isi data nyata dari hasil Fase 3.

## Di luar cakupan
Payroll, laporan arsip lanjutan.

## Definition of Done
- Leaderboard menampilkan nama siswa dan berubah sesuai `point_transactions` baru.
- Mengubah 1 `score_rule` mengubah perhitungan poin untuk exam berikutnya (bukan retroaktif tanpa perintah eksplisit).
- Per-question analytics benar untuk minimal 1 soal dengan ≥3 attempt dummy.

## Prompt siap-pakai untuk Copilot Agent
```
Kerjakan Fase 4 (Analytics & Ranking) sesuai docs/phases/phase-4-analytics-ranking.md.
Gunakan data attempt/jawaban dari Fase 3 sebagai sumber, jangan duplikasi skema data ujian.
Jika ada hal teknis yang menurutmu perlu ditambahkan di luar cakupan file ini, ikuti aturan "Inisiatif Agent" di copilot-instructions.md — jangan langsung implementasi besar, tulis sebagai "Usulan Tambahan".
Setelah selesai, ringkas apa yang dibuat, Definition of Done mana yang terverifikasi, dan sertakan Usulan Tambahan (jika ada).
```
