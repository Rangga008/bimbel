# Fase 7e — Responsive Audit & Fix

Bagian terakhir & penutup Fase 7. **Prasyarat: Fase 7a-7d selesai.**

## Tujuan
Audit ketat SEMUA halaman di 360px (mobile), 768px (tablet), dan ≥1024px (desktop) — perbaiki yang masih patah/kepotong/tidak enak dilihat. Ini penutup seluruh revamp UI.

## Cakupan
- Cek satu-satu semua halaman di `docs/ROLE_PAGES.md` (semua role) di 3 breakpoint: 360px, 768px, 1024px+.
- Perbaiki: elemen terpotong/overflow horizontal, teks kepanjangan tidak wrap, tabel yang masih dipaksakan tampil penuh di mobile (harus jadi card sesuai 7c), touch target kurang dari ~40px di mobile, spacing tidak konsisten antar breakpoint, gambar/logo tidak scale dengan benar.
- Cek transisi mode desktop↔mobile mulus saat resize browser (bukan cuma di device asli).
- Cek kontras warna & ukuran font tetap nyaman dibaca di HP (terutama untuk halaman yang dipakai orang tua/siswa).
- Final regression check ringan: buka tiap role, scroll semua halaman utama di 360px, screenshot mental/manual kalau ada yang janggal.

## Di luar cakupan
Fitur/logic baru — murni perbaikan visual/layout dari yang sudah ada.

## Definition of Done — sekaligus penutup seluruh Fase 7 (UI/UX Revamp & Branding)
- Semua halaman di `docs/ROLE_PAGES.md` (6 role) sudah dicek di 360px/768px/1024px, tidak ada elemen terpotong/overflow.
- Bottom nav mobile & sidebar desktop nyaman dipakai di breakpoint masing-masing.
- **Regression check akhir Fase 7:** aplikasi terasa konsisten — warna, ikon, spacing, radius, tipografi seragam dari halaman login sampai ke halaman terdalam tiap role, dengan nuansa brand Bimbel GFS (biru utama, emas untuk achievement, merah hanya untuk logo/error) yang jelas terasa tapi tidak berlebihan/norak.

## Prompt siap-pakai (ringkas)
```
Kerjakan Fase 7e sesuai docs/phases/phase-7e-responsive-audit.md.
Fase 7a-7d sudah selesai. Audit & perbaiki SEMUA halaman di 360px/768px/1024px+ berdasarkan docs/ROLE_PAGES.md.
Kalau context terbatas, minta saya audit per role dalam task terpisah, bukan sekaligus semua.
Setelah ini, seluruh Fase 7 (UI/UX Revamp & Branding) dianggap tuntas.
Kalau ada tambahan teknis di luar ini, tulis "Usulan Tambahan" saja.
Selesai: ringkas hasil + DoD yang terverifikasi + daftar halaman yang sudah dicek.
```
