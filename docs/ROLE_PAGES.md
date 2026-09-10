# Matriks Role × Halaman × Mode

Sumber: `PROMPT_PEMBUATAN_APLIKASI_BIMBEL_FINAL.md` §20 + `Spesifikasi...docx` §20, diselaraskan dengan pola bottom-nav mobile (referensi: `edubimbel-mobile-manager.lovable.app`).

Legenda mobile: **[nav]** = ada di bottom nav utama, **[lainnya]** = masuk drawer "Lainnya"/"Menu".

---

## Siswa
**Dashboard/Beranda:** ringkasan jadwal hari ini, ujian mendatang, progress latsol, pengumuman terbaru, poin & rank singkat.

| Halaman | Desktop (sidebar) | Mobile |
|---|---|---|
| Beranda | ✅ | **[nav]** |
| Jadwal | ✅ | **[nav]** |
| Ujian | ✅ | **[nav]** |
| Latsol | ✅ | **[nav]** |
| Performa | ✅ | [lainnya] |
| Ranking | ✅ | [lainnya] |
| Pengumuman | ✅ | [lainnya] |
| Profil | ✅ | [lainnya] |

## Orang Tua
**Dashboard/Beranda:** status pembayaran outstanding, kehadiran anak minggu ini, jadwal terdekat, pengumuman.

| Halaman | Desktop | Mobile |
|---|---|---|
| Beranda | ✅ | **[nav]** |
| Anak (bisa >1 anak, switcher) | ✅ | **[nav]** |
| Pembayaran (invoice, riwayat, upload bukti) | ✅ | **[nav]** |
| Jadwal | ✅ | **[nav]** |
| Kehadiran | ✅ | [lainnya] |
| Program | ✅ | [lainnya] |
| Performa (anak) | ✅ | [lainnya] |
| Pengumuman | ✅ | [lainnya] |
| Profil | ✅ | [lainnya] |

## Tutor
**Dashboard/Beranda:** sesi hari ini, kelompok yang diampu, tugas koreksi tertunda, ringkasan honor bulan berjalan.

| Halaman | Desktop | Mobile |
|---|---|---|
| Beranda | ✅ | **[nav]** |
| Kelompok | ✅ | **[nav]** |
| Jadwal/Sesi | ✅ | **[nav]** |
| Absensi (input per sesi) | ✅ | **[nav]** |
| Latsol (buat/kelola) | ✅ | [lainnya] |
| Ujian (buat/kelola, proctor) | ✅ | [lainnya] |
| Nilai | ✅ | [lainnya] |
| Pembahasan | ✅ | [lainnya] |
| Profil & Status Kepegawaian | ✅ | [lainnya] |

## Admin Finance
**Dashboard:** cashflow ringkas, outstanding invoice, verifikasi bukti pending, kas/bank harian.

| Halaman | Desktop (sidebar utama) | Mobile |
|---|---|---|
| Dashboard | ✅ | **[nav]** |
| Siswa | ✅ | **[nav]** shortcut |
| Pendaftaran | ✅ | **[nav]** shortcut / Menu |
| Invoice | ✅ | Menu |
| Pembayaran | ✅ | Menu |
| Bukti (verifikasi upload) | ✅ | Menu |
| Kas/Bank | ✅ | Menu |
| RAB | ✅ | Menu |
| Pengeluaran | ✅ | Menu |
| Payroll | ✅ | Menu |
| Laporan | ✅ | Menu |
| Pengaturan | ✅ | Menu |

## Admin Academic
**Dashboard:** ringkasan kelompok aktif, jadwal hari ini, ujian berjalan, materi terbaru diunggah.

| Halaman | Desktop (sidebar utama) | Mobile |
|---|---|---|
| Dashboard | ✅ | **[nav]** |
| Program | ✅ | **[nav]** shortcut |
| Level | ✅ | Menu |
| Kelompok | ✅ | **[nav]** shortcut / Menu |
| Tutor | ✅ | Menu |
| Jadwal | ✅ | Menu |
| Materi | ✅ | Menu |
| Soal (bank soal) | ✅ | Menu |
| Latsol | ✅ | Menu |
| Ujian | ✅ | Menu |
| Analisis | ✅ | Menu |
| Ranking | ✅ | Menu |
| Laporan | ✅ | Menu |

## Owner
**Dashboard:** KPI bisnis (siswa aktif, revenue, piutang, retensi, utilisasi budget), alert operasional.

| Halaman | Desktop (sidebar utama) | Mobile |
|---|---|---|
| Dashboard KPI | ✅ | **[nav]** |
| Siswa | ✅ | **[nav]** shortcut |
| Akademik | ✅ | **[nav]** shortcut / Menu |
| Tutor | ✅ | Menu |
| Keuangan | ✅ | Menu |
| Piutang | ✅ | Menu |
| RAB vs Actual | ✅ | Menu |
| Payroll | ✅ | Menu |
| Laporan | ✅ | Menu |
| Audit (log) | ✅ | Menu |

---

## Catatan implementasi
- Untuk Admin/Owner, 2 shortcut di bottom nav mobile dipilih berdasarkan **frekuensi pemakaian tertinggi** per role (bisa disesuaikan setelah user testing) — default di atas adalah tebakan awal yang wajar, boleh diubah di Fase 1/UI polish tanpa mengubah struktur data.
- Semua tabel di atas adalah **acuan konten menu**, bukan urutan wajib render — ikuti kaidah UI di `ui-mobile-desktop.instructions.md` untuk detail komponen.
- Halaman "Profil" di semua role wajib memuat: ubah password, notifikasi preference, logout, dan (untuk tutor) status kepegawaian.
