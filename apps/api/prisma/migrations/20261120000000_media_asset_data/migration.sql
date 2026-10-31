-- Simpan bytes file media di DB — filesystem container bisa ephemeral
-- (Railway/Fly) sehingga disk-only hilang tiap deploy. Kolom opsional;
-- file lama tetap dibaca dari disk bila data belum ada.
ALTER TABLE "media_assets" ADD COLUMN "data" BYTEA;
