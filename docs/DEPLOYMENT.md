# Deploy Aplikasi dengan Docker

Panduan menjalankan Bimbel GFS via Docker Compose — dari dev lokal sampai VPS produksi di balik reverse proxy HTTPS.

## Arsitektur container

| Service | Image | Port host | Fungsi |
|---|---|---|---|
| `web` | build `apps/web` (Next.js standalone) | **3001** → 3000 | UI semua role |
| `api` | build `apps/api` (NestJS) | **3000** | REST API (`/api/*`) |
| `postgres` | postgres:16-alpine | 5432 | Database utama |
| `redis` | redis:7-alpine | 6379 | Rate-limit/throttling terdistribusi |
| `rabbitmq` | rabbitmq:3.13-management-alpine | 5672, 15672 | Antrean job (outbox WA, poin) — UI di :15672 |
| `minio` | bitnamilegacy/minio | 9000, 9001 | Object storage media (console di :9001) |

Volume persisten: `postgres-data`, `redis-data`, `rabbitmq-data`, `minio-data`, `api-uploads` (bukti pembayaran).

> RabbitMQ opsional: bila `RABBITMQ_URL` dikosongkan, API berjalan mode in-process — berguna di environment managed tanpa broker (mis. Railway).

Kebutuhan server (minimum/rekomendasi/maksimal) lihat bagian **"Kebutuhan server"** di [README.md](../README.md).

## 1. Prasyarat

- Docker Engine + Compose v2 (`docker compose version`)
- Port 3000 & 3001 bebas
- Untuk produksi: domain + reverse proxy (nginx/Caddy) dengan sertifikat TLS

## 2. Konfigurasi `.env`

```bash
cp .env.example .env
```

Variabel penting (lihat `.env.example` untuk daftar lengkap berkomentar):

| Variabel | Dev default | Produksi |
|---|---|---|
| `JWT_ACCESS_SECRET` | `dev-access-secret-change-me` | **WAJIB** acak: `openssl rand -base64 48` |
| `POSTGRES_PASSWORD` | `bimbel_secret` | **WAJIB** kuat & unik |
| `MINIO_ROOT_PASSWORD` | `bimbel_secret` | **WAJIB** kuat & unik |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3000/api` | URL API versi browser — **dibundel saat build**, ubah = rebuild web |
| `CORS_ORIGIN` | `http://localhost:3001` | Origin web, mis. `https://bimbel.example.com` |
| `COOKIE_SAMESITE` | `lax` | `lax` (satu domain) atau `none` (beda origin, wajib HTTPS) |
| `TRUST_PROXY` | `0` | `1` bila di balik nginx/Cloudflare (agar `req.ip` & rate-limit benar) |
| `WHATSAPP_PROVIDER` | `log` | `fonnte` + `WHATSAPP_API_TOKEN` untuk kirim WA sungguhan |
| `API_INTERNAL_URL` | `http://api:3000/api` | URL API dari dalam container web (server-side) |

### Mode URL API — pilih satu

1. **Subdomain terpisah** (paling simpel): `NEXT_PUBLIC_API_URL=https://api.domain.com/api`, `CORS_ORIGIN=https://app.domain.com`, `COOKIE_SAMESITE=none` (wajib HTTPS).
2. **Satu domain via proxy** (disarankan): proxy `/api/*` → `api:3000`, sisanya → `web:3000`. Set `NEXT_PUBLIC_API_URL=https://domain.com/api`, `COOKIE_SAMESITE=lax`.
3. **Same-origin proxy Next** (mis. Railway): `NEXT_PUBLIC_API_URL=/api` — request diteruskan route `app/api/[...path]` ke `API_INTERNAL_URL`; cookie refresh jadi first-party.

## 3. Build & jalankan

```bash
# Dev / self-host dasar
docker compose up -d --build

# Produksi (port postgres/redis/minio hanya di localhost host)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Log & status
docker compose logs -f api
docker compose ps
```

**Startup pertama:** entrypoint API menjalankan `prisma migrate deploy` lalu `prisma db seed` (upsert, aman diulang) — API menjawab healthcheck setelah seed selesai (±1–2 menit). Tunggu `docker compose ps` menunjukkan api running sebelum uji login.

## 4. Reverse proxy (produksi)

Contoh nginx untuk mode satu-domain:

```nginx
server {
    listen 443 ssl;
    server_name bimbel.example.com;
    # ssl_certificate ...;

    location /api/ {
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Set `TRUST_PROXY=1`, `CORS_ORIGIN=https://bimbel.example.com`, `NEXT_PUBLIC_API_URL=https://bimbel.example.com/api` → rebuild web.

## 5. Deploy ke cloud / VPS (produksi)

Tiga jalur — pilih sesuai kondisi:

| Kebutuhan | Jalur |
|---|---|
| VPS ≥4 GB, satu mesin, build langsung di server | **A — VPS + Compose** |
| VPS kecil (2 GB) atau deploy sering — build di luar server | **B — Registry (pull image)** |
| Tidak mau urus server sama sekali | **C — PaaS Docker (Railway/Render/dsb.)** |

### Jalur A — VPS + Docker Compose (build di server)

```bash
# 1. Buat VPS Ubuntu 22.04/24.04 (spek lihat "Kebutuhan server" di README).
#    Arahkan DNS domain → IP VPS.

# 2. Install Docker + plugin Compose (di server, via SSH):
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker

# 3. Ambil kode:
git clone <url-repo-anda> bimbel && cd bimbel

# 4. .env produksi — WAJIB ganti semua secret:
cp .env.example .env
#   POSTGRES_PASSWORD, MINIO_ROOT_PASSWORD, RABBITMQ_PASSWORD   → kuat & unik
#   JWT_ACCESS_SECRET          → openssl rand -base64 48
#   NEXT_PUBLIC_API_URL=https://bimbel.example.com/api
#   CORS_ORIGIN=https://bimbel.example.com
#   TRUST_PROXY=1
#   WHATSAPP_PROVIDER=fonnte + WHATSAPP_API_TOKEN (bila notifikasi WA dipakai)

# 5. Build & jalankan — port internal otomatis hanya di localhost host:
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# 6. HTTPS: reverse proxy di host — nginx (contoh di bagian 4) atau Caddy:
#    Caddyfile (HTTPS otomatis Let's Encrypt):
#      bimbel.example.com {
#          reverse_proxy /api/* localhost:3000
#          reverse_proxy localhost:3001
#      }
```

### Jalur B — Build di cloud/CI → pull image di server (registry)

`next build` + `npm ci` di VPS 2 GB sering OOM — build di lokal/CI lalu server hanya `pull` (pakai `docker-compose.registry.yml` yang sudah disediakan):

```bash
# === Di mesin build (lokal/CI) — sekali per rilis ===
docker login ghcr.io          # atau docker.io untuk Docker Hub

# NEXT_PUBLIC_API_URL dibundel saat build → isi domain target!
docker buildx build \
  --build-arg NEXT_PUBLIC_API_URL=https://bimbel.example.com/api \
  -t ghcr.io/ORG/bimbel-web:v1.0.0 --push apps/web
docker buildx build -t ghcr.io/ORG/bimbel-api:v1.0.0 --push apps/api

# === Di server ===
# .env tambahan:
#   REGISTRY_PREFIX=ghcr.io/ORG
#   APP_VERSION=v1.0.0
docker login ghcr.io          # bila image private
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  -f docker-compose.registry.yml pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  -f docker-compose.registry.yml up -d
```

Update berikutnya cukup: build+push tag baru → ubah `APP_VERSION` → `pull` → `up -d` (server tidak perlu `git pull` maupun build).

### Jalur C — PaaS Docker managed (Railway, Render, Fly.io, dsb.)

- Satu service per komponen: **api** (Dockerfile `apps/api`), **web** (Dockerfile `apps/web`). Postgres/Redis/MinIO pakai add-on managed platform atau container terpisah.
- **Env api:** `DATABASE_URL` (dari add-on Postgres), `REDIS_URL`, `JWT_ACCESS_SECRET`, `CORS_ORIGIN` (URL web publik), `TRUST_PROXY=1`, `WHATSAPP_PROVIDER=fonnte` + token, `RABBITMQ_URL` **kosongkan** → job jalan in-process (atau sambungkan managed AMQP seperti CloudAMQP).
- **Env web:** `NEXT_PUBLIC_API_URL=/api` + `API_INTERNAL_URL=<url-internal-api>/api` — mode same-origin proxy (cookie refresh jadi first-party, tidak terblokir third-party-cookie).
- `NEXT_PUBLIC_API_URL` dibundel saat build image web — pastikan build args/env build-time benar.
- Migrasi + seed **otomatis** via entrypoint api saat deploy pertama — tunggu log "seed" selesai.
- Backup/restore tetap jalan dari UI: Pengaturan → Cadangan & Pemulihan Database.

## 6. Update/deploy ulang

```bash
git pull
docker compose build api web
docker compose up -d --force-recreate api web
```

Migrasi baru otomatis diterapkan saat API start. Cek `docker compose logs api | grep -i migrat`.

## 7. Verifikasi pasca-deploy

```bash
curl -fsS http://localhost:3000/api/health        # API sehat
curl -s -o /dev/null -w "%{http_code}" http://localhost:3001   # web 200
python scripts/test_exam_e2e.py                 # suite E2E lintas-role (23 cek)
```

## 8. Backup & restore

### Dari UI (disarankan)

**Pengaturan → Cadangan & Pemulihan Database** (akses: Owner, Admin Finance, Admin Akademik — permission `backup.manage`):

- **Unduh Backup** → file `bimbel-backup-YYYYMMDD-HHMM.sql.gz` (dump plain-SQL ter-gzip, berisi `--clean --if-exists --no-owner` — bisa dipulihkan ke DB kosong maupun terisi).
- **Pulihkan Database** → unggah `.sql`/`.sql.gz` (maks 512 MB) → restore **atomik** via `psql --single-transaction`: bila satu statement gagal, semua rollback — DB tidak pernah setengah-pulih. Dua restore paralel ditolak (mutex). Aksi export/import tercatat di log audit.
- Endpoint API: `GET /api/backup/export` (stream gzip), `POST /api/backup/import` (multipart `file`).
- Cocok untuk: backup rutin, **pindah hosting** (export di lama → import di baru), migrasi, dan **pemulihan setelah insiden**.

### Manual via CLI

```bash
# Backup database
docker exec bimbel-postgres-1 pg_dump -U bimbel -Fc bimbel > backup-$(date +%F).dump

# Restore (file .dump format custom)
cat backup-XXXX.dump | docker exec -i bimbel-postgres-1 pg_restore -U bimbel -d bimbel --clean

# Restore file .sql / .sql.gz hasil export UI (atomik)
gunzip -c backup.sql.gz | docker exec -i bimbel-postgres-1 \
  psql -U bimbel -d bimbel --single-transaction -v ON_ERROR_STOP=1 -q
```

> **Catatan penting:** jangan menyambung `pg_dump` langsung via pipe ke `psql` pada database **yang sama** — lock sirkular (pg_dump memegang shared-lock sampai selesai sementara restore menunggu exclusive-lock). Selalu dump ke file dulu. Restore ke database **lain** aman.
>
> Yang **tidak** termasuk dump DB: file media di volume `minio-data` dan bukti pembayaran di `api-uploads` — backup terpisah via `docker run --rm -v ...` atau snapshot volume di host.

## 9. Troubleshooting

| Gejala | Penyebab & solusi |
|---|---|
| `npm ci` gagal: `Missing: @emnapi/* from lock file` | Lockfile dibuat di Windows; dependensi opsional platform tidak tercatat. Regenerate di Linux — `docker run --rm -v "<path>/apps/web:/app" -w //app node:22-alpine npm install --package-lock-only` (pakai `//app`, bukan `/app`, di Git Bash agar tidak di-mangle jadi path Windows) |
| `npm ci` gagal: `package.json and package-lock.json are not in sync` | Jalankan `npm install` (di OS yang sama dengan target build) lalu commit ulang lockfile |
| API restart terus / health 500 lama | Startup normal: migrate + seed butuh 1–2 menit. Cek `docker compose logs api` |
| Web 502 di balik proxy | `HOSTNAME` di Dockerfile web sudah `0.0.0.0`; pastikan proxy mengarah ke port 3001 |
| Cookie refresh tidak tersimpan | Beda origin tanpa HTTPS, atau `COOKIE_SAMESITE=none` tanpa `Secure`. Pakai mode satu-domain atau HTTPS |
| Rate-limit salah blokir IP proxy | Set `TRUST_PROXY=1` |
| Build web sangat lama | Normal — `next build` + typecheck ~3–6 menit |
| `NEXT_PUBLIC_API_URL` berubah tapi tidak efek | Variabel `NEXT_PUBLIC_*` dibundel saat **build** — wajib `docker compose build web` ulang |
| WhatsApp tidak terkirim | `WHATSAPP_PROVIDER=log` = dummy console. Set `fonnte` + `WHATSAPP_API_TOKEN` |

## 10. Checklist go-live

- [ ] `JWT_ACCESS_SECRET`, `POSTGRES_PASSWORD`, `MINIO_ROOT_PASSWORD` diganti
- [ ] `docker-compose.prod.yml` dipakai (port internal → 127.0.0.1)
- [ ] HTTPS aktif, `TRUST_PROXY=1`, `CORS_ORIGIN`/`NEXT_PUBLIC_API_URL` sesuai domain
- [ ] `WHATSAPP_PROVIDER=fonnte` + token valid (bila notifikasi WA dipakai)
- [ ] Akun seed dev dinonaktifkan/diganti passwordnya
- [ ] `scripts/test_exam_e2e.py` PASS di environment target
- [ ] Jadwal backup `pg_dump` + volume berjalan (atau jadwal export via UI Pengaturan)
- [ ] Uji restore: file `.sql.gz` export UI berhasil dipulihkan di DB staging
