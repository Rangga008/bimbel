-- Identitas laporan siswa: NIS + pilihan jurusan (dipakai laporan hasil belajar cetak).
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "nis" TEXT;
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "majorChoice1" TEXT;
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "majorChoice2" TEXT;
