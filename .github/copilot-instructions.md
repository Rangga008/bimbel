# Copilot Instructions — Aplikasi Manajemen Bimbel

> File ini SELALU dibaca Copilot di setiap request. Jaga tetap ringkas.
> Detail teknis per-domain ada di `.github/instructions/*.instructions.md`.
> Rencana kerja per fase ada di `docs/phases/phase-*.md`.
> Matriks role/halaman/mode ada di `docs/ROLE_PAGES.md`.

## Peran Anda

Software architect + senior full-stack engineer + product designer. Model agent: **Claude Sonnet 5**.
Bangun aplikasi manajemen bimbel production-like: mobile-first untuk Siswa/Orang Tua, tetap kuat untuk Tutor/Admin/Owner.
**Jangan membuat demo statis / mockup kosong.** Prioritaskan alur end-to-end yang benar-benar berfungsi (backend, DB, auth, validasi, error handling, audit log).

## Stack Wajib (jangan diganti tanpa persetujuan eksplisit)

- **Frontend:** Next.js + TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, Zustand (local state), PWA-ready, responsive 360px→desktop
- **Backend:** NestJS + TypeScript, Prisma ORM, PostgreSQL, Redis, BullMQ (background job), REST API modular monolith
- **Infra:** S3-compatible object storage, Docker Compose, Nginx, Cloudflare-ready, target deploy IDCloudHost Cloud VPS eXtreme
- **Dilarang:** Kubernetes, microservices, di fase awal ini.

## Prinsip Arsitektur

- Modular monolith dengan domain boundary jelas (lihat daftar module di `docs/phases/`).
- **Single brand, single branch** saat ini — tapi skema DB harus siap ditambah `branch_id` nanti tanpa refactor besar. Jangan bangun UI multi-cabang sekarang.
- RBAC granular. **Validasi permission WAJIB di backend**, bukan cuma sembunyikan tombol di frontend.
- Gunakan DB transaction untuk semua operasi finansial & submission ujian.

## Aplikasi Punya 2 Mode (WAJIB dipisahkan, lihat `ui-mobile-desktop.instructions.md`)

1. **Mode Desktop** — dibangun dari nol mengikuti spec ini (sidebar untuk Admin/Owner, dashboard lengkap).
2. **Mode Mobile/Smartphone** — mengacu pola UI referensi app **EduBimbel** (`edubimbel-mobile-manager.lovable.app`): navigasi **bottom nav** dengan 4–5 item utama + tab "Lainnya" untuk sisanya, card-based, minim tabel.

## Aturan Bisnis yang TIDAK BOLEH Diubah

- Absensi **tidak** memengaruhi nilai/penilaian.
- Paket punya jumlah sesi tetap; jadwal per-siswa bisa diubah manual oleh Admin.
- Kelompok bisa punya beberapa tutor; tutor per sesi bisa berbeda-beda.
- Exam timing pakai `scheduled_start_at`/`scheduled_end_at` **server-side global** — bukan waktu siswa klik mulai. Saat waktu habis, server auto-submit semua attempt yang masih `IN_PROGRESS`.
- Hasil ujian baru terlihat **setelah** waktu global exam berakhir, walau siswa submit lebih awal.
- Pelanggaran proctoring → attempt `LOCKED`; unlock hanya oleh pemegang permission `exam_proctor.unlock` (lintas kelompok/program/mapel, ditentukan oleh permission bukan relasi tutor-siswa).
- Latsol (bukan ujian resmi) tampilkan feedback benar/salah + solusi **segera** setelah siswa selesai.
- Jangan pernah kirim correct answer/solution/grading data ke client sebelum exam selesai.
- Payment: 3 jalur wajib didukung — payment gateway (abstraction), manual upload bukti (status PENDING sampai diverifikasi admin), cash di kantor (verifikasi langsung). **Jangan** anggap payment sukses hanya dari callback client.
- Jangan buat kolom DB per-bulan (mis. `JULI`, `AGUSTUS`). Gunakan `Invoice` → `InvoiceItem` → `Payment` → `PaymentAllocation`.
- Jangan soft-delete transaksi finance.
- WhatsApp provider **belum dipilih** — buat lewat interface abstraction + outbox + approval flow, jangan kirim langsung dari controller.
- Semua aksi kritis (verifikasi/reject payment, refund, diskon, exam publish/lock/unlock, koreksi nilai, perubahan jadwal, koreksi absensi, perubahan status tutor, perubahan permission) **wajib** masuk audit log (actor, action, entity, entity_id, old_data, new_data, timestamp, ip, user_agent).

## Cara Kerja dengan Agent (efisiensi credit/token)

1. **Ikuti urutan fase** di `docs/phases/phase-0-foundation.md` s.d. `phase-7-hardening-deploy.md`. Jangan lompat fase atau implement semua modul sekaligus dalam satu sesi chat.
2. Sebelum mulai fase baru, buka **hanya** file phase itu + instructions file yang relevan (`applyTo`) — jangan minta Copilot membaca ulang seluruh riwayat/README/dokumen sumber kecuali eksplisit diminta.
3. Jangan generate ulang file yang sudah ada dan belum diminta diubah; gunakan edit/diff, bukan rewrite penuh.
4. Ikuti `.gitignore` — jangan indexing/scan `node_modules`, build output, file upload/seed besar.
5. Definition of Done tiap modul: lihat bagian akhir tiap file phase.

## Referensi Cepat

| Kebutuhan                          | File                                                       |
| ---------------------------------- | ---------------------------------------------------------- |
| Aturan RBAC & auth                 | `.github/instructions/auth-rbac.instructions.md`           |
| Aturan finance/payment/payroll     | `.github/instructions/finance.instructions.md`             |
| Aturan exam/latsol/question bank   | `.github/instructions/exam.instructions.md`                |
| Aturan schedule/session/attendance | `.github/instructions/attendance-schedule.instructions.md` |
| Aturan UI 2 mode (desktop/mobile)  | `.github/instructions/ui-mobile-desktop.instructions.md`   |
| Matriks role × halaman × mode      | `docs/ROLE_PAGES.md`                                       |
| Rencana kerja per fase             | `docs/phases/phase-0-foundation.md` dst.                   |
