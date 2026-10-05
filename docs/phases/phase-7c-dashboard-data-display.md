# Fase 7c — Dashboard & Data Display Revamp

Bagian ketiga Fase 7. **Prasyarat: Fase 7a & 7b selesai.**

## Tujuan
Perbarui tampilan dashboard, kartu KPI, tabel data, dan chart di semua halaman yang sudah dibangun Fase 1-6 — logikanya TIDAK berubah, cuma tampilannya.

## Cakupan
- **Dashboard/Beranda tiap role:** kartu KPI dengan ikon relevan (mis. ikon uang untuk revenue, ikon siswa untuk jumlah siswa), angka besar & jelas, indikator tren (naik/turun) kalau relevan, grouping visual yang jelas per section.
- **Tabel data (desktop):** header sticky, sorting jelas, pagination modern (bukan cuma angka polos), row hover state, aksi (edit/hapus) pakai ikon bukan teks "Edit"/"Hapus" polos, empty state kalau data kosong.
- **List/card (mobile):** ganti tabel berat dengan card ringkas + tap-to-detail (sesuai aturan 05-ui-mobile-desktop.md yang sudah ada), informasi terpenting saja yang tampil di card, detail lengkap di halaman/modal detail.
- **Chart** (kalau ada, mis. tren nilai, RAB vs Actual): styling konsisten dengan token warna brand, tidak terlalu ramai, ada label jelas.
- Terapkan ke SEMUA halaman list/dashboard dari Fase 1-6 (Siswa, Kelompok, Jadwal, Invoice, Payroll, Ranking, dst) — cek satu-satu di `docs/ROLE_PAGES.md`.

## Di luar cakupan
Form input & validasi (7d), audit responsive detail per breakpoint (7e — di sini cukup terlihat wajar, audit ketat di 7e).

## Definition of Done
- Dashboard tiap role (6 role) sudah pakai kartu KPI bergaya baru dengan ikon.
- Minimal 3 halaman tabel data besar (mis. Siswa, Invoice, Payroll) sudah direvamp (sorting/pagination/empty state/aksi berikon).
- Minimal 3 halaman yang di mobile pakai card (bukan tabel) sudah direvamp.

## Prompt siap-pakai (ringkas)
```
Kerjakan Fase 7c sesuai docs/phases/phase-7c-dashboard-data-display.md.
Fase 7a & 7b sudah selesai. Perbarui TAMPILAN dashboard/tabel/card yang sudah ada dari Fase 1-6, JANGAN ubah logic bisnis/data yang sudah benar.
Kalau context terbatas, minta saya kerjakan per role/per halaman dalam task terpisah.
Kalau ada tambahan teknis di luar ini, tulis "Usulan Tambahan" saja.
Selesai: ringkas hasil + DoD yang terverifikasi.
```
