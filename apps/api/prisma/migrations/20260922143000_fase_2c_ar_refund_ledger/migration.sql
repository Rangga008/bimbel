-- Fase 2c — Piutang reminder, refund, ledger kas/bank.
ALTER TABLE "invoices" ADD COLUMN "reminderStatus" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "invoices" ADD COLUMN "remindedAt" TIMESTAMP(3);

CREATE TABLE "refunds" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "accountId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "cashOut" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ledger_entries" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "paymentId" TEXT,
    "refundId" TEXT,
    "description" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "refunds_number_key" ON "refunds"("number");
CREATE INDEX "refunds_invoiceId_idx" ON "refunds"("invoiceId");
CREATE INDEX "refunds_accountId_idx" ON "refunds"("accountId");
CREATE INDEX "refunds_number_idx" ON "refunds"("number");
CREATE INDEX "ledger_entries_accountId_occurredAt_idx" ON "ledger_entries"("accountId", "occurredAt");
CREATE INDEX "ledger_entries_sourceType_sourceId_idx" ON "ledger_entries"("sourceType", "sourceId");
CREATE INDEX "ledger_entries_paymentId_idx" ON "ledger_entries"("paymentId");
CREATE INDEX "ledger_entries_refundId_idx" ON "ledger_entries"("refundId");

ALTER TABLE "refunds" ADD CONSTRAINT "refunds_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "financial_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "financial_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "refunds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill mutasi IN dari pembayaran yang sudah VERIFIED (Fase 2b).
-- Idempotent: hanya untuk payment yang BELUM punya ledger entry.
INSERT INTO "ledger_entries" ("id", "accountId", "direction", "amount", "sourceType", "sourceId", "paymentId", "description", "occurredAt", "createdAt")
SELECT
    p."id",
    p."accountId",
    'IN',
    p."amount",
    'PAYMENT',
    p."id",
    p."id",
    CONCAT('Pembayaran ', p."method", ' ', p."id"),
    COALESCE(p."paidAt", p."createdAt"),
    CURRENT_TIMESTAMP
FROM "payments" p
WHERE p."status" = 'VERIFIED' AND p."accountId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "ledger_entries" le
    WHERE le."sourceType" = 'PAYMENT' AND le."sourceId" = p."id"
  );
