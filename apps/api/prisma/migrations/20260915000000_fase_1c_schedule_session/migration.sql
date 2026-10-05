-- Fase 1c: Building / Room / Schedule / Session / SessionStudentOverride.
-- Ditulis manual (mirror prisma schema) supaya konsisten dengan migrasi manual 1a/1b sebelumnya.
CREATE TYPE "SessionStatus" AS ENUM ('SCHEDULED', 'CANCELLED', 'COMPLETED');

CREATE TABLE "buildings" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "branchId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "buildings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rooms" (
    "id" TEXT NOT NULL,
    "buildingId" TEXT,
    "name" TEXT NOT NULL,
    "capacity" INTEGER,
    "branchId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "schedules" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "tutorId" TEXT,
    "roomId" TEXT,
    "dayOfWeek" INTEGER NOT NULL,
    "startMin" INTEGER NOT NULL,
    "endMin" INTEGER NOT NULL,
    "validFrom" DATE NOT NULL,
    "validTo" DATE,
    "branchId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "schedules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "scheduleId" TEXT,
    "tutorId" TEXT,
    "roomId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "branchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "session_student_overrides" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "roomId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "session_student_overrides_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "buildings_branchId_idx" ON "buildings"("branchId");
CREATE INDEX "rooms_buildingId_idx" ON "rooms"("buildingId");
CREATE INDEX "rooms_branchId_idx" ON "rooms"("branchId");
CREATE INDEX "schedules_groupId_idx" ON "schedules"("groupId");
CREATE INDEX "schedules_tutorId_idx" ON "schedules"("tutorId");
CREATE INDEX "schedules_roomId_idx" ON "schedules"("roomId");
CREATE INDEX "schedules_branchId_idx" ON "schedules"("branchId");
CREATE INDEX "sessions_groupId_startsAt_idx" ON "sessions"("groupId", "startsAt");
CREATE INDEX "sessions_tutorId_startsAt_idx" ON "sessions"("tutorId", "startsAt");
CREATE INDEX "sessions_roomId_startsAt_idx" ON "sessions"("roomId", "startsAt");
CREATE INDEX "sessions_startsAt_idx" ON "sessions"("startsAt");
CREATE UNIQUE INDEX "session_student_overrides_sessionId_studentId_key" ON "session_student_overrides"("sessionId", "studentId");
CREATE INDEX "session_student_overrides_studentId_idx" ON "session_student_overrides"("studentId");

ALTER TABLE "rooms" ADD CONSTRAINT "rooms_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "buildings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "learning_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "tutors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "learning_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "tutors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "session_student_overrides" ADD CONSTRAINT "session_student_overrides_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "session_student_overrides" ADD CONSTRAINT "session_student_overrides_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "session_student_overrides" ADD CONSTRAINT "session_student_overrides_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
