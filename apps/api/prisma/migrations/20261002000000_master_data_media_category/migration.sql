-- Master data mapel + level kelas, dan kategori media (akademik vs finance).

CREATE TABLE "subjects" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "subjects_code_key" ON "subjects"("code");

CREATE TABLE "grade_levels" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "grade_levels_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "grade_levels_code_key" ON "grade_levels"("code");

ALTER TABLE "programs" ADD COLUMN "subjectId" TEXT;
CREATE INDEX "programs_subjectId_idx" ON "programs"("subjectId");
ALTER TABLE "programs" ADD CONSTRAINT "programs_subjectId_fkey"
  FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "levels" ADD COLUMN "gradeLevelId" TEXT;
ALTER TABLE "levels" ADD COLUMN "subjectId" TEXT;
ALTER TABLE "levels" ADD CONSTRAINT "levels_gradeLevelId_fkey"
  FOREIGN KEY ("gradeLevelId") REFERENCES "grade_levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "levels" ADD CONSTRAINT "levels_subjectId_fkey"
  FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Kategori media: ACADEMIC (default) vs FINANCE. Kwitansi yang sudah tergenerate
-- ditandai FINANCE supaya tidak muncul di pustaka akademik.
ALTER TABLE "media_assets" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'ACADEMIC';
CREATE INDEX "media_assets_category_idx" ON "media_assets"("category");
UPDATE "media_assets" SET "category" = 'FINANCE' WHERE "originalName" ILIKE 'Kwitansi-%';
