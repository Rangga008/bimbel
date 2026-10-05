# Fase 1a — People & Programs

Bagian pertama dari Fase 1 (Core Operations), dipecah supaya bisa dicicil per sesi kredit terbatas.
Urutan lengkap Fase 1: **1a People & Programs → 1b Groups & Tutor Assignment → 1c Schedule & Session → 1d Attendance & Notification.**

**Prasyarat: Fase 0b (Manajemen Akun) sudah selesai** — Student/Parent/Tutor baru butuh `createUserForPerson()` dari sana.

## Tujuan
Master data inti: siapa siswa/orang tua/tutor, dan program/paket apa yang tersedia. Ini prasyarat untuk semua sub-fase 1 lain.

## Cakupan
- Module `people`: `Student`, `Parent` (+ relasi many-to-many `parent_students` untuk 1 ortu bisa >1 anak), `Tutor`, field profil Admin (lihat spec docx §7-9).
- **Akun login:** saat membuat `Parent` atau `Tutor` baru, panggil `createUserForPerson()` (dibuat di Fase 0b) supaya otomatis punya akun login dengan role yang sesuai — jangan buat ulang logic pembuatan User di sini.
- Module `programs`: `Program`, `Level`, `Package` (paket punya jumlah sesi tetap).
- CRUD dasar (create/list/detail/edit) untuk semua entitas di atas via API + UI.
- Isi halaman "Siswa" (Admin Finance/Academic/Owner) dan "Anak" (Orang Tua, meski masih data seed) dengan data nyata.

## Di luar cakupan (dikerjakan di sub-fase lain)
Kelompok belajar & assignment tutor (1b), jadwal/sesi (1c), absensi & notifikasi (1d).

## Definition of Done
- Bisa membuat Program → Level → Package lengkap lewat UI.
- Bisa membuat Student baru dan menghubungkannya ke ≥1 Parent (bisa 1 parent ke 2 student).
- Membuat Parent/Tutor baru otomatis menghasilkan akun login (lewat `createUserForPerson()`), bukan cuma data profil tanpa akun.
- Halaman "Siswa" (admin) dan "Anak" (orang tua) menampilkan data nyata, bukan skeleton.

## Prompt siap-pakai untuk Copilot Agent
```
Kerjakan Fase 1a (People & Programs) sesuai docs/phases/phase-1a-people-programs.md.
Ini bagian pertama dari Fase 1 — jangan kerjakan Groups, Schedule, atau Attendance dulu (itu sub-fase 1b/1c/1d terpisah).
Jika ada hal teknis yang menurutmu perlu ditambahkan di luar cakupan file ini, ikuti aturan "Inisiatif Agent" di copilot-instructions.md — tulis sebagai "Usulan Tambahan", jangan langsung implementasi besar.
Setelah selesai, ringkas apa yang dibuat, Definition of Done mana yang terverifikasi, dan sertakan Usulan Tambahan (jika ada).
```
