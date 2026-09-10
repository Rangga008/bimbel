---
applyTo: "modules/invoices/**,modules/payments/**,modules/refunds/**,modules/rab/**,modules/expenses/**,modules/payroll/**,modules/reports/**/finance/**"
---

# Instruksi: Finance, Payment, RAB, Payroll

## 3 Jalur Pembayaran (wajib semua ada)
1. **Payment Gateway:** Orang tua → gateway → webhook → verified → invoice update → receipt → notification.
   Status final **hanya** dari server/webhook, jangan pernah percaya callback dari client.
2. **Manual Upload Bukti:** Orang tua pilih invoice → upload bukti → status `PENDING` → notifikasi Admin → Admin verifikasi → invoice update → receipt → masuk `whatsapp_outbox`.
3. **Cash di Kantor:** Admin pilih invoice → input cash payment → verifikasi langsung → receipt → `financial_accounts` (cash) bertambah.

## Model Data (jangan menyimpang)
`Invoice` → `InvoiceItem` → `Payment` → `PaymentAllocation`. Satu payment boleh dialokasikan ke beberapa invoice/item.
**Jangan** buat kolom per-bulan (`JULI`, `AGUSTUS`, dst) — ini kesalahan spreadsheet lama yang harus diperbaiki.
Dukung: pembayaran penuh, cicilan, diskon, refund (full & partial), kelas tambahan, overdue/outstanding tracking.

## Receipt
Field minimal: nomor, tanggal, siswa, program/kelas, item pembayaran, nominal, metode, status, verifier. Sediakan template PDF/print yang familiar seperti kwitansi manual lama.

## RAB / Budget
Kategori awal: Pengadaan Ruang Belajar, Persiapan Tahun Ajaran, Overhead & Rumah Tangga, Logistik & Perawatan, Akademik, Marketing, Kesehatan & Tunjangan, Honor Pegawai, Lain-lain.
Setiap item RAB: category, item, budget, actual, variance, utilization.

## Payroll
Honor dihitung dari: sesi reguler, private, kelas tambahan, tugas tertentu — berbasis `tutor_rates` + `tutor_work_items`, bukan hardcode. Sediakan adjustment dengan alasan wajib diisi. Payroll per periode menampilkan: tutor, work items, rate, gross, adjustment, net, payment status.

## Integritas Data
- **Wajib transaction** untuk: payment verification, payment allocation, refund, invoice update, ledger update, payroll payment.
- **Jangan soft-delete** data transaksi finance apa pun.
- Semua: verifikasi/reject payment, refund, perubahan diskon, adjustment invoice → masuk audit log.

## Export & Laporan
Excel (untuk olah lanjutan) + PDF (arsip/cetak). Header laporan wajib: identitas bimbel, periode, tanggal generated, filter digunakan. Angka laporan berasal dari transaksi tervalidasi, bukan input manual berdiri sendiri. Tangani pembagian nol/data kosong dengan aman — jangan sampai muncul error semacam `#N/A`/`#DIV/0!` seperti di spreadsheet lama.

## Definition of Done modul ini
- Ketiga jalur pembayaran end-to-end berfungsi dengan status yang benar.
- Semua operasi finansial kritis dibungkus transaction.
- Minimal 1 test untuk allocation & refund partial.
- Export Excel/PDF invoice & payment berjalan.
