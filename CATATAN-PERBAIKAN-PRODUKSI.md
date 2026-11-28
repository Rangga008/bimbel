# Catatan Perbaikan Produksi — BimbelGFS
(untuk tim server — jalankan berurutan)

## 1. Deploy kode terbaru

```bash
cd <folder-repo-di-server>
git pull origin main
docker compose build api web
docker compose up -d --force-recreate api web
# tunggu 1-2 menit, lalu cek:
curl -s http://localhost:3000/api/health   # harus {"status":"ok",...}
```

Perbaikan yang ikut di deploy ini:
- Pencarian siswa/ortu/akun sekarang bisa pakai **nomor HP** (sebelumnya hanya nama/email — makanya nomor 082113165066 milik Fatima azzahra tidak ketemu padahal datanya ada).
- Nominal angsuran tidak bisa lagi menjadi pecahan sen (0,33 dst) — semua dibulatkan rupiah bulat.
- Input uang tahan terhadap nilai desimal data lama.
- Hapus program tidak lagi ditolak untuk status PLACED yang tidak punya kelompok nyata.
- Fix akun multi-role kehilangan data materi/soal/ujian.

## 2. Bersihkan data korup (invoice pecahan sen)

Ada 2 enrollment dengan 41 invoice korup (nominal Rp 0,33 / Rp 0,00) — salah satunya milik **Amalia Khairunnisa**. Ini murni salah input migrasi, bukan uang sungguhan, jadi aman dihapus permanen.

```bash
docker exec -it bimbel-postgres-1 psql -U bimbel -d bimbel
```

Lalu jalankan di psql:

```sql
-- LANGKAH 1: lihat dulu enrollment yang korup (jangan lanjut kalau ragu)
SELECT e.id AS enrollment_id, u.name AS siswa, count(i.id) AS jml_invoice
FROM enrollments e
JOIN invoices i ON i."enrollmentId" = e.id
JOIN students st ON st.id = e."studentId"
JOIN users u ON u.id = st."userId"
WHERE i."totalAmount" != floor(i."totalAmount") OR i."totalAmount" < 1000
GROUP BY e.id, u.name;

-- LANGKAH 2: hapus seluruh rantai untuk enrollment tsb (satu transaksi).
-- Ganti '<ENROLLMENT_ID>' dengan id dari langkah 1, ulangi per enrollment.
BEGIN;
CREATE TEMP TABLE victim_inv AS
  SELECT id FROM invoices WHERE "enrollmentId" = '<ENROLLMENT_ID>';
CREATE TEMP TABLE victim_pay AS
  SELECT DISTINCT pa."paymentId" AS id FROM payment_allocations pa
  JOIN victim_inv v ON pa."invoiceId" = v.id;

DELETE FROM payment_allocations WHERE "invoiceId" IN (SELECT id FROM victim_inv);
DELETE FROM receipts WHERE "paymentId" IN (SELECT id FROM victim_pay);
DELETE FROM ledger_entries WHERE "paymentId" IN (SELECT id FROM victim_pay);
DELETE FROM refunds WHERE "invoiceId" IN (SELECT id FROM victim_inv);
DELETE FROM payments WHERE id IN (SELECT id FROM victim_pay);
DELETE FROM invoices WHERE id IN (SELECT id FROM victim_inv);
DELETE FROM enrollments WHERE id = '<ENROLLMENT_ID>';

-- cek tidak ada error, baru commit:
COMMIT;
-- (kalau ada yang aneh: ROLLBACK; lalu laporkan)
```

## 3. Input ulang data migrasi yang benar

Setelah bersih, admin input ulang lewat UI (Detail Siswa → Tambah Program → Data lama):
- Pilih paket → harga akhir bisa disesuaikan (misal 4.000.000)
- Jumlah angsuran: isi jumlah sebenarnya (misal 11)
- Tanggal mulai angsuran pertama: isi bulan siswa benar-benar mulai bayar
- Isi pembayaran per bulan yang sudah lunas (misal 400.000 × 3 bulan)
- Simpan — cicilan dan kas masuk akan tercatat di bulan yang benar.

## 4. Verifikasi akhir

- Login akun multi-role → halaman Materi/Soal harus terisi (tidak kosong lagi)
- Cari "082113165066" di halaman Siswa → Fatima azzahra harus muncul
- Laporan Invoice periode berjalan cocok dengan Kas/Bank
