-- Fase 4b: guard anti double-credit — satu score_rule hanya boleh mencatat
-- satu transaksi per (eventType, referenceType, referenceId). Baris dengan
-- referenceId/scoreRuleId NULL (manual adjustment, bonus/penalty) tetap boleh
-- duplikat karena Postgres menganggap NULL distinct dalam unique index.
CREATE UNIQUE INDEX "point_transactions_eventType_referenceType_referenceId_scoreRuleId_key"
    ON "point_transactions"("eventType", "referenceType", "referenceId", "scoreRuleId");
