-- Nomor rekening + atas nama pada akun kas/bank — ditampilkan ke orang tua
-- sebagai tujuan transfer saat upload bukti pembayaran manual.
-- IF NOT EXISTS supaya aman diulang pada DB yang sudah diubah manual.

ALTER TABLE "financial_accounts" ADD COLUMN IF NOT EXISTS "accountNumber" TEXT;
ALTER TABLE "financial_accounts" ADD COLUMN IF NOT EXISTS "holderName" TEXT;
