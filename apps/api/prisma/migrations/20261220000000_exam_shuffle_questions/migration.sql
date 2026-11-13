ALTER TABLE "exams" ADD COLUMN "shuffleQuestions" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "exam_attempts" ADD COLUMN "questionOrder" JSONB;
