-- Fase 6 — Snapshot laporan beku (arsip bulanan/tahun ajaran).
-- `payload` JSON menyimpan dokumen laporan utuh supaya nilai tidak berubah
-- walau data sumber diubah setelah snapshot dibuat.
CREATE TABLE "report_snapshots" (
    "id" TEXT NOT NULL,
    "reportKind" VARCHAR(40) NOT NULL,
    "period" VARCHAR(7),
    "title" TEXT NOT NULL,
    "filterText" TEXT,
    "payload" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "report_snapshots_reportKind_period_idx" ON "report_snapshots"("reportKind", "period");
CREATE INDEX "report_snapshots_createdAt_idx" ON "report_snapshots"("createdAt");

ALTER TABLE "report_snapshots"
    ADD CONSTRAINT "report_snapshots_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
