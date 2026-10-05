-- Pustaka gambar — admin/tutor upload, semua role bisa melihat file
-- (dipakai di soal/materi, dirender untuk siswa juga).
CREATE TABLE "media_assets" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "media_assets_uploadedById_idx" ON "media_assets"("uploadedById");

ALTER TABLE "media_assets"
    ADD CONSTRAINT "media_assets_uploadedById_fkey"
    FOREIGN KEY ("uploadedById") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
