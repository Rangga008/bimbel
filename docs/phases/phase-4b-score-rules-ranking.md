# Fase 4b — Score Rules & Ranking

Bagian terakhir Fase 4. **Prasyarat: Fase 4a selesai.**

## Tujuan
Sistem poin & leaderboard — penutup Fase 4.

## Cakupan
- `score_rules`: konfigurasi bobot/poin per jenis soal & exam (data-driven, **jangan hardcode formula** di kode) — perubahan 1 rule hanya berlaku untuk exam berikutnya, bukan retroaktif.
- `point_transactions`: histori poin per siswa per event (exam selesai, dsb).
- Leaderboard scoped (kelompok/tingkat/gedung) dengan periode jelas (mis. per bulan/semester).
- Halaman "Ranking" (role terkait) diisi data nyata.

## Di luar cakupan
Payroll (Fase 5), laporan arsip lanjutan (Fase 6).

## Definition of Done — sekaligus penutup seluruh Fase 4
- Leaderboard menampilkan nama siswa dan berubah sesuai `point_transactions` baru.
- Mengubah 1 `score_rule` mengubah perhitungan poin untuk exam berikutnya (bukan retroaktif tanpa perintah eksplisit).
- **Cek ulang Fase 4**: halaman Performa (4a) dan Ranking (4b) konsisten — siswa dengan nilai tinggi di dashboard performa juga muncul wajar di leaderboard.

## Prompt siap-pakai (ringkas)
```
Kerjakan Fase 4b sesuai docs/phases/phase-4b-score-rules-ranking.md.
Fase 4a sudah selesai, pakai data analytics yang ada.
score_rules HARUS data-driven, jangan hardcode formula. Perubahan rule tidak retroaktif.
Setelah ini, seluruh Fase 4 dianggap tuntas.
Kalau ada tambahan teknis di luar ini, tulis "Usulan Tambahan" saja.
Selesai: ringkas hasil + DoD yang terverifikasi.
```
