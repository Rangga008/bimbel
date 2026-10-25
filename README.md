# Bimbel GFS — Aplikasi Manajemen Bimbingan Belajar

Platform manajemen bimbel end-to-end: pendaftaran siswa, program reguler/ekstra/privat, jadwal & kehadiran, materi & latihan soal, ujian multi-subtes (termasuk tryout publik via kode akses), invoice & verifikasi pembayaran, payroll tutor, notifikasi WhatsApp, dan pelaporan akademik/keuangan — untuk role **Owner, Admin Akademik, Admin Finance, Tutor, Siswa, dan Orang Tua**.

> `README-SETUP.md` adalah dokumentasi paket instruksi AI-agent (Copilot/Cline) yang dipakai saat development fase awal — bukan dokumentasi aplikasi. Dokumen ini adalah README aplikasi.

## Stack

| Bagian | Teknologi |
|---|---|
| Frontend | Next.js 16 (App Router), React, TypeScript, TanStack Query, Tailwind, Zustand |
| Backend | NestJS, Prisma 7, PostgreSQL 16, Redis 7 (throttling & cache) |
| Storage | MinIO (S3) untuk file media; volume `api-uploads` untuk bukti pembayaran |
| Auth | JWT access + refresh (cookie), RBAC berbasis permission code |
| Deploy | Docker Compose (`docker-compose.yml` + override `docker-compose.prod.yml`) |

## Struktur

```
apps/api      NestJS + Prisma (REST API, port 3000)
apps/web      Next.js (UI semua role, port 3001)
docs/         Spesifikasi fase & ROLE_PAGES.md
scripts/      smoke-test & test_exam_e2e.py (suite E2E lintas-role)
docker-compose.yml        Compose dasar (dev/self-host)
docker-compose.prod.yml   Override produksi (port internal → localhost)
.env.example              Template variabel environment
```

## Quickstart (Docker)

```bash
cp .env.example .env        # opsional untuk dev; WAJIB diisi untuk produksi
docker compose up -d --build
```

- Web: http://localhost:3001 — API: http://localhost:3000/api (`/api/health` = healthcheck)
- Migrasi Prisma & seed **otomatis jalan saat container API start** (`docker-entrypoint.sh`). Startup pertama butuh ±1–2 menit sampai seed selesai.
- Panduan lengkap (produksi, reverse proxy, troubleshooting): **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**

## Akun seed (dev)

Seed memakai `upsert` — aman dijalankan ulang, dan otomatis dieksekusi entrypoint API.

| Role | Email | Password |
|---|---|---|
| Owner | owner1@bimbel.test | Owner123! |
| Admin Akademik | adminacademic1@bimbel.test | AdminAcademic123! |
| Admin Finance | adminfinance1@bimbel.test | AdminFinance123! |
| Tutor | tutor1@bimbel.test | Tutor123! |
| Orang Tua | ortu1@bimbel.test | OrangTua123! |
| Siswa | siswa1@bimbel.test | Siswa123! |

**Ganti/nonaktifkan akun seed sebelum go-live.**

## Development lokal (tanpa Docker untuk app)

```bash
docker compose up -d postgres redis minio     # infra saja

cd apps/api && npm install
npx prisma migrate deploy && npm run prisma:seed
npm run start:dev                            # API di :3000

cd apps/web && npm install
npm run dev                                  # web di :3001
```

## Test & verifikasi

```bash
cd apps/api && ./node_modules/.bin/tsc --noEmit     # typecheck API
cd apps/web && ./node_modules/.bin/tsc --noEmit     # typecheck web
cd apps/api && npm test                            # unit test (jest)

# Suite E2E lintas-role (butuh stack berjalan di :3001):
#   login 4 role, lifecycle ujian (draft→publish→pause→resume→end),
#   race-condition start/submit, burst autosave, load 40x paralel.
python scripts/test_exam_e2e.py
```

## Catatan keamanan

- `JWT_ACCESS_SECRET`, password DB/MinIO, dan kredensial seed **wajib diganti** untuk produksi.
- Rate-limit global via Redis + throttle ketat di endpoint sensitif (login, register, OTP, redeem kode ujian).
- Upload/dokumen disajikan dengan CSP & `Content-Disposition` yang aman (SVG sebagai attachment); HTML materi disanitasi DOMPurify sebelum render.
- Satu attempt ujian per siswa ditegakkan unique constraint DB — retake hanya lewat reset pengawas.
