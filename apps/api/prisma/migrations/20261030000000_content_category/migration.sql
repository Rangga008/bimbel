-- Kategorisasi konten per jenjang→mapel→tipe (materi, bank soal, latsol, ujian).
CREATE TYPE "ContentCategory" AS ENUM ('HARIAN', 'UTS', 'TO', 'UAS', 'BAB');

ALTER TABLE "materials" ADD COLUMN "category" "ContentCategory";
ALTER TABLE "questions" ADD COLUMN "category" "ContentCategory";
ALTER TABLE "latsol_packages" ADD COLUMN "category" "ContentCategory";
ALTER TABLE "exams"
  ADD COLUMN "programId" TEXT,
  ADD COLUMN "levelId" TEXT,
  ADD COLUMN "subjectId" TEXT,
  ADD COLUMN "category" "ContentCategory";

ALTER TABLE "exams" ADD CONSTRAINT "exams_programId_fkey"
  FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "exams" ADD CONSTRAINT "exams_levelId_fkey"
  FOREIGN KEY ("levelId") REFERENCES "levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "exams" ADD CONSTRAINT "exams_subjectId_fkey"
  FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "exams_programId_idx" ON "exams"("programId");
CREATE INDEX "exams_levelId_idx" ON "exams"("levelId");
CREATE INDEX "exams_subjectId_idx" ON "exams"("subjectId");
CREATE INDEX "exams_category_idx" ON "exams"("category");
