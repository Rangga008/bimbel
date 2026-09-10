---
applyTo: "apps/web/**,components/**"
---

# Instruksi: UI 2 Mode — Desktop & Mobile

Aplikasi ini **wajib** punya dua pengalaman berbeda yang responsive di breakpoint yang sama (bukan dua aplikasi terpisah): **Desktop** dan **Mobile/Smartphone** (360px–430px ke atas).

## Mode Desktop — dibangun dari nol
- Sidebar navigasi persisten untuk **Admin (Finance/Academic) & Owner**.
- Dashboard card-based + tabel data lengkap (data tables dengan pagination/filter server-side) — desktop adalah tempat kerja utama Admin/Owner.
- Tetap profesional, bukan "software administrasi lama" — hindari clutter, gunakan whitespace dan grouping yang jelas.

## Mode Mobile — acuan pola UI dari demo **EduBimbel** (`edubimbel-mobile-manager.lovable.app`)
Pola navigasi: **bottom navigation bar**, maksimal 4–5 item ikon+label, item terakhir "Lainnya" membuka daftar menu penuh (bottom sheet/drawer) untuk menu yang tidak muat.

| Role | Bottom nav (item utama) | Masuk ke "Lainnya" |
|---|---|---|
| Siswa | Beranda · Jadwal · Ujian · Latsol | Performa, Ranking, Pengumuman, Profil |
| Orang Tua | Beranda · Anak · Pembayaran · Jadwal | Kehadiran, Program, Performa Anak, Pengumuman, Profil |
| Tutor | Beranda · Kelompok · Jadwal/Sesi · Absensi | Latsol, Ujian, Nilai, Pembahasan, Profil & Status Kepegawaian |
| Admin Finance, Admin Academic, Owner | Beranda · [2 shortcut paling sering dipakai role ini] · **Menu** (buka drawer semua menu, mirror sidebar desktop) | — |

Detail lengkap menu tiap role: lihat `docs/ROLE_PAGES.md`.

## Kaidah UI umum (berlaku kedua mode, tegas dari spesifikasi)
Gunakan: card-based dashboard, progress indicator, kalender/list jadwal jelas, status chip/badge, skeleton loading, empty state informatif, confirmation modal untuk aksi berisiko, toast notification, inline validation, accessible focus state, touch target besar (mobile), typografi mudah dibaca orang tua/non-teknis.

Hindari: tabel berat di mobile (ganti dengan card/list ringkas + tap-to-detail), dashboard penuh angka tanpa konteks, animasi berat, gradient/dekorasi berlebihan, alur banyak klik untuk tugas sederhana.

## Implementasi
- Gunakan satu design-token/theme system (Tailwind config + shadcn) untuk kedua mode — jangan duplikasi style.
- Deteksi mode lewat responsive breakpoint (bukan device-detection/user-agent) supaya tetap benar saat browser di-resize atau di tablet.
- Komponen navigasi: buat `<AppShellDesktop>` (sidebar) dan `<AppShellMobile>` (bottom nav + drawer "Lainnya") sebagai layout terpisah, dipilih otomatis oleh breakpoint di root layout per role.

## Definition of Done modul ini
- Setiap halaman role render benar di 360px (mobile) dan ≥1024px (desktop) tanpa elemen terpotong.
- Bottom nav mobile berfungsi untuk seluruh role sesuai tabel di atas, termasuk drawer "Lainnya".
- Sidebar desktop Admin/Owner mencakup semua menu di `docs/ROLE_PAGES.md`.
