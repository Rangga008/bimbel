-- Roster per-sesi: siswa kelompok yang dijadwalkan hadir di sesi tsb.
CREATE TABLE "session_students" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_students_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "session_students_sessionId_studentId_key" ON "session_students"("sessionId", "studentId");
CREATE INDEX "session_students_studentId_idx" ON "session_students"("studentId");

ALTER TABLE "session_students" ADD CONSTRAINT "session_students_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "session_students" ADD CONSTRAINT "session_students_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: sesi yang sudah ada mengikuti perilaku lama (semua anggota kelompok hadir).
INSERT INTO "session_students" ("id", "sessionId", "studentId")
SELECT gen_random_uuid()::text, s."id", gm."studentId"
FROM "sessions" s
JOIN "group_members" gm ON gm."groupId" = s."groupId"
ON CONFLICT ("sessionId", "studentId") DO NOTHING;
