-- CreateTable
CREATE TABLE "learning_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "programId" TEXT NOT NULL,
    "levelId" TEXT,
    "branchId" TEXT,
    "capacity" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learning_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_members" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_tutors" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "tutorId" TEXT NOT NULL,
    "isLead" BOOLEAN NOT NULL DEFAULT false,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_tutors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "learning_groups_code_key" ON "learning_groups"("code");

-- CreateIndex
CREATE INDEX "learning_groups_programId_idx" ON "learning_groups"("programId");

-- CreateIndex
CREATE INDEX "learning_groups_levelId_idx" ON "learning_groups"("levelId");

-- CreateIndex
CREATE INDEX "learning_groups_branchId_idx" ON "learning_groups"("branchId");

-- CreateIndex
CREATE INDEX "group_members_studentId_idx" ON "group_members"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "group_members_groupId_studentId_key" ON "group_members"("groupId", "studentId");

-- CreateIndex
CREATE INDEX "group_tutors_tutorId_idx" ON "group_tutors"("tutorId");

-- CreateIndex
CREATE UNIQUE INDEX "group_tutors_groupId_tutorId_key" ON "group_tutors"("groupId", "tutorId");

-- AddForeignKey
ALTER TABLE "learning_groups" ADD CONSTRAINT "learning_groups_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_groups" ADD CONSTRAINT "learning_groups_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "learning_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_tutors" ADD CONSTRAINT "group_tutors_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "learning_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_tutors" ADD CONSTRAINT "group_tutors_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "tutors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
