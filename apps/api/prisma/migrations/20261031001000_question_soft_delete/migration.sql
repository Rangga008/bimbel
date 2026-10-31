ALTER TABLE "questions" ADD COLUMN "deletedAt" TIMESTAMPTZ;
CREATE INDEX "questions_deletedAt_idx" ON "questions"("deletedAt");
