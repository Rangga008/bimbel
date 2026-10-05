-- Kelompok bisa diikat ke Paket (mis. "Matematika Reguler 24 sesi") — paket
-- menentukan berapa sesi yang digenerate & invoice apa yang diterbitkan.
ALTER TABLE "learning_groups" ADD COLUMN "packageId" TEXT;
ALTER TABLE "learning_groups" ADD CONSTRAINT "learning_groups_packageId_fkey"
  FOREIGN KEY ("packageId") REFERENCES "packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "learning_groups_packageId_idx" ON "learning_groups"("packageId");
