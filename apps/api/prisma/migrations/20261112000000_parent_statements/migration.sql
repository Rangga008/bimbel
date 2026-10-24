-- Surat pernyataan/kontrak belajar orang tua per pendaftaran.
CREATE TABLE "parent_statements" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "parentName" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "studentName" TEXT NOT NULL,
    "levelName" TEXT NOT NULL,
    "schoolOrigin" TEXT,
    "programName" TEXT NOT NULL,
    "paymentLabel" TEXT NOT NULL,
    "installments" JSONB NOT NULL,
    "installmentAmount" DECIMAL(14,2),
    "installmentCount" INTEGER,
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "dueDay" INTEGER,
    "termsVersion" TEXT NOT NULL DEFAULT 'v1',
    "agreedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parent_statements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "parent_statements_enrollmentId_key" ON "parent_statements"("enrollmentId");
CREATE INDEX "parent_statements_parentId_idx" ON "parent_statements"("parentId");
CREATE INDEX "parent_statements_studentId_idx" ON "parent_statements"("studentId");

ALTER TABLE "parent_statements" ADD CONSTRAINT "parent_statements_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "parent_statements" ADD CONSTRAINT "parent_statements_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "parents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "parent_statements" ADD CONSTRAINT "parent_statements_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
