-- CreateEnum
CREATE TYPE "LatsolAttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER', 'ESSAY');

-- CreateTable
CREATE TABLE "latsol_packages" (
    "id" TEXT NOT NULL,
    "programId" TEXT,
    "levelId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "latsol_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "latsol_package_items" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "latsol_package_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "latsol_attempts" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "LatsolAttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "score" INTEGER NOT NULL DEFAULT 0,
    "maxScore" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),

    CONSTRAINT "latsol_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "latsol_answers" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "selectedOptionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "textAnswer" TEXT,
    "isCorrect" BOOLEAN,
    "score" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "latsol_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "materials" (
    "id" TEXT NOT NULL,
    "programId" TEXT,
    "levelId" TEXT,
    "groupId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "fileUrl" TEXT,
    "fileType" TEXT,
    "fileSize" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" TEXT NOT NULL,
    "programId" TEXT,
    "levelId" TEXT,
    "type" "QuestionType" NOT NULL,
    "content" TEXT NOT NULL,
    "imageUrl" TEXT,
    "difficulty" TEXT,
    "points" INTEGER,
    "explanation" TEXT,
    "answerKey" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_options" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "latsol_packages_programId_idx" ON "latsol_packages"("programId");

-- CreateIndex
CREATE INDEX "latsol_packages_levelId_idx" ON "latsol_packages"("levelId");

-- CreateIndex
CREATE INDEX "latsol_packages_isActive_idx" ON "latsol_packages"("isActive");

-- CreateIndex
CREATE INDEX "latsol_package_items_packageId_idx" ON "latsol_package_items"("packageId");

-- CreateIndex
CREATE INDEX "latsol_package_items_questionId_idx" ON "latsol_package_items"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "latsol_package_items_packageId_questionId_key" ON "latsol_package_items"("packageId", "questionId");

-- CreateIndex
CREATE INDEX "latsol_attempts_packageId_idx" ON "latsol_attempts"("packageId");

-- CreateIndex
CREATE INDEX "latsol_attempts_studentId_idx" ON "latsol_attempts"("studentId");

-- CreateIndex
CREATE INDEX "latsol_attempts_status_idx" ON "latsol_attempts"("status");

-- CreateIndex
CREATE INDEX "latsol_answers_attemptId_idx" ON "latsol_answers"("attemptId");

-- CreateIndex
CREATE INDEX "latsol_answers_questionId_idx" ON "latsol_answers"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "latsol_answers_attemptId_questionId_key" ON "latsol_answers"("attemptId", "questionId");

-- CreateIndex
CREATE INDEX "materials_programId_idx" ON "materials"("programId");

-- CreateIndex
CREATE INDEX "materials_levelId_idx" ON "materials"("levelId");

-- CreateIndex
CREATE INDEX "materials_groupId_idx" ON "materials"("groupId");

-- CreateIndex
CREATE INDEX "questions_programId_idx" ON "questions"("programId");

-- CreateIndex
CREATE INDEX "questions_levelId_idx" ON "questions"("levelId");

-- CreateIndex
CREATE INDEX "questions_type_idx" ON "questions"("type");

-- CreateIndex
CREATE INDEX "questions_difficulty_idx" ON "questions"("difficulty");

-- CreateIndex
CREATE INDEX "question_options_questionId_idx" ON "question_options"("questionId");

-- AddForeignKey
ALTER TABLE "latsol_packages" ADD CONSTRAINT "latsol_packages_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "latsol_packages" ADD CONSTRAINT "latsol_packages_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "latsol_package_items" ADD CONSTRAINT "latsol_package_items_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "latsol_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "latsol_package_items" ADD CONSTRAINT "latsol_package_items_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "latsol_attempts" ADD CONSTRAINT "latsol_attempts_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "latsol_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "latsol_attempts" ADD CONSTRAINT "latsol_attempts_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "latsol_answers" ADD CONSTRAINT "latsol_answers_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "latsol_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "latsol_answers" ADD CONSTRAINT "latsol_answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "learning_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
