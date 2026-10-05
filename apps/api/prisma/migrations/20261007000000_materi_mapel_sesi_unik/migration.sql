-- Satu jadwal tidak boleh punya 2 sesi di jam mulai yang sama.
CREATE UNIQUE INDEX "sessions_scheduleId_startsAt_key" ON "sessions"("scheduleId", "startsAt");

-- Materi: mapel (landing per-mapel seperti bank soal)
ALTER TABLE "materials" ADD COLUMN "subjectId" TEXT;
ALTER TABLE "materials" ADD CONSTRAINT "materials_subjectId_fkey"
  FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "materials_subjectId_idx" ON "materials"("subjectId");

-- Backfill subjectId materi dari level → program
UPDATE "materials" m SET "subjectId" = l."subjectId"
  FROM "levels" l WHERE m."levelId" = l.id AND m."subjectId" IS NULL AND l."subjectId" IS NOT NULL;
UPDATE "materials" m SET "subjectId" = p."subjectId"
  FROM "programs" p WHERE m."programId" = p.id AND m."subjectId" IS NULL AND p."subjectId" IS NOT NULL;
