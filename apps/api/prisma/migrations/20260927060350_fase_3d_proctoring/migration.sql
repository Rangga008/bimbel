-- AlterEnum
ALTER TYPE "ExamAttemptStatus" ADD VALUE 'LOCKED';

-- AlterTable
ALTER TABLE "exam_attempts" ADD COLUMN     "lockedAt" TIMESTAMP(3),
ADD COLUMN     "lockedBy" TEXT,
ADD COLUMN     "lockedReason" TEXT,
ADD COLUMN     "unlockedAt" TIMESTAMP(3),
ADD COLUMN     "unlockedBy" TEXT,
ADD COLUMN     "violationCount" INTEGER NOT NULL DEFAULT 0;
