# Fase 5a — Tutor Payroll

Bagian pertama Fase 5. Urutan lengkap: **5a Payroll → 5b Notifikasi & WhatsApp.**
Prasyarat: Fase 1 (sesi/kelompok/tutor) & Fase 3 (data mengajar) selesai.

## Tujuan
Menghitung honor tutor dari data operasional yang sudah ada — belum menyentuh notifikasi (itu 5b).

## Cakupan
- `tutor_rates`: tarif per tutor, bisa beda per jenis kerja (sesi reguler, private, kelas tambahan, tugas khusus).
- `tutor_work_items`: catatan kerja tutor yang bisa dihonorkan, diambil dari data Session/Attendance (Fase 1) & data mengajar (Fase 3) — **jangan input manual duplikat**, tarik dari data yang sudah ada.
- Perhitungan payroll per periode: gross (dari work items × rate), adjustment (dengan alasan wajib diisi), net, status pembayaran (belum/sudah dibayar).
- Halaman "Payroll" (Admin Finance, Owner) dan "Profil & Status Kepegawaian" (Tutor, lihat honor sendiri).

## Di luar cakupan
Notifikasi & WhatsApp (5b).

## Definition of Done
- Payroll 1 tutor dengan kombinasi sesi reguler + private + 1 adjustment menghasilkan net pay yang benar dan bisa diaudit ke work items sumbernya (ketahuan dari mana asal tiap angka).
- Tutor bisa melihat rincian honornya sendiri di halaman profil.

## Prompt siap-pakai (ringkas)
```
Kerjakan Fase 5a sesuai docs/phases/phase-5a-payroll.md
dan bagian Payroll di .clinerules/02-finance.md (atau .github/instructions/finance.instructions.md).
Tarik tutor_work_items dari data Session/Attendance/mengajar yang sudah ada, jangan input manual duplikat.
JANGAN kerjakan notifikasi/WhatsApp dulu (itu Fase 5b terpisah).
Kalau ada tambahan teknis di luar ini, tulis "Usulan Tambahan" saja.
Selesai: ringkas hasil + DoD yang terverifikasi.
```
