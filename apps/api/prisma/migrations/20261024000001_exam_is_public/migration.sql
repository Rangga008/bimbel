-- Ujian bisa ditandai tampil di halaman publik /tryout (promosi peserta luar).
ALTER TABLE "exams" ADD COLUMN IF NOT EXISTS "isPublic" BOOLEAN NOT NULL DEFAULT false;
