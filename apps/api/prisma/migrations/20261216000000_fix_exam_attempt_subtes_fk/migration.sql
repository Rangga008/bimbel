-- FK lama ON DELETE SET NULL bertabrakan dengan kolom subtesId NOT NULL, sehingga
-- menghapus exam_subtes yang sudah punya attempt gagal (P2011 / 500 saat simpan ujian).
-- Samakan dengan schema.prisma: onDelete Cascade.
ALTER TABLE "exam_attempt_subtes" DROP CONSTRAINT "exam_attempt_subtes_subtes_id_fkey";
ALTER TABLE "exam_attempt_subtes" ADD CONSTRAINT "exam_attempt_subtes_subtes_id_fkey" FOREIGN KEY ("subtesId") REFERENCES "exam_subtes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
