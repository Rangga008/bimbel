-- Status ENDED untuk ujian yang diakhiri manual sebelum/at scheduled_end_at.
-- Semua attempt IN_PROGRESS di-auto-submit oleh endpoint end.
ALTER TYPE "ExamStatus" ADD VALUE IF NOT EXISTS 'ENDED';
