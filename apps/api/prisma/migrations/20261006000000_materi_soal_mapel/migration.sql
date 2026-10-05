-- Materi: isi teks + gambar pendukung
ALTER TABLE "materials" ADD COLUMN "content" TEXT;
ALTER TABLE "materials" ADD COLUMN "imageUrl" TEXT;

-- Soal: mapel untuk pemisahan bank soal + scope tutor se-mapel
ALTER TABLE "questions" ADD COLUMN "subjectId" TEXT;
ALTER TABLE "questions" ADD CONSTRAINT "questions_subjectId_fkey"
  FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "questions_subjectId_idx" ON "questions"("subjectId");

-- Opsi soal: dukung opsi bergambar (content jadi opsional bila ada imageUrl)
ALTER TABLE "question_options" ALTER COLUMN "content" SET DEFAULT '';
ALTER TABLE "question_options" ADD COLUMN "imageUrl" TEXT;

-- Paket latsol: mapel
ALTER TABLE "latsol_packages" ADD COLUMN "subjectId" TEXT;
ALTER TABLE "latsol_packages" ADD CONSTRAINT "latsol_packages_subjectId_fkey"
  FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "latsol_packages_subjectId_idx" ON "latsol_packages"("subjectId");

-- Backfill subjectId soal dari level.subjectId → fallback program.subjectId
UPDATE "questions" q SET "subjectId" = l."subjectId"
  FROM "levels" l WHERE q."levelId" = l.id AND q."subjectId" IS NULL AND l."subjectId" IS NOT NULL;
UPDATE "questions" q SET "subjectId" = p."subjectId"
  FROM "programs" p WHERE q."programId" = p.id AND q."subjectId" IS NULL AND p."subjectId" IS NOT NULL;

-- Backfill subjectId paket latsol dari level → program
UPDATE "latsol_packages" lp SET "subjectId" = l."subjectId"
  FROM "levels" l WHERE lp."levelId" = l.id AND lp."subjectId" IS NULL AND l."subjectId" IS NOT NULL;
UPDATE "latsol_packages" lp SET "subjectId" = p."subjectId"
  FROM "programs" p WHERE lp."programId" = p.id AND lp."subjectId" IS NULL AND p."subjectId" IS NOT NULL;
