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

## Auth
- JWT/session sesuai konvensi NestJS umum (access + refresh token).
- Rate limit endpoint login (pakai Redis).
- Pesan error human-friendly, jangan bocorkan detail sistem (contoh gaya pesan ada di `copilot-instructions.md` bagian validasi).

## Definition of Done modul ini
- Login/logout/refresh token bekerja untuk semua role.
- Middleware/guard permission dites untuk minimal 1 skenario "role tanpa permission ditolak" dan 1 skenario "role dengan permission diizinkan".
- Audit log tercatat saat role/permission user berubah.
