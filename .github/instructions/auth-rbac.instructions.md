---
applyTo: "modules/auth/**,modules/users/**,modules/rbac/**,apps/web/**/(login|auth)/**"
---

# Instruksi: Auth & RBAC

## Role
Siswa, Orang Tua, Tutor, Admin Keuangan/Administrasi, Admin Pembelajaran/Kurikulum, Owner.
Satu akun bisa terhubung ke lebih dari satu profil (mis. orang tua dengan >1 anak) — desain relasi many-to-many (`parent_students`).

## Model Permission
- Gunakan **RBAC + granular permission**, bukan hardcode `if (role === 'admin')`.
- Tabel minimal: `roles`, `permissions`, `user_roles`, `role_permissions`.
- Permission dicek di **backend/service layer**, bukan hanya menyembunyikan tombol/menu di frontend.
- Contoh permission global lintas-relasi: `exam_proctor.unlock` — bisa dimiliki tutor/admin tanpa perlu jadi tutor kelompok terkait. Jangan derive akses dari relasi tutor↔siswa untuk kasus ini.
- Setiap perubahan permission/role masuk `audit_logs`.

## Manajemen Akun (Fase 0b)
- Akun **tidak pernah** dibuat lewat pendaftaran publik/self sign-up — selalu dibuat oleh Admin/Owner (permission `users.manage`) lewat halaman "Manajemen Akun", atau otomatis lewat `createUserForPerson()` saat Admin membuat profil Parent/Tutor baru (dipakai mulai Fase 1a).
- Nonaktifkan akun pakai `isActive=false` — **jangan hard delete** user, data histori/audit harus tetap utuh.
- Reset password hanya oleh pemegang permission `users.reset_password`; aksi ini wajib masuk `audit_logs`.
- Password awal akun baru: temporary password (admin lihat sekali, wajib diganti user saat login pertama) atau invite-link token sekali pakai — pilih salah satu, konsisten di seluruh aplikasi.

## Auth
- JWT/session sesuai konvensi NestJS umum (access + refresh token).
- Rate limit endpoint login (pakai Redis).
- Pesan error human-friendly, jangan bocorkan detail sistem (contoh gaya pesan ada di `copilot-instructions.md` bagian validasi).

## Definition of Done modul ini
- Login/logout/refresh token bekerja untuk semua role.
- Middleware/guard permission dites untuk minimal 1 skenario "role tanpa permission ditolak" dan 1 skenario "role dengan permission diizinkan".
- Audit log tercatat saat role/permission user berubah.
- Halaman "Manajemen Akun" bisa create/edit/nonaktifkan user + assign role (lihat `docs/phases/phase-0b-account-management.md`).
