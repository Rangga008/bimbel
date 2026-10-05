-- Fase 1d: Attendance / Notification skeleton (in-app).
-- Ditulis manual (mirror prisma schema) konsisten dengan migrasi manual 1a/1b/1c.
CREATE TYPE "AttendanceStatus" AS ENUM ('HADIR', 'TERLAMBAT', 'IZIN', 'SAKIT', 'ALFA');

CREATE TABLE "attendances" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "note" TEXT,
    "markedBy" TEXT,
    "markedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "attendances_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
    "attendanceAlert" BOOLEAN NOT NULL DEFAULT true,
    "scheduleAlert" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "attendances_sessionId_studentId_key" ON "attendances"("sessionId", "studentId");
CREATE INDEX "attendances_studentId_idx" ON "attendances"("studentId");
CREATE INDEX "attendances_sessionId_idx" ON "attendances"("sessionId");
CREATE INDEX "attendances_status_idx" ON "attendances"("status");
CREATE INDEX "notifications_userId_isRead_idx" ON "notifications"("userId", "isRead");
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt");
CREATE UNIQUE INDEX "notification_preferences_userId_key" ON "notification_preferences"("userId");

ALTER TABLE "attendances" ADD CONSTRAINT "attendances_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
