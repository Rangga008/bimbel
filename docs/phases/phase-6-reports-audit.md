# Fase 6 — Laporan Lanjutan & Audit Hardening

**Urutan asli (prompt.md §39):** Langkah 11 (Advanced reports / archive) + pengerasan audit logging lintas modul.

## Tujuan

Menyempurnakan laporan operasional & keuangan agar layak menggantikan spreadsheet lama sepenuhnya, plus memastikan audit log konsisten di seluruh aplikasi.

## Cakupan

- Laporan lanjutan lintas modul: operasional (kehadiran, kelompok, tutor), akademik (nilai, ranking, progres), keuangan (revenue, piutang, RAB vs actual, payroll).
- Snapshot laporan (arsip bulanan/tahun ajaran) — laporan tersimpan sebagai data beku, tidak berubah walau data sumber berubah setelahnya.
- Audit trail lengkap: verifikasi semua aksi kritis di §"Aturan Bisnis" `copilot-instructions.md` benar-benar tercatat (cross-check ke seluruh modul Fase 1–5).
- Halaman Audit (Owner) dengan filter actor/action/entity/periode.
- Perbaiki handling data kosong/pembagian nol di semua laporan (tidak boleh muncul error seperti `#N/A`/`#DIV/0!`).

## Di luar cakupan

Optimasi performa & deployment (Fase 7).

## Definition of Done

- Snapshot laporan bulan berjalan tidak berubah nilainya walau data sumber diubah setelah snapshot dibuat.
- Audit log ditemukan untuk sampel acak 10 aksi kritis dari modul berbeda (finance, exam, attendance, RBAC).
- Semua laporan export Excel/PDF menangani dataset kosong tanpa error.

## Prompt siap-pakai untuk Copilot Agent

```
Kerjakan Fase 6 (Laporan Lanjutan & Audit Hardening) sesuai docs/phases/phase-6-reports-audit.md.
Audit seluruh modul Fase 1-5 untuk memastikan audit log konsisten, jangan hanya tambah fitur baru.
Jika ada hal teknis yang menurutmu perlu ditambahkan di luar cakupan file ini, ikuti aturan "Inisiatif Agent" di copilot-instructions.md — jangan langsung implementasi besar, tulis sebagai "Usulan Tambahan".
Setelah selesai, laporkan modul mana yang tadinya belum punya audit log dan sudah diperbaiki, dan sertakan Usulan Tambahan (jika ada).
```
