# Fase 2a — Invoice & Core Finance Data Model

Bagian pertama Fase 2 (Finance). Urutan lengkap: **2a Invoice & Core Model → 2b Payment Channels → 2c AR/Refund/Kas → 2d RAB/Expense/Laporan.**
Prasyarat: Fase 1 (1a-1d) & 0b selesai — sudah ada Student, Package.

## Tujuan
Skema data & CRUD dasar untuk tagihan, tanpa alur pembayaran dulu (itu 2b).

## Cakupan
- Model: `Invoice`, `InvoiceItem`, `Payment`, `PaymentAllocation`, `financial_accounts` (kas/bank, minimal 2 akun: Kas & Bank).
- **Jangan buat kolom per-bulan** (`JULI`, dst) — struktur di atas sudah final.
- CRUD Invoice: buat invoice dari Package siswa (auto-generate item dari harga paket), list, detail.
- Halaman "Invoice" (Admin Finance) — list + detail, status masih manual/belum ada pembayaran nyata.
- **Belum** ada logic pembayaran/verifikasi — itu Fase 2b.

## Di luar cakupan
3 jalur pembayaran (2b), refund/piutang (2c), RAB/expense (2d).

## Definition of Done
- Invoice otomatis ter-generate saat siswa didaftarkan ke Package (dari data Fase 1).
- Halaman Invoice admin menampilkan list & detail dengan item benar.

## Prompt siap-pakai (ringkas, untuk context window kecil)
```
Kerjakan Fase 2a sesuai docs/phases/phase-2a-invoice-core.md.
Lingkup: model Invoice/InvoiceItem/Payment/PaymentAllocation/financial_accounts + CRUD Invoice saja. JANGAN kerjakan payment channel, refund, RAB dulu.
Jangan buat kolom per-bulan di DB.
Kalau ada tambahan teknis di luar ini, tulis "Usulan Tambahan" saja, jangan langsung dikerjakan.
Selesai: ringkas hasil + DoD yang terverifikasi.
```
