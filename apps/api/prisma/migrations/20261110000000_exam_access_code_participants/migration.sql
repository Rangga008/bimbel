-- Kode akses ujian + tabel peserta-via-kode (untuk siswa luar / token ujian).
-- Kolom mengikuti konvensi proyek: camelCase tanpa @map.

ALTER TABLE "exams" ADD COLUMN "accessCode" TEXT;
CREATE UNIQUE INDEX "exams_accessCode_key" ON "exams"("accessCode");

CREATE TABLE "exam_participants" (
  "examId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "exam_participants_pkey" PRIMARY KEY ("examId", "studentId")
);
CREATE INDEX "exam_participants_studentId_idx" ON "exam_participants"("studentId");

ALTER TABLE "exam_participants"
  ADD CONSTRAINT "exam_participants_examId_fkey"
  FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE;
ALTER TABLE "exam_participants"
  ADD CONSTRAINT "exam_participants_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE;
