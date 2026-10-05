# Fase 1b — Groups & Tutor Assignment

Bagian kedua dari Fase 1. **Prasyarat: Fase 1a sudah selesai** (Student, Parent, Tutor, Program/Level/Package sudah ada).

## Tujuan
Mengelompokkan siswa ke kelompok belajar dan menugaskan tutor.

## Cakupan
- Module `groups`: `LearningGroup` (terhubung ke Program/Level dari 1a), keanggotaan siswa (many-to-many), penugasan **multi-tutor per kelompok** (tutor per sesi bisa berbeda — jangan hardcode 1 tutor per kelompok).
- CRUD kelompok + assign/unassign siswa + assign/unassign tutor via API + UI.
- Isi halaman "Kelompok" (Admin Academic, Owner, Tutor) dengan data nyata.

## Di luar cakupan
Jadwal/sesi konkret dengan tanggal-waktu (itu Fase 1c) — di fase ini kelompok cukup punya daftar tutor & anggota, belum ada jadwal.

## Definition of Done
- Bisa membuat LearningGroup, assign ≥5 siswa dan ≥2 tutor berbeda ke kelompok yang sama.
- Halaman "Kelompok" tutor menampilkan hanya kelompok yang dia ampu.
- Halaman "Kelompok" admin/owner menampilkan semua kelompok dengan jumlah anggota & tutor.

## Prompt siap-pakai untuk Copilot Agent
```
Kerjakan Fase 1b (Groups & Tutor Assignment) sesuai docs/phases/phase-1b-groups.md.
Fase 1a (People & Programs) sudah selesai — gunakan entitas Student/Parent/Tutor/Program/Level/Package yang sudah ada, jangan buat ulang.
Jangan kerjakan Schedule/Session/Attendance dulu (sub-fase 1c/1d terpisah).
Jika ada hal teknis yang menurutmu perlu ditambahkan di luar cakupan file ini, ikuti aturan "Inisiatif Agent" di copilot-instructions.md — tulis sebagai "Usulan Tambahan", jangan langsung implementasi besar.
Setelah selesai, ringkas apa yang dibuat, Definition of Done mana yang terverifikasi, dan sertakan Usulan Tambahan (jika ada).
```
