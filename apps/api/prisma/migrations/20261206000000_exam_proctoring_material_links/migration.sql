-- Flag proteksi ujian (fullscreen + kunci saat keluar) dan tautan
-- materi → paket latsol / ujian pilihan admin.
ALTER TABLE "exams" ADD COLUMN IF NOT EXISTS "proctoringEnabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "materials" ADD COLUMN IF NOT EXISTS "latsolPackageId" TEXT;
ALTER TABLE "materials" ADD COLUMN IF NOT EXISTS "examId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'materials_latsolPackageId_fkey'
  ) THEN
    ALTER TABLE "materials" ADD CONSTRAINT "materials_latsolPackageId_fkey"
      FOREIGN KEY ("latsolPackageId") REFERENCES "latsol_packages"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'materials_examId_fkey'
  ) THEN
    ALTER TABLE "materials" ADD CONSTRAINT "materials_examId_fkey"
      FOREIGN KEY ("examId") REFERENCES "exams"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
