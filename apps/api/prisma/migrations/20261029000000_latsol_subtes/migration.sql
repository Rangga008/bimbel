CREATE TABLE "latsol_subtes" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subjectId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "latsol_subtes_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "latsol_package_items" ADD COLUMN "subtesId" TEXT;

CREATE INDEX "latsol_subtes_packageId_idx" ON "latsol_subtes"("packageId");
CREATE INDEX "latsol_package_items_subtesId_idx" ON "latsol_package_items"("subtesId");

ALTER TABLE "latsol_subtes" ADD CONSTRAINT "latsol_subtes_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "latsol_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "latsol_subtes" ADD CONSTRAINT "latsol_subtes_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "latsol_package_items" ADD CONSTRAINT "latsol_package_items_subtesId_fkey" FOREIGN KEY ("subtesId") REFERENCES "latsol_subtes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
