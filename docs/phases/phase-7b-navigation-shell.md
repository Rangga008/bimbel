# Fase 7b — Navigation & Layout Shell Revamp

Bagian kedua Fase 7. **Prasyarat: Fase 7a selesai** (design token & komponen dasar sudah pakai brand baru).

## Tujuan
Perbarui tampilan `<AppShellDesktop>` (sidebar) dan `<AppShellMobile>` (bottom nav) yang dibuat di Fase 0 — sekarang dengan token & ikon baru dari 7a.

## Cakupan
- **Sidebar desktop:** header dengan logo GFS, grouping menu jelas (pakai heading kecil per grup kalau menu banyak — lihat Admin Finance/Academic/Owner di `docs/ROLE_PAGES.md`), ikon di tiap item (lucide-react), active state pakai `brand-blue`, collapsible (icon-only) untuk hemat ruang di layar lebih kecil/tablet.
- **Bottom nav mobile:** ikon+label tiap item, active state jelas (warna + indikator), tombol "Lainnya" dengan ikon khas (mis. grid/menu icon), drawer "Lainnya" tampil rapi dengan ikon per item.
- **Header/topbar:** breadcrumb, nama user + avatar/inisial, notification bell dengan badge counter, (opsional) search.
- Transisi antar halaman & buka/tutup drawer/sidebar pakai animasi halus (bukan instan kaku, tapi juga jangan berlebihan).

## Di luar cakupan
Konten dashboard/halaman itu sendiri (7c), form (7d).

## Definition of Done
- Sidebar & bottom nav semua role sudah pakai token/ikon baru dari 7a, terlihat konsisten dengan `docs/ROLE_PAGES.md`.
- Collapse sidebar desktop berfungsi, tetap bisa navigasi saat collapsed (icon-only + tooltip).
- Bottom nav & drawer "Lainnya" nyaman disentuh di layar 360px (touch target cukup besar, tidak berdempetan).

## Prompt siap-pakai (ringkas)
```
Kerjakan Fase 7b sesuai docs/phases/phase-7b-navigation-shell.md.
Fase 7a sudah selesai, pakai token/ikon yang ada. Perbarui AppShellDesktop & AppShellMobile yang sudah dibuat Fase 0, jangan bikin ulang dari nol strukturnya.
Kalau ada tambahan teknis di luar ini, tulis "Usulan Tambahan" saja.
Selesai: ringkas hasil + DoD yang terverifikasi.
```
