-- CreateEnum
CREATE TYPE "ExamStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'LOCKED');

-- CreateEnum
CREATE TYPE "ExamAttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED');

-- CreateTable
CREATE TABLE "exams" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "scheduledStartAt" TIMESTAMP(3) NOT NULL,
    "scheduledEndAt" TIMESTAMP(3) NOT NULL,
    "status" "ExamStatus" NOT NULL DEFAULT 'DRAFT',
    "maxScore" INTEGER NOT NULL DEFAULT 0,
    "durationMinutes" INTEGER,
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_items" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "points" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "exam_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_attempts" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "ExamAttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "score" INTEGER NOT NULL DEFAULT 0,
    "maxScore" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "lateByMs" INTEGER,

    CONSTRAINT "exam_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_answers" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "selectedOptionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "textAnswer" TEXT,
    "isCorrect" BOOLEAN,
    "score" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exams_status_idx" ON "exams"("status");

-- CreateIndex
CREATE INDEX "exams_scheduledStartAt_idx" ON "exams"("scheduledStartAt");

-- CreateIndex
CREATE INDEX "exams_scheduledEndAt_idx" ON "exams"("scheduledEndAt");

-- CreateIndex
CREATE INDEX "exam_items_examId_idx" ON "exam_items"("examId");

-- CreateIndex
CREATE INDEX "exam_items_questionId_idx" ON "exam_items"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "exam_items_examId_questionId_key" ON "exam_items"("examId", "questionId");

-- CreateIndex
CREATE INDEX "exam_attempts_examId_idx" ON "exam_attempts"("examId");

-- CreateIndex
CREATE INDEX "exam_attempts_studentId_idx" ON "exam_attempts"("studentId");

-- CreateIndex
CREATE INDEX "exam_attempts_status_idx" ON "exam_attempts"("status");

-- CreateIndex
CREATE INDEX "exam_attempts_startedAt_idx" ON "exam_attempts"("startedAt");

-- CreateIndex
CREATE INDEX "exam_answers_attemptId_idx" ON "exam_answers"("attemptId");

-- CreateIndex
CREATE INDEX "exam_answers_questionId_idx" ON "exam_answers"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "exam_answers_attemptId_questionId_key" ON "exam_answers"("attemptId", "questionId");

-- AddForeignKey
ALTER TABLE "exam_items" ADD CONSTRAINT "exam_items_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_items" ADD CONSTRAINT "exam_items_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_answers" ADD CONSTRAINT "exam_answers_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "exam_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_answers" ADD CONSTRAINT "exam_answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
