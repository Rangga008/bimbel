# Fase 8 — Hardening, Performance & Production Deployment

**Urutan asli (prompt.md §39):** Langkah 12 (Hardening + performance + production deployment).
**Prasyarat: Fase 7 (UI/UX Revamp & Branding) selesai** — deploy production sebaiknya sudah dengan UI final, bukan UI lama yang masih di-revamp.

## Tujuan
Menyiapkan aplikasi untuk deploy production di IDCloudHost Cloud VPS eXtreme.

## Cakupan
- Performance: query optimization (index Prisma), caching Redis untuk data yang sering dibaca (dashboard, leaderboard), pagination konsisten di semua list besar.
- Security review: rate limiting, input validation menyeluruh, file upload validation (tipe/ukuran), CORS, helmet/security headers, secret management (.env tidak ter-commit).
- Load handling untuk skenario ujian serentak (banyak siswa submit di waktu bersamaan mendekati `scheduled_end_at`) — pastikan tidak ada race condition di auto-submit.
- Docker Compose production profile + Nginx reverse proxy + (opsional) Cloudflare-ready config.
- README setup & deployment: langkah instalasi lokal, migrasi, seed, env variable yang dibutuhkan, langkah deploy ke VPS.
- Tests dasar untuk alur kritis (auth, payment 3 jalur, exam auto-submit, proctoring lock/unlock).

## Di luar cakupan
Fitur bisnis baru — fase ini murni pengerasan & kesiapan produksi dari fitur yang sudah ada.

## Definition of Done
- Simulasi ≥20 attempt exam submit bersamaan di detik-detik akhir tidak menghasilkan data korup/duplikat.
- `docker compose -f docker-compose.prod.yml up` berjalan dengan Nginx di depan API & Web.
- README memuat langkah setup lokal dan deploy production yang bisa diikuti tanpa tanya balik.
- Minimal 1 test otomatis untuk masing-masing: login, 3 jalur payment, exam auto-submit, proctor lock/unlock.

## Prompt siap-pakai untuk Copilot Agent
```
Kerjakan Fase 8 (Hardening & Deployment) sesuai docs/phases/phase-8-hardening-deploy.md.
Fokus pada kesiapan produksi, jangan menambah fitur bisnis baru.
Prioritaskan race-condition di exam auto-submit dan keamanan endpoint finance/exam.
Jika ada hal teknis yang menurutmu perlu ditambahkan di luar cakupan file ini, ikuti aturan "Inisiatif Agent" di copilot-instructions.md — jangan langsung implementasi besar, tulis sebagai "Usulan Tambahan".
Setelah selesai, ringkas hasil load-test/simulasi, checklist keamanan yang sudah dicek, dan sertakan Usulan Tambahan (jika ada).
```
