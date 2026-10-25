# Deploy Aplikasi dengan Docker

Panduan menjalankan Bimbel GFS via Docker Compose — dari dev lokal sampai VPS produksi di balik reverse proxy HTTPS.

## Arsitektur container

| Service | Image | Port host | Fungsi |
|---|---|---|---|
| `web` | build `apps/web` (Next.js standalone) | **3001** → 3000 | UI semua role |
| `api` | build `apps/api` (NestJS) | **3000** | REST API (`/api/*`) |
| `postgres` | postgres:16-alpine | 5432 | Database utama |
| `redis` | redis:7-alpine | 6379 | Rate-limit/throttling terdistribusi |
| `minio` | bitnamilegacy/minio | 9000, 9001 | Object storage media (console di :9001) |

Volume persisten: `postgres-data`, `redis-data`, `minio-data`, `api-uploads` (bukti pembayaran).

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

## 5. Update/deploy ulang

```bash
git pull
docker compose build api web
docker compose up -d --force-recreate api web
```

Migrasi baru otomatis diterapkan saat API start. Cek `docker compose logs api | grep -i migrat`.

## 6. Verifikasi pasca-deploy

```bash
curl -fsS http://localhost:3000/api/health        # API sehat
curl -s -o /dev/null -w "%{http_code}" http://localhost:3001   # web 200
python scripts/test_exam_e2e.py                 # suite E2E lintas-role (23 cek)
```

## 7. Backup & restore

```bash
# Backup database
docker exec bimbel-postgres-1 pg_dump -U bimbel -Fc bimbel > backup-$(date +%F).dump

# Restore
cat backup-XXXX.dump | docker exec -i bimbel-postgres-1 pg_restore -U bimbel -d bimbel --clean

# Volume uploads (bukti pembayaran) & minio: backup via `docker run --rm -v ...`
# atau snapshot filesystem volume di host.
```

## 8. Troubleshooting

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

## 9. Checklist go-live

- [ ] `JWT_ACCESS_SECRET`, `POSTGRES_PASSWORD`, `MINIO_ROOT_PASSWORD` diganti
- [ ] `docker-compose.prod.yml` dipakai (port internal → 127.0.0.1)
- [ ] HTTPS aktif, `TRUST_PROXY=1`, `CORS_ORIGIN`/`NEXT_PUBLIC_API_URL` sesuai domain
- [ ] `WHATSAPP_PROVIDER=fonnte` + token valid (bila notifikasi WA dipakai)
- [ ] Akun seed dev dinonaktifkan/diganti passwordnya
- [ ] `scripts/test_exam_e2e.py` PASS di environment target
- [ ] Jadwal backup `pg_dump` + volume berjalan
