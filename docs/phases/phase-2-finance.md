# Fase 2 — Finance

**Urutan asli (prompt.md §39):** Langkah 4 (Finance + invoice + payment + receipt + AR) + Langkah 5 (RAB + expense + reports finance).

## Tujuan

Seluruh alur keuangan: penagihan, pembayaran (3 jalur), piutang, RAB/budget, pengeluaran, laporan finance.

## Cakupan

Ikuti `.github/instructions/finance.instructions.md` sepenuhnya. Ringkas cakupan:

- `Invoice`, `InvoiceItem`, `Payment`, `PaymentAllocation`, `Refund`.
- 3 jalur pembayaran: gateway (abstraction, siapkan interface + 1 provider dummy/sandbox), manual upload bukti, cash kantor.
- Piutang (AR): outstanding tracking, reminder status.
- `financial_accounts` (kas/bank) & ledger dasar.
- RAB (budget per kategori) + Expense tracking + variance vs actual.
- Halaman Admin Finance & Owner terkait (Invoice, Pembayaran, Bukti, Kas/Bank, RAB, Pengeluaran, Piutang) — isi dengan data nyata.
- Laporan finance dasar (Excel + PDF) — laporan lanjutan/arsip di Fase 6.

## Di luar cakupan

Payroll (Fase 5), laporan lanjutan/snapshot arsip (Fase 6).

## Definition of Done

- Skenario end-to-end 3 jalur pembayaran teruji manual: gateway sandbox sukses → invoice lunas; upload bukti → pending → admin verifikasi → lunas; cash → langsung lunas.
- Refund partial mengurangi outstanding dengan benar dan tercatat di ledger.
- RAB vs Actual menampilkan variance yang benar untuk minimal 1 kategori dengan data dummy.
- Export invoice ke Excel & PDF berhasil dan headernya sesuai standar §21.

## Prompt siap-pakai untuk Copilot Agent

```
Kerjakan Fase 2 (Finance) sesuai docs/phases/phase-2-finance.md dan .github/instructions/finance.instructions.md.
Gunakan DB transaction untuk semua operasi finansial. Jangan buat kolom per-bulan.
Jika ada hal teknis yang menurutmu perlu ditambahkan di luar cakupan file ini (mis. validasi anti-fraud tambahan), ikuti aturan "Inisiatif Agent" di copilot-instructions.md — jangan langsung implementasi besar, tulis sebagai "Usulan Tambahan".
Setelah selesai, ringkas apa yang dibuat, Definition of Done mana yang terverifikasi, dan sertakan Usulan Tambahan (jika ada).
```
