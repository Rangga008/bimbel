-- Pendaftaran siswa self-service + struktur kelas sesuai brosur:
-- kategori program (REGULER/EXTRA/PRIVAT), biaya pendaftaran, harga per
-- jenjang (bulan/pertemuan), mapel per jenjang, dan alur Enrollment.

CREATE TYPE "ProgramCategory" AS ENUM ('REGULER', 'EXTRA', 'PRIVAT');
CREATE TYPE "PriceUnit" AS ENUM ('MONTH', 'SESSION', 'PACKAGE');
CREATE TYPE "EnrollmentStatus" AS ENUM ('PENDING_PAYMENT', 'PAID', 'ACCEPTED', 'PLACED', 'REJECTED');

ALTER TABLE "programs"
  ADD COLUMN "category" "ProgramCategory" NOT NULL DEFAULT 'REGULER',
  ADD COLUMN "registrationFee" DECIMAL(12,2);

ALTER TABLE "levels"
  ADD COLUMN "price" DECIMAL(12,2),
  ADD COLUMN "priceUnit" "PriceUnit";

CREATE TABLE "level_subjects" (
  "id" TEXT NOT NULL,
  "levelId" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "level_subjects_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "level_subjects_levelId_subjectId_key" ON "level_subjects"("levelId", "subjectId");
CREATE INDEX "level_subjects_subjectId_idx" ON "level_subjects"("subjectId");

ALTER TABLE "level_subjects"
  ADD CONSTRAINT "level_subjects_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "levels"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "level_subjects_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "enrollments" (
  "id" TEXT NOT NULL,
  "parentId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "levelId" TEXT NOT NULL,
  "invoiceId" TEXT,
  "groupId" TEXT,
  "status" "EnrollmentStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
  "childName" TEXT NOT NULL,
  "notes" TEXT,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "enrollments_invoiceId_key" ON "enrollments"("invoiceId");
CREATE INDEX "enrollments_parentId_idx" ON "enrollments"("parentId");
CREATE INDEX "enrollments_studentId_idx" ON "enrollments"("studentId");
CREATE INDEX "enrollments_status_idx" ON "enrollments"("status");

ALTER TABLE "enrollments"
  ADD CONSTRAINT "enrollments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "parents"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "enrollments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "enrollments_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "enrollments_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "enrollments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "enrollments_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "learning_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "enrollments_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
