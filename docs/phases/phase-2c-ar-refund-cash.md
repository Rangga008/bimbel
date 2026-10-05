# Fase 2c — Piutang (AR), Refund & Kas/Bank

Bagian ketiga Fase 2. **Prasyarat: Fase 2b selesai** (payment channels jalan, Receipt ada).

## Tujuan
Tracking piutang, alur refund, dan pembukuan kas/bank.

## Cakupan
- Piutang (AR): outstanding per siswa/invoice, status reminder (belum kirim WA — itu Fase 5, cukup flag status di DB).
- `Refund`: full & partial, mengurangi outstanding, tercatat ke ledger `financial_accounts`, wajib audit log.
- Halaman "Piutang" (Admin Finance, Owner), halaman "Kas/Bank" (mutasi masuk-keluar dari payment & refund).

## Di luar cakupan
RAB/expense/laporan (2d).

## Definition of Done
- Refund partial 1 invoice mengurangi outstanding dengan benar dan tercatat di `audit_logs`.
- Halaman Piutang menampilkan daftar invoice outstanding terurut jatuh tempo.
- Mutasi Kas/Bank konsisten dengan seluruh payment & refund yang sudah terjadi (saldo bisa direkonsiliasi manual).

## Prompt siap-pakai (ringkas)
```
Kerjakan Fase 2c sesuai docs/phases/phase-2c-ar-refund-cash.md.
Fase 2b sudah selesai, pakai model Payment/Receipt yang ada.
Refund & koreksi piutang wajib masuk audit_logs.
Kalau ada tambahan teknis di luar ini, tulis "Usulan Tambahan" saja.
Selesai: ringkas hasil + DoD yang terverifikasi.
```
