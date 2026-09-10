# Fase 1 — Core Operations

**Urutan asli (prompt.md §39):** Langkah 2 (People + programs + packages + groups) + Langkah 3 (Schedule + sessions + attendance) + skeleton notification.

## Tujuan

Data inti operasional harian: siapa siswa/ortu/tutor-nya, program/paket apa, kelompok belajar, jadwal, sesi, dan absensi.

## Cakupan

- Module `people`: Student, Parent (+relasi many-to-many `parent_students`), Tutor, Admin profile fields (lihat spec docx §7-9 untuk field lengkap).
- Module `programs`: Program, Level, Package (jumlah sesi tetap per paket).
- Module `groups`: LearningGroup, multi-tutor per kelompok, keanggotaan siswa.
- Module `schedules` & `sessions`: CRUD jadwal, override jadwal per-siswa, conflict detection (tutor/siswa/ruangan) — ikuti `attendance-schedule.instructions.md`.
- Module `attendance`: input per sesi oleh tutor, status hadir/terlambat/izin/sakit/alfa, koreksi dengan audit log.
- Isi menu terkait di `<AppShellMobile>`/`<AppShellDesktop>` (Beranda/Jadwal/Kelompok/Absensi dst sesuai `docs/ROLE_PAGES.md`) dengan data nyata dari modul ini.
- `notifications` module: skeleton skema (`Notification`, `NotificationPreference`) + in-app notification saja (WhatsApp abstraction baru di Fase 5).

## Catatan

- Pastikan relasi many-to-many antara orang tua dan siswa (`parent_students`) terkelola dengan baik.
- Conflict detection harus mencakup semua kemungkinan bentrok jadwal antara tutor, siswa, dan ruangan.
- Absensi harus bisa dikoreksi dengan audit log untuk menjaga integritas data.
- Notifikasi in-app harus bisa dikirim dan diterima sesuai preferensi pengguna.
- Skeleton notifikasi harus bisa diakses dari menu terkait di `<AppShellMobile>`/`<AppShellDesktop>`.
- Di Fase sebelumnya belum ada fungsi sesi, yang mengahruskan user ketika mengrefresh halaman untuk melihat sesi terbaru, user di haruskan login kembali.

## Di luar cakupan

Finance, exam/latsol, payroll, WhatsApp aktif, analytics/ranking.

## Definition of Done

- Bisa membuat siswa baru, assign ke kelompok, kelompok punya ≥2 tutor berbeda per sesi berbeda.
- Conflict detection menolak penjadwalan tutor bentrok waktu.
- Tutor bisa input absensi 1 sesi penuh; orang tua melihat rekap kehadiran anaknya.
- Dashboard Beranda tiap role menampilkan data nyata (bukan skeleton lagi) untuk bagian yang relevan fase ini.

## Prompt siap-pakai untuk Copilot Agent

```
Kerjakan Fase 1 (Core Operations) sesuai docs/phases/phase-1-core-ops.md.
Baca .github/instructions/attendance-schedule.instructions.md.
Bangun di atas hasil Fase 0 — jangan ubah struktur auth/RBAC kecuali diperlukan untuk relasi data baru.
Jika ada hal teknis yang menurutmu perlu ditambahkan di luar cakupan file ini, ikuti aturan "Inisiatif Agent" di copilot-instructions.md — jangan langsung implementasi besar, tulis sebagai "Usulan Tambahan".
Setelah selesai, ringkas apa yang dibuat, Definition of Done mana yang terverifikasi, dan sertakan Usulan Tambahan (jika ada).
```
