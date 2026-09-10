# Fase 0 — Foundation

**Urutan asli (prompt.md §39):** Langkah 1 (Foundation + auth + RBAC) + UI system + Docker Compose.

## Tujuan

Membangun fondasi yang dipakai semua fase berikutnya: struktur proyek, auth, RBAC, skema DB dasar, shell UI 2 mode.

## Cakupan

- Setup monorepo: `apps/web` (Next.js+TS+Tailwind+shadcn), `apps/api` (NestJS+TS+Prisma), `packages/` shared types bila perlu.
- Docker Compose: Postgres, Redis, MinIO/S3-compatible, api, web.
- Prisma schema dasar: `User`, `Role`, `Permission`, `UserRole`, `RolePermission`, `AuditLog`.
- Auth: login/logout/refresh token, guard permission (lihat `auth-rbac.instructions.md`).
- Seed data: 1 akun tiap role (siswa, orang tua, tutor, admin finance, admin academic, owner).
- UI system: design tokens Tailwind, komponen dasar shadcn, `<AppShellDesktop>` (sidebar) dan `<AppShellMobile>` (bottom nav kosong dulu, item diisi Fase 1+) — ikuti `ui-mobile-desktop.instructions.md`.
- Halaman kosong (skeleton page) untuk seluruh menu di `docs/ROLE_PAGES.md` per role, cukup judul + breadcrumb, belum ada data nyata.

## Di luar cakupan (jangan dikerjakan di fase ini)

Semua modul bisnis (people, finance, exam, dst) — cukup skeleton halaman & routing.

## Definition of Done

- `docker compose up` menjalankan seluruh stack tanpa error.
- Login berhasil untuk 6 akun seed, redirect ke dashboard sesuai role.
- Toggle browser width 360px↔1024px menampilkan `<AppShellMobile>`/`<AppShellDesktop>` yang benar.
- Guard permission menolak akses halaman di luar role (test manual: siswa buka URL admin → ditolak).

## Prompt siap-pakai untuk Copilot Agent

```
Kerjakan Fase 0 (Foundation) sesuai .github/copilot-instructions.md dan docs/phases/phase-0-foundation.md.
Baca .github/instructions/auth-rbac.instructions.md dan .github/instructions/ui-mobile-desktop.instructions.md.
Jangan kerjakan modul bisnis lain di luar cakupan fase ini.
Jika ada hal teknis yang menurutmu perlu ditambahkan di luar cakupan file ini, ikuti aturan "Inisiatif Agent" di copilot-instructions.md — jangan langsung implementasi besar, tulis sebagai "Usulan Tambahan".
Setelah selesai, ringkas apa yang dibuat, tandai item Definition of Done mana yang sudah/belum terverifikasi, dan sertakan Usulan Tambahan (jika ada).
```
