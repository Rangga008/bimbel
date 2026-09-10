---
applyTo: "modules/schedules/**,modules/sessions/**,modules/attendance/**,modules/groups/**"
---

# Instruksi: Schedule, Session, Attendance, Learning Group

## Aturan Bisnis
- Setiap paket punya jumlah sesi **tetap**.
- Jadwal per-siswa **bisa diubah manual** oleh Admin (bukan hanya mengikuti template kelompok secara kaku).
- Kelompok belajar bisa punya **beberapa tutor**; tutor tiap sesi **bisa berbeda-beda**.
- Siswa bisa punya kelas/program tambahan di luar paket/jadwal reguler.
- `Schedule` dan `Session` adalah **entitas mandiri yang bisa berubah**, bukan data statis yang menempel permanen ke kelompok.
- Sistem **wajib mendeteksi konflik** tutor, siswa, dan ruangan saat penjadwalan.

## Attendance
- Diisi tutor per sesi. Status minimal: hadir, terlambat, izin, sakit, alfa.
- **Tidak memengaruhi nilai** — murni informasi untuk orang tua & operasional.
- Bisa dikoreksi sesuai permission; setiap koreksi **wajib** masuk audit log.
- Rekap tersedia per: siswa, kelompok, tutor, periode.

## Definition of Done modul ini
- Conflict detection teruji untuk kasus: 2 sesi tutor sama-waktu-beda-tempat, siswa double-booking, ruangan bentrok.
- Koreksi absensi tercatat di audit log dengan old_data/new_data.
- Rekap attendance 4 dimensi (siswa/kelompok/tutor/periode) tersedia lewat API.
