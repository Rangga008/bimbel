-- Mapel per sesi konkret (penugasan tutor ad-hoc di luar template jadwal).
ALTER TABLE "sessions" ADD COLUMN "subjectId" TEXT;

CREATE INDEX "sessions_subjectId_idx" ON "sessions"("subjectId");

ALTER TABLE "sessions" ADD CONSTRAINT "sessions_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
