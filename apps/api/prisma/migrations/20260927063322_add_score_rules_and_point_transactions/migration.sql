-- CreateEnum
CREATE TYPE "PointEventType" AS ENUM ('EXAM_COMPLETED', 'LATSOL_COMPLETED', 'BONUS', 'PENALTY', 'MANUAL_ADJUSTMENT');

-- CreateTable
CREATE TABLE "score_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "entityType" TEXT NOT NULL,
    "entityValue" TEXT,
    "pointsPerUnit" INTEGER NOT NULL DEFAULT 1,
    "bonusThreshold" INTEGER,
    "bonusPoints" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "score_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "point_transactions" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "scoreRuleId" TEXT,
    "eventType" "PointEventType" NOT NULL,
    "points" INTEGER NOT NULL,
    "referenceId" TEXT,
    "referenceType" TEXT,
    "description" TEXT,
    "period" VARCHAR(7) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "point_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "score_rules_name_key" ON "score_rules"("name");

-- CreateIndex
CREATE INDEX "score_rules_entityType_entityValue_idx" ON "score_rules"("entityType", "entityValue");

-- CreateIndex
CREATE INDEX "score_rules_isActive_idx" ON "score_rules"("isActive");

-- CreateIndex
CREATE INDEX "score_rules_validFrom_validTo_idx" ON "score_rules"("validFrom", "validTo");

-- CreateIndex
CREATE INDEX "point_transactions_studentId_idx" ON "point_transactions"("studentId");

-- CreateIndex
CREATE INDEX "point_transactions_eventType_idx" ON "point_transactions"("eventType");

-- CreateIndex
CREATE INDEX "point_transactions_referenceId_idx" ON "point_transactions"("referenceId");

-- CreateIndex
CREATE INDEX "point_transactions_period_idx" ON "point_transactions"("period");

-- CreateIndex
CREATE INDEX "point_transactions_createdAt_idx" ON "point_transactions"("createdAt");

-- AddForeignKey
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_scoreRuleId_fkey" FOREIGN KEY ("scoreRuleId") REFERENCES "score_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
