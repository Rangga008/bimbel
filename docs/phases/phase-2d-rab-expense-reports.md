# Fase 2d — RAB, Expense & Laporan Finance

Bagian terakhir Fase 2. **Prasyarat: Fase 2a-2c selesai.**

## Tujuan
Budget planning (RAB), pengeluaran, dan laporan finance dasar — penutup Fase 2.

## Cakupan
- RAB: kategori (Pengadaan Ruang Belajar, Persiapan Tahun Ajaran, Overhead & Rumah Tangga, Logistik & Perawatan, Akademik, Marketing, Kesehatan & Tunjangan, Honor Pegawai, Lain-lain), tiap kategori: budget vs actual vs variance.
- Expense: catat pengeluaran, terhubung ke kategori RAB & `financial_accounts` (kurangi saldo kas/bank).
- Laporan finance dasar: Excel + PDF untuk Invoice, Payment, RAB vs Actual. Header wajib: identitas bimbel, periode, tanggal generated, filter dipakai. Tangani data kosong dengan aman (tidak ada `#N/A`/`#DIV/0!`).
- Halaman "RAB", "Pengeluaran", "Laporan" (Admin Finance, Owner).

## Di luar cakupan
Payroll (Fase 5), laporan lanjutan/snapshot arsip lintas modul (Fase 6) — laporan di sini cukup untuk data Fase 2 saja.

## Definition of Done — sekaligus penutup seluruh Fase 2
- RAB vs Actual menampilkan variance benar untuk minimal 1 kategori dengan data dummy dari Expense nyata.
- Export Invoice & RAB vs Actual ke Excel & PDF berhasil, header sesuai standar.
- **Cek ulang seluruh Fase 2**: dashboard Admin Finance & Owner menampilkan data finance nyata (bukan skeleton) — invoice, outstanding, kas/bank, RAB summary.

## Prompt siap-pakai (ringkas)
```
Kerjakan Fase 2d sesuai docs/phases/phase-2d-rab-expense-reports.md.
Fase 2a-2c sudah selesai, pakai financial_accounts yang ada untuk Expense.
Setelah fase ini, seluruh Fase 2 (Finance) dianggap tuntas — verifikasi ulang DoD gabungan di akhir file ini.
Kalau ada tambahan teknis di luar ini, tulis "Usulan Tambahan" saja.
Selesai: ringkas hasil + DoD yang terverifikasi.
```
