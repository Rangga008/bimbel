-- Fase 2d — RAB (Budget) + Expense operasional.
-- Budget unik per (category, period). Expense terhubung ke budget (opsional)
-- dan ke financial_accounts (wajib; saldo kas/bank via ledger_entries OUT).
CREATE TYPE "BudgetCategory" AS ENUM (
    'PENGADAAN_RUANG_BELAJAR',
    'PERSIAPAN_TAHUN_AJARAN',
    'OVERHEAD_RUMAH_TANGGA',
    'LOGISTIK_PERAWATAN',
    'AKADEMIK',
    'MARKETING',
    'KESEHATAN_TUNJANGAN',
    'HONOR_PEGAWAI',
    'LAIN_LAIN'
);

CREATE TABLE "budgets" (
    "id" TEXT NOT NULL,
    "category" "BudgetCategory" NOT NULL,
    "period" VARCHAR(7) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "budgets_category_period_key" ON "budgets"("category", "period");
CREATE INDEX "budgets_period_idx" ON "budgets"("period");
CREATE INDEX "budgets_category_idx" ON "budgets"("category");

CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT,
    "accountId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "description" TEXT NOT NULL,
    "category" "BudgetCategory" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receiptUrl" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "expenses_budgetId_idx" ON "expenses"("budgetId");
CREATE INDEX "expenses_accountId_idx" ON "expenses"("accountId");
CREATE INDEX "expenses_category_idx" ON "expenses"("category");
CREATE INDEX "expenses_occurredAt_idx" ON "expenses"("occurredAt");

ALTER TABLE "expenses" ADD CONSTRAINT "expenses_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "financial_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
