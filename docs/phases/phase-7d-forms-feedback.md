# Fase 7d — Forms & Feedback Revamp

Bagian keempat Fase 7. **Prasyarat: Fase 7a selesai** (7b/7c tidak wajib tapi disarankan sudah jalan).

## Tujuan
Perbarui semua form, validasi, dan feedback interaktif (toast, modal, loading, empty state) di seluruh halaman.

## Cakupan
- **Form:** label jelas di atas input (bukan placeholder-only), inline validation dengan ikon (✓/✕) + pesan singkat human-friendly, required field ditandai jelas, tombol submit disabled saat invalid/loading dengan spinner.
- **Toast notification:** posisi konsisten, ikon sesuai jenis (sukses/error/warning/info), auto-dismiss wajar, warna sesuai token (success hijau, error `brand-red`, warning `brand-gold`/amber).
- **Modal/dialog konfirmasi:** untuk aksi berisiko (hapus, refund, lock exam, dst) — judul jelas, penjelasan konsekuensi singkat, tombol aksi dibedakan warna (destructive = merah, aman = brand-blue).
- **Loading state:** skeleton loading (bukan spinner polos) untuk halaman/card yang lagi fetch data, konsisten bentuknya dengan konten asli yang akan muncul.
- **Empty state:** ilustrasi/ikon besar + teks penjelas + (kalau relevan) tombol aksi ("Belum ada siswa, + Tambah Siswa").
- Terapkan ke form-form utama: pendaftaran siswa, buat invoice, upload bukti bayar, buat soal, buat jadwal, dsb.

## Di luar cakupan
Layout besar dashboard/tabel (7c), audit responsive breakpoint detail (7e).

## Definition of Done
- Minimal 5 form utama (lintas modul: people, finance, exam, dsb) sudah pakai pola validasi & loading state baru.
- Semua toast di aplikasi konsisten posisi & styling-nya.
- Minimal 3 modal konfirmasi aksi berisiko sudah direvamp.
- Skeleton loading terpasang di minimal 3 halaman yang fetch data besar (dashboard, tabel).

## Prompt siap-pakai (ringkas)
```
Kerjakan Fase 7d sesuai docs/phases/phase-7d-forms-feedback.md.
Fase 7a sudah selesai. Perbarui TAMPILAN form/toast/modal/loading/empty-state yang sudah ada, JANGAN ubah logic validasi bisnis yang sudah benar (cuma tampilannya).
Kalau context terbatas, minta saya kerjakan per modul dalam task terpisah.
Kalau ada tambahan teknis di luar ini, tulis "Usulan Tambahan" saja.
Selesai: ringkas hasil + DoD yang terverifikasi.
```
