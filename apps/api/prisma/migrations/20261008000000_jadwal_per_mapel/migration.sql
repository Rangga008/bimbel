-- Jadwal per mapel: satu kelompok/program paket bisa punya beberapa jadwal
-- mingguan dengan mapel berbeda (mis. Paket Intensif SMA → MTK, Fisika, dst).
ALTER TABLE "schedules" ADD COLUMN "subjectId" TEXT;

ALTER TABLE "schedules" ADD CONSTRAINT "schedules_subjectId_fkey"
  FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE SET NULL;

CREATE INDEX "schedules_subjectId_idx" ON "schedules"("subjectId");
