---
applyTo: "apps/web/**,components/**"
---

# Instruksi: UI 2 Mode — Desktop & Mobile

Aplikasi ini **wajib** punya dua pengalaman berbeda yang responsive di breakpoint yang sama (bukan dua aplikasi terpisah): **Desktop** dan **Mobile/Smartphone** (360px–430px ke atas).

## Brand & Design Tokens — Bimbel GFS (Great Formula Solution)
Logo resmi ada di `docs/brand-assets/logo-gfs.png`. Warna di bawah adalah estimasi visual dari logo (bukan sample pixel-perfect) — kalau ada file vektor/source logo asli, sample ulang hex-nya untuk presisi, tapi untuk UI digital warna TETAP perlu di-tone-down dari saturasi logo cetak (lihat catatan tiap warna).

| Token | Hex (estimasi) | Pemakaian |
|---|---|---|
| `brand-blue-600` (primary) | `#0E8FDB` | Warna utama UI: tombol primary, link, active nav item, header/sidebar accent |
| `brand-blue-50..900` | scale dari primary | Background subtle (50-100), border (200-300), text-on-light (700-900) |
| `brand-gold-400` (accent) | `#FFC400` | **Aksen saja** — badge ranking/poin, highlight achievement, ikon bintang/reward. Jangan jadi warna background besar |
| `brand-red-600` (logo/danger) | `#E11D2E` | **Hanya** untuk: reproduksi logo, dan status error/danger/destructive (hapus, gagal, ditolak). Jangan dipakai sebagai aksen dekoratif |
| `success-600` | `#16A34A` | Status sukses/lunas/hadir (bukan dari logo, warna semantik standar) |
| `warning-500` | reuse `brand-gold-400` atau `#F59E0B` | Status pending/menunggu (selaras dengan aksen emas) |
| `neutral-50..900` | skala abu-abu modern (mis. Tailwind `slate`) | Background halaman, card, border, text — dominan di UI, warna brand dipakai sebagai aksen bukan dasar |

**Prinsip pemakaian:** background halaman & card mayoritas putih/neutral-50, teks pakai neutral-700/900, `brand-blue` dipakai untuk elemen interaktif & identitas (bukan blok warna besar), `brand-gold` benar-benar dijatah cuma untuk momen "achievement" (ranking, badge, poin) supaya tetap terasa istimewa, `brand-red` khusus logo & error supaya user langsung asosiasikan merah = perlu perhatian/salah.

**Tipografi:** satu font sans-serif modern & mudah dibaca (mis. Inter atau Plus Jakarta Sans) untuk seluruh app — jangan campur banyak font. Skala: heading tegas (semibold/bold), body reguler, angka-angka penting (nilai, uang, skor) boleh pakai tabular numbers supaya rapi.

**Radius & shadow:** border-radius konsisten (mis. `rounded-xl` untuk card, `rounded-lg` untuk button/input) — jangan campur siku tajam dan sangat bulat di halaman sama. Shadow tipis/elevation halus untuk card (jangan shadow berat/dramatis — kesan modern itu subtle, bukan flat total & bukan skeuomorphic berat).

**Logo di aplikasi:** tampil di halaman login (jelas, di atas form), header sidebar desktop (versi kecil/icon-only saat collapsed), dan sebagai favicon. Jangan taruh logo dengan seluruh 4 warna penuh sebagai dekorasi berulang di banyak tempat — cukup di titik-titik brand utama.

**Ikon/simbol (wajib, untuk user-friendly & enak dilihat):** pakai 1 set ikon konsisten dari **lucide-react** (sudah sejalan dengan shadcn/ui) — jangan campur beberapa icon library berbeda dalam 1 aplikasi. Aturan pakai:
- Tiap item navigasi (sidebar desktop & bottom nav mobile) **wajib** punya ikon + label teks, bukan teks polos saja — ikon mempercepat pengenalan menu terutama untuk orang tua/siswa yang kurang teknis.
- Status pakai kombinasi ikon+warna+teks (bukan warna saja) — mis. ✓ hijau "Lunas", ⏳ kuning "Pending", ✕ merah "Ditolak" — supaya tetap jelas untuk yang buta warna.
- Aksi penting (bayar, upload bukti, mulai ujian, absen) dikasih ikon di tombolnya, bukan cuma teks — mempercepat scan visual terutama di mobile.
- Empty state & halaman kosong pakai ilustrasi/ikon besar + teks singkat penjelas, bukan halaman putih kosong polos.
- Ukuran ikon konsisten per konteks: 16px (inline dengan teks kecil), 20px (default UI: tombol, list item), 24px (nav item), jangan sembarang ukuran beda-beda di tempat yang setara.
- Kontras ikon terhadap background wajib cukup (pakai `neutral-600/700` untuk ikon non-aktif, `brand-blue-600` untuk ikon aktif/selected) — hindari ikon abu-abu sangat terang yang susah dilihat di HP di luar ruangan.

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
