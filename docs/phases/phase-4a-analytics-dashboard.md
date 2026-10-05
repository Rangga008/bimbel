# Fase 4a — Per-Question Analytics & Performance Dashboard

Bagian pertama Fase 4. Urutan lengkap: **4a Analytics & Dashboard → 4b Score Rules & Ranking.**
Prasyarat: Fase 3 (3a-3e) selesai — sudah ada exam-attempts, jawaban, hasil ujian.

## Tujuan
Mengubah data mentah hasil ujian/latsol jadi insight yang bisa dibaca — murni agregasi/tampilan, belum ada logic poin/ranking (itu 4b).

## Cakupan
- Per-question analytics: jumlah attempt, akurasi, distribusi opsi dipilih, response time — dihitung dari data `exam-attempts`/jawaban Fase 3, **jangan duplikasi skema data ujian**.
- Dashboard performa siswa (tren nilai antar-exam, topik lemah/kuat berdasar tag/kategori soal) untuk Siswa, Orang Tua, Tutor, Admin Academic.
- Halaman "Performa" & "Analisis" (role terkait) diisi data nyata.

## Di luar cakupan
`score_rules`, `point_transactions`, leaderboard/ranking (4b).

## Definition of Done
- Per-question analytics benar untuk minimal 1 soal dengan ≥3 attempt dummy (accuracy & distribusi opsi sesuai perhitungan manual).
- Dashboard performa siswa menampilkan tren dari ≥2 exam berbeda.

## Prompt siap-pakai (ringkas)
```
Kerjakan Fase 4a sesuai docs/phases/phase-4a-analytics-dashboard.md.
Gunakan data attempt/jawaban dari Fase 3 sebagai sumber, jangan duplikasi skema data ujian.
JANGAN kerjakan score_rules/ranking dulu (itu Fase 4b terpisah).
Kalau ada tambahan teknis di luar ini, tulis "Usulan Tambahan" saja.
Selesai: ringkas hasil + DoD yang terverifikasi.
```
