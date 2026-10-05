# Fase 2b — 3 Jalur Pembayaran

Bagian kedua Fase 2. **Prasyarat: Fase 2a selesai** (Invoice/Payment/PaymentAllocation model sudah ada).
Ini bagian paling kompleks di Fase 2 — pertimbangkan cicil lagi per jalur kalau context/kredit masih terbatas (mis. kerjakan cash dulu, lalu manual upload, lalu gateway, masing-masing task terpisah).

## Tujuan
Implementasi 3 jalur pembayaran wajib.

## Cakupan
1. **Gateway:** interface abstraction + 1 provider dummy/sandbox → webhook → verified → invoice update → receipt. Status final HANYA dari server/webhook, jangan percaya client.
2. **Manual upload bukti:** upload bukti → status PENDING → notifikasi admin → admin verifikasi/reject → invoice update kalau approved.
3. **Cash kantor:** admin input langsung → verifikasi instan → invoice update.
- Semua 3 jalur: pakai DB transaction, hasilkan `Receipt` (field: nomor, tanggal, siswa, item, nominal, metode, status, verifier).
- Halaman "Pembayaran" & "Bukti" (Admin Finance), halaman upload bukti (Orang Tua).

## Di luar cakupan
Refund, piutang/AR tracking (2c), RAB/expense (2d).

## Definition of Done
- 3 skenario end-to-end teruji manual seperti dijelaskan di atas, masing-masing menghasilkan invoice status lunas & receipt.
- Payment gateway TIDAK bisa di-trigger sukses hanya dari request client tanpa webhook valid.

## Prompt siap-pakai (ringkas)
```
Kerjakan Fase 2b sesuai docs/phases/phase-2b-payment-channels.md.
Fase 2a sudah selesai, pakai model yang ada. Kalau context terbatas, minta saya kerjakan 1 jalur pembayaran dulu (mis. cash saja) sebelum lanjut ke jalur lain dalam task terpisah.
Wajib DB transaction, wajib generate Receipt tiap pembayaran sukses.
Kalau ada tambahan teknis di luar ini, tulis "Usulan Tambahan" saja.
Selesai: ringkas hasil + DoD yang terverifikasi.
```
