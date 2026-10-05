-- Fase 5a — Tutor Payroll.
-- tutor_rates: tarif honor per tutor per jenis kerja (masa berlaku).
-- tutor_work_items: catatan kerja yang bisa dihonorkan — sesi COMPLETED
--   ditarik otomatis (sessionId unik = guard anti duplikat), tugas khusus manual.
-- payroll_runs + payroll_adjustments: payroll per tutor per periode (YYYY-MM),
--   adjustment wajib alasan, sekali PAID tidak diubah lagi.
CREATE TYPE "TutorWorkType" AS ENUM (
    'REGULAR_SESSION',
    'PRIVATE_SESSION',
    'EXTRA_CLASS',
    'SPECIAL_TASK'
);

CREATE TYPE "PayrollRunStatus" AS ENUM (
    'UNPAID',
    'PAID'
);

CREATE TABLE "tutor_rates" (
    "id" TEXT NOT NULL,
    "tutorId" TEXT NOT NULL,
    "workType" "TutorWorkType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "unit" VARCHAR(10) NOT NULL DEFAULT 'SESSION',
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tutor_rates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tutor_rates_tutorId_workType_idx" ON "tutor_rates"("tutorId", "workType");
CREATE INDEX "tutor_rates_effectiveFrom_idx" ON "tutor_rates"("effectiveFrom");

CREATE TABLE "tutor_work_items" (
    "id" TEXT NOT NULL,
    "tutorId" TEXT NOT NULL,
    "workType" "TutorWorkType" NOT NULL,
    "sourceType" VARCHAR(10) NOT NULL DEFAULT 'SESSION',
    "sessionId" TEXT,
    "period" VARCHAR(7) NOT NULL,
    "description" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "quantity" DECIMAL(14,2) NOT NULL DEFAULT 1,
    "rateId" TEXT,
    "unitAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "payrollRunId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tutor_work_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tutor_work_items_sessionId_key" ON "tutor_work_items"("sessionId");
CREATE INDEX "tutor_work_items_tutorId_period_idx" ON "tutor_work_items"("tutorId", "period");
CREATE INDEX "tutor_work_items_payrollRunId_idx" ON "tutor_work_items"("payrollRunId");
CREATE INDEX "tutor_work_items_occurredAt_idx" ON "tutor_work_items"("occurredAt");

CREATE TABLE "payroll_runs" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "tutorId" TEXT NOT NULL,
    "period" VARCHAR(7) NOT NULL,
    "grossAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "adjustmentAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'UNPAID',
    "accountId" TEXT,
    "expenseId" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidBy" TEXT,
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payroll_runs_number_key" ON "payroll_runs"("number");
CREATE UNIQUE INDEX "payroll_runs_tutorId_period_key" ON "payroll_runs"("tutorId", "period");
CREATE INDEX "payroll_runs_period_idx" ON "payroll_runs"("period");
CREATE INDEX "payroll_runs_status_idx" ON "payroll_runs"("status");

CREATE TABLE "payroll_adjustments" (
    "id" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_adjustments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payroll_adjustments_payrollRunId_idx" ON "payroll_adjustments"("payrollRunId");

ALTER TABLE "tutor_rates" ADD CONSTRAINT "tutor_rates_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "tutors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tutor_work_items" ADD CONSTRAINT "tutor_work_items_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "tutors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tutor_work_items" ADD CONSTRAINT "tutor_work_items_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tutor_work_items" ADD CONSTRAINT "tutor_work_items_rateId_fkey" FOREIGN KEY ("rateId") REFERENCES "tutor_rates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tutor_work_items" ADD CONSTRAINT "tutor_work_items_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "payroll_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "tutors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "financial_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
