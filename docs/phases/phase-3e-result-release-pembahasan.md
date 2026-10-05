# Fase 3e — Result Release & Pembahasan

Bagian terakhir Fase 3. **Prasyarat: Fase 3c & 3d selesai.**

## Tujuan
Mengunci kapan hasil ujian boleh terlihat, dan menyediakan halaman pembahasan — penutup seluruh Fase 3.

## Cakupan
- **Result release lock:** hasil (skor, jawaban benar/salah, solusi) baru bisa diakses siswa **setelah** `scheduled_end_at` (waktu global) terlewati untuk SEMUA peserta — walau siswa itu sendiri sudah submit lebih awal. Sebelum itu, endpoint result mengembalikan status "belum dirilis", bukan data kosong yang bisa di-bypass.
- Setelah release: skor, persentase, benar/salah, soal salah, solusi, waktu pengerjaan per siswa.
- Halaman "Pembahasan" (Tutor): pilih kumpulan soal dari 1 exam untuk sesi bahas bersama.
- Review akhir seluruh Fase 3: pastikan Materials (3a), Question Bank (3a), Latsol (3b), Exam+Timing (3c), Proctoring (3d) semua terhubung konsisten dan tidak ada kebocoran jawaban di titik mana pun.

## Di luar cakupan
Analytics mendalam & ranking (Fase 4) — cukup pastikan data mentah (score, jawaban, waktu per attempt) tersimpan lengkap untuk dipakai Fase 4.

## Definition of Done — sekaligus penutup seluruh Fase 3
- Siswa yang submit lebih awal tetap tidak bisa lihat hasil sampai `scheduled_end_at` terlewati untuk semua peserta.
- Halaman Pembahasan tutor berfungsi untuk memilih & menampilkan subset soal dari 1 exam.
- **Full regression check Fase 3**: simulasi 1 siswa dari awal (kerjakan latsol → kerjakan exam → kena proctor warning → lihat hasil setelah release) berjalan mulus tanpa error atau kebocoran jawaban di titik mana pun.

## Prompt siap-pakai (ringkas)
```
Kerjakan Fase 3e sesuai docs/phases/phase-3e-result-release-pembahasan.md.
Fase 3c & 3d sudah selesai.
Fokus: kunci result release sampai scheduled_end_at terlewati untuk semua peserta + halaman Pembahasan.
Setelah ini, seluruh Fase 3 (Learning & Exam) dianggap tuntas — lakukan full regression check di akhir.
Kalau ada tambahan teknis di luar ini, tulis "Usulan Tambahan" saja.
Selesai: ringkas hasil + DoD yang terverifikasi + hasil regression check.
```
