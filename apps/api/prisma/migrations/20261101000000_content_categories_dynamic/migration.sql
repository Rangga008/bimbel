-- Kategori konten dinamis: enum ContentCategory → tabel content_categories.
CREATE TABLE "content_categories" (
  "id"         TEXT PRIMARY KEY,
  "code"       TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "sortOrder"  INTEGER NOT NULL DEFAULT 0,
  "isActive"   BOOLEAN NOT NULL DEFAULT true,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "content_categories_code_key" ON "content_categories"("code");

-- Seed kategori bawaan (nilai lama tetap valid — kolom disimpan sebagai teks).
INSERT INTO "content_categories" ("id","code","name","sortOrder","isActive","createdAt","updatedAt") VALUES
  ('cc-harian','HARIAN','Latihan / Ujian Harian',10,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('cc-uts','UTS','UTS',20,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('cc-to','TO','Try Out (TO)',30,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('cc-uas','UAS','UAS',40,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('cc-bab','BAB','Ujian Bab / Materi',50,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

-- Kolom category enum → text (nilai lama dipertahankan apa adanya).
ALTER TABLE "materials"        ALTER COLUMN "category" TYPE TEXT USING "category"::text;
ALTER TABLE "questions"        ALTER COLUMN "category" TYPE TEXT USING "category"::text;
ALTER TABLE "latsol_packages"  ALTER COLUMN "category" TYPE TEXT USING "category"::text;
ALTER TABLE "exams"            ALTER COLUMN "category" TYPE TEXT USING "category"::text;

DROP TYPE "ContentCategory";
