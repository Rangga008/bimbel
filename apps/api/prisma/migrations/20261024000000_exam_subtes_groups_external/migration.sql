-- Try-out multi-subtes (UTBK/TKA): subtes per mapel dengan timer sendiri,
-- ujian multi-kelompok, opsi rilis hasil, kode gabung kelompok & siswa luar.
-- Kolom mengikuti konvensi proyek: camelCase tanpa @map.

ALTER TABLE "exams" ADD COLUMN "showResultImmediately" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "exam_subtes" (
  "id" TEXT NOT NULL,
  "examId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "subjectId" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "durationMinutes" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "exam_subtes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "exam_subtes_exam_id_idx" ON "exam_subtes"("examId");

ALTER TABLE "exam_items" ADD COLUMN "subtesId" TEXT;
CREATE INDEX "exam_items_subtes_id_idx" ON "exam_items"("subtesId");

CREATE TABLE "exam_attempt_subtes" (
  "id" TEXT NOT NULL,
  "attemptId" TEXT NOT NULL,
  "subtesId" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "submittedAt" TIMESTAMP(3),
  CONSTRAINT "exam_attempt_subtes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "exam_attempt_subtes_attempt_id_subtes_id_key" ON "exam_attempt_subtes"("attemptId", "subtesId");
CREATE INDEX "exam_attempt_subtes_subtes_id_idx" ON "exam_attempt_subtes"("subtesId");

CREATE TABLE "exam_groups" (
  "id" TEXT NOT NULL,
  "examId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  CONSTRAINT "exam_groups_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "exam_groups_exam_id_group_id_key" ON "exam_groups"("examId", "groupId");
CREATE INDEX "exam_groups_group_id_idx" ON "exam_groups"("groupId");

ALTER TABLE "learning_groups" ADD COLUMN "joinCode" TEXT;
CREATE UNIQUE INDEX "learning_groups_join_code_key" ON "learning_groups"("joinCode");

ALTER TABLE "students" ADD COLUMN "isExternal" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "exam_subtes" ADD CONSTRAINT "exam_subtes_exam_id_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exam_subtes" ADD CONSTRAINT "exam_subtes_subject_id_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "exam_items" ADD CONSTRAINT "exam_items_subtes_id_fkey" FOREIGN KEY ("subtesId") REFERENCES "exam_subtes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "exam_attempt_subtes" ADD CONSTRAINT "exam_attempt_subtes_attempt_id_fkey" FOREIGN KEY ("attemptId") REFERENCES "exam_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exam_attempt_subtes" ADD CONSTRAINT "exam_attempt_subtes_subtes_id_fkey" FOREIGN KEY ("subtesId") REFERENCES "exam_subtes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "exam_groups" ADD CONSTRAINT "exam_groups_exam_id_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exam_groups" ADD CONSTRAINT "exam_groups_group_id_fkey" FOREIGN KEY ("groupId") REFERENCES "learning_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
