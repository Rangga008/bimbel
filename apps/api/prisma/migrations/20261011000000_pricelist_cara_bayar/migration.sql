-- Pricelist brosur: cara bayar per jenjang (lunas awal / 2x / bulanan),
-- promo extra, tier privat per jumlah siswa, dan rencana pembayaran enrollment.

ALTER TYPE "PriceUnit" ADD VALUE 'YEAR';
CREATE TYPE "PaymentPlan" AS ENUM ('FULL', 'TWO_TIMES', 'MONTHLY');

ALTER TABLE "levels"
  ADD COLUMN "fullPayPrice" DECIMAL(12,2),
  ADD COLUMN "installment2x" DECIMAL(12,2),
  ADD COLUMN "monthlyAmount" DECIMAL(12,2),
  ADD COLUMN "monthlyCount" INTEGER,
  ADD COLUMN "promoPrice" DECIMAL(12,2),
  ADD COLUMN "sessionPrices" JSONB,
  ADD COLUMN "sessionDurationMin" INTEGER;

ALTER TABLE "enrollments"
  ADD COLUMN "paymentPlan" "PaymentPlan",
  ADD COLUMN "studentCount" INTEGER,
  ADD COLUMN "sessionCount" INTEGER;

ALTER TABLE "invoices"
  ADD COLUMN "enrollmentId" TEXT;

CREATE INDEX "invoices_enrollmentId_idx" ON "invoices"("enrollmentId");

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "enrollments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
