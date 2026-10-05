-- Fase 2b — 3 jalur pembayaran: kolom channel/bukti/gateway di payments + tabel receipts.
ALTER TABLE "payments" ADD COLUMN "studentId" TEXT;
ALTER TABLE "payments" ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "payments" ADD COLUMN "provider" TEXT;
ALTER TABLE "payments" ADD COLUMN "providerRef" TEXT;
ALTER TABLE "payments" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "payments" ADD COLUMN "proofUrl" TEXT;
ALTER TABLE "payments" ADD COLUMN "proofNote" TEXT;
ALTER TABLE "payments" ADD COLUMN "rejectReason" TEXT;
ALTER TABLE "payments" ADD COLUMN "verifiedBy" TEXT;
ALTER TABLE "payments" ADD COLUMN "verifiedAt" TIMESTAMP(3);
ALTER TABLE "payments" ADD COLUMN "createdBy" TEXT;

-- Kwitansi otomatis tiap pembayaran sukses (verified).
CREATE TABLE "receipts" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "studentId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "method" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'VERIFIED',
    "verifierId" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "receipts_number_key" ON "receipts"("number");
CREATE UNIQUE INDEX "payments_idempotencyKey_key" ON "payments"("idempotencyKey");
CREATE INDEX "payments_studentId_idx" ON "payments"("studentId");
CREATE INDEX "payments_channel_idx" ON "payments"("channel");
CREATE INDEX "payments_providerRef_idx" ON "payments"("providerRef");
CREATE INDEX "receipts_paymentId_idx" ON "receipts"("paymentId");
CREATE INDEX "receipts_invoiceId_idx" ON "receipts"("invoiceId");
CREATE INDEX "receipts_studentId_idx" ON "receipts"("studentId");
CREATE INDEX "receipts_number_idx" ON "receipts"("number");

ALTER TABLE "receipts" ADD CONSTRAINT "receipts_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
