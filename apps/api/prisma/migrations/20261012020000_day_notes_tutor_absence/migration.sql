-- Catatan tanggal kalender (libur/rapat/darurat) + laporan tutor berhalangan.
CREATE TABLE "day_notes" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "day_notes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "day_notes_date_idx" ON "day_notes"("date");

ALTER TABLE "sessions" ADD COLUMN "tutorAbsenceNote" TEXT,
ADD COLUMN "tutorAbsenceAt" TIMESTAMP(3);
