-- Dedupe konten media: hash SHA-256 bytes tersimpan (pasca-optimasi) agar
-- upload identik pada kategori yang sama memakai aset existing, bukan dobel.
ALTER TABLE "media_assets" ADD COLUMN "sha256" TEXT;

CREATE INDEX "media_assets_category_sha256_idx" ON "media_assets"("category", "sha256");
