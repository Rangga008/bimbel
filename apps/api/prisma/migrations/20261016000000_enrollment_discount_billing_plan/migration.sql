-- Diskon/bantuan per siswa (per angsuran) + rencana tagihan cicilan tersimpan
-- supaya invoice bulanan diterbitkan bertahap per bulan, bukan sekaligus.
ALTER TABLE "enrollments"
  ADD COLUMN "discountAmount" DECIMAL(14,2),
  ADD COLUMN "discountMonths" INTEGER,
  ADD COLUMN "discountReason" TEXT,
  ADD COLUMN "billingPlan" JSONB;
