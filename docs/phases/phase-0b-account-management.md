# Fase 0b — Manajemen Akun (User & Role) [SISIPAN]

**Kenapa ada fase sisipan ini:** Fase 0 (Foundation) yang sudah selesai baru membuat akun lewat seed script (6 akun demo). Belum ada halaman UI untuk membuat akun baru secara manual. Fase 1a (People) butuh ini untuk link akun Parent/Tutor — kerjakan Fase 0b ini **sebelum** melanjutkan sisa Fase 1a kalau Anda belum sampai ke bagian linking akun.

Prasyarat: Fase 0 selesai (User, Role, Permission, UserRole, RolePermission sudah ada).

## Tujuan
Owner (dan role lain yang diberi permission) bisa membuat, mengedit, menonaktifkan akun secara manual lewat UI — untuk staf (Admin Finance/Admin Academic/Owner) dan Tutor. Juga menyiapkan mekanisme akun untuk Siswa/Orang Tua yang akan dipakai Fase 1a.

## Cakupan
- Permission baru: `users.manage` (create/edit/deactivate akun & assign role), `users.reset_password`.
- Endpoint & service: create user (email, name, phone, role(s)), edit, deactivate (**jangan hard delete** — pakai `isActive=false`, akun nonaktif tidak bisa login tapi datanya tetap ada untuk histori/audit), reset password oleh admin.
- Alur password akun baru: admin generate **temporary password** ATAU kirim **invite link** (token sekali pakai, expire) yang memaksa user set password sendiri saat login pertama. Pilih salah satu pola yang lebih sederhana untuk diimplementasikan dulu — boleh mulai dari temporary password, invite link bisa jadi "Usulan Tambahan" kalau mau dikerjakan nanti.
- Halaman **"Manajemen Akun"** (Owner, atau siapa pun dengan permission `users.manage`): list semua user + role-nya, form create/edit, toggle aktif/nonaktif, tombol reset password.
- Siapkan (belum perlu UI penuh) fungsi `createUserForPerson()` yang dipakai ulang oleh Fase 1a: dipanggil saat Admin membuat Parent/Tutor baru, otomatis buat `User` + assign role yang sesuai + set temporary password.

## Di luar cakupan
UI pendaftaran mandiri (self sign-up) — semua akun dibuat oleh Admin/Owner, bukan publik.

## Definition of Done
- Owner bisa membuat akun baru (mis. Admin Academic baru) lewat halaman "Manajemen Akun", langsung bisa dipakai login.
- Menonaktifkan akun membuat user itu gagal login, tapi datanya (histori, dsb) tidak hilang.
- Reset password oleh admin menghasilkan password baru yang bisa dipakai user login.
- Fungsi `createUserForPerson()` teruji lewat 1 pemanggilan manual/test (belum harus terpakai di UI Fase 1a).

## Prompt siap-pakai (ringkas)
```
Kerjakan Fase 0b sesuai docs/phases/phase-0b-account-management.md.
Ini sisipan setelah Fase 0 (Foundation) selesai — pakai User/Role/Permission/UserRole yang sudah ada, jangan buat ulang skema auth.
Fokus: halaman Manajemen Akun (create/edit/nonaktifkan user, assign role, reset password) + fungsi createUserForPerson() untuk dipakai Fase 1a nanti.
Kalau ada tambahan teknis di luar ini (mis. invite-link flow), tulis "Usulan Tambahan" saja.
Selesai: ringkas hasil + DoD yang terverifikasi.
```
