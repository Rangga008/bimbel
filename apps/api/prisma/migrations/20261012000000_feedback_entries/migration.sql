-- CreateEnum
CREATE TYPE "FeedbackAuthorRole" AS ENUM ('SISWA', 'ORANG_TUA');

-- CreateTable
CREATE TABLE "feedback_entries" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "content" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "authorRole" "FeedbackAuthorRole" NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feedback_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feedback_entries_studentId_weekStart_idx" ON "feedback_entries"("studentId", "weekStart");

-- CreateIndex
CREATE INDEX "feedback_entries_groupId_weekStart_idx" ON "feedback_entries"("groupId", "weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "feedback_entries_groupId_studentId_subjectId_weekStart_key" ON "feedback_entries"("groupId", "studentId", "subjectId", "weekStart");

-- AddForeignKey
ALTER TABLE "feedback_entries" ADD CONSTRAINT "feedback_entries_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "learning_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_entries" ADD CONSTRAINT "feedback_entries_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_entries" ADD CONSTRAINT "feedback_entries_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_entries" ADD CONSTRAINT "feedback_entries_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_entries" ADD CONSTRAINT "feedback_entries_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "parents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
