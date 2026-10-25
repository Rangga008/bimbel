-- Satu siswa = satu attempt per ujian, ditegakkan atomik di DB.
-- Sebelum pasang unique index, buang attempt duplikat lama (sisa celah
-- retake sebelum guard server) — sisakan attempt terbaru per pasangan
-- (examId, studentId); jawaban & progres subtes ikut terhapus via cascade.
DELETE FROM "exam_attempts" a
USING "exam_attempts" b
WHERE a."examId" = b."examId"
  AND a."studentId" = b."studentId"
  AND a."startedAt" < b."startedAt";

CREATE UNIQUE INDEX "exam_attempts_examId_studentId_key"
  ON "exam_attempts"("examId", "studentId");
