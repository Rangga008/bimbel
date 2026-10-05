# Fase 7a — Design System Foundation

Bagian pertama Fase 7 (UI/UX Revamp & Branding). Urutan lengkap:
**7a Design System → 7b Navigation & Layout Shell → 7c Dashboard & Data Display → 7d Forms & Feedback → 7e Responsive Audit.**
Prasyarat: Fase 0-6 sudah ada (revamp ini memperbaiki UI yang sudah dibangun, bukan bikin baru dari nol).

## Tujuan
Bangun fondasi desain (token warna/tipografi/spacing/radius/ikon) sesuai brand Bimbel GFS, terapkan ke komponen dasar `components/ui/*` — **belum** menyentuh halaman-halaman spesifik (itu 7b-7e).

## Cakupan
Ikuti section **"Brand & Design Tokens"** & **"Ikon/simbol"** di `.clinerules/05-ui-mobile-desktop.md` (atau `.github/instructions/ui-mobile-desktop.instructions.md`) sepenuhnya. Ringkas:
- Update `tailwind.config` dengan token warna brand-blue (scale 50-900), brand-gold, brand-red, success, warning, neutral scale.
- Setup font modern (Inter/Plus Jakarta Sans) via next/font.
- Konsisten border-radius & shadow scale.
- Pasang **lucide-react** sebagai satu-satunya icon library, hapus/ganti kalau ada icon library lain yang kepakai.
- Update ulang komponen dasar di `components/ui/*` (button, card, input, badge, dialog, dsb — yang sudah dibuat Fase 0) supaya pakai token baru: warna, radius, shadow, focus state.
- Logo (`docs/brand-assets/logo-gfs.png`) dipasang di favicon.

## Di luar cakupan
Halaman spesifik per role (dashboard, form, tabel) — token & komponen dasar dulu, penerapan ke halaman di 7b-7e.

## Definition of Done
- `tailwind.config` punya semua token warna terdefinisi, bisa dipakai via class (mis. `bg-brand-blue-600`).
- Semua komponen di `components/ui/*` sudah pakai token baru, terlihat konsisten kalau dibuka di Storybook/halaman contoh sederhana.
- Favicon browser tab menampilkan logo GFS.

## Prompt siap-pakai (ringkas)
```
Kerjakan Fase 7a sesuai docs/phases/phase-7a-design-system.md
dan section Brand & Design Tokens di .clinerules/05-ui-mobile-desktop.md.
Fokus HANYA design token + komponen dasar components/ui/*. JANGAN sentuh halaman spesifik dulu (itu fase 7b-7e).
Pakai lucide-react sebagai satu-satunya icon library.
Kalau ada tambahan teknis di luar ini, tulis "Usulan Tambahan" saja.
Selesai: ringkas hasil + DoD yang terverifikasi.
```
