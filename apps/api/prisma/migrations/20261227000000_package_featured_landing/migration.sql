-- Paket unggulan landing: admin menandai paket yang tampil di slider
-- "Paket Terpopuler" halaman awal (sebelumnya diurut otomatis dari
-- jumlah siswa terbanyak; urutan itu tetap dipakai sebagai fallback).
ALTER TABLE "packages" ADD COLUMN "isFeatured" BOOLEAN NOT NULL DEFAULT false;
