-- Foto profil user (self-service), foto ruangan, dan absensi kehadiran tutor
-- per sesi (dipakai payroll: IZIN/SAKIT/ALFA tidak dihitung sebagai work item).
ALTER TABLE "users" ADD COLUMN "avatarUrl" TEXT;
ALTER TABLE "rooms" ADD COLUMN "photoUrl" TEXT;

CREATE TABLE "tutor_attendances" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "tutorId" TEXT NOT NULL,
  "status" "AttendanceStatus" NOT NULL DEFAULT 'HADIR',
  "note" TEXT,
  "markedBy" TEXT,
  "markedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tutor_attendances_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tutor_attendances_sessionId_tutorId_key" ON "tutor_attendances"("sessionId", "tutorId");
CREATE INDEX "tutor_attendances_tutorId_idx" ON "tutor_attendances"("tutorId");
CREATE INDEX "tutor_attendances_sessionId_idx" ON "tutor_attendances"("sessionId");
ALTER TABLE "tutor_attendances" ADD CONSTRAINT "tutor_attendances_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tutor_attendances" ADD CONSTRAINT "tutor_attendances_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "tutors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
