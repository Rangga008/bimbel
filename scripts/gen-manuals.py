#!/usr/bin/env python3
"""Generate Word manuals untuk Admin Finance & Admin Academic.
Isi mencakup semua menu/fitur per role + placeholder screenshot."""
from docx import Document
from docx.shared import Pt, RGBColor, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH

BRAND = RGBColor(0x0B, 0x5C, 0xAB)
GRAY = RGBColor(0x55, 0x55, 0x55)

def shot(doc, caption):
    p = doc.add_paragraph()
    r = p.add_run(f'[ Screenshot: {caption} ]')
    r.italic = True
    r.font.color.rgb = GRAY
    r.font.size = Pt(9)
    p.paragraph_format.space_before = Pt(4)
    p.paragraph_format.space_after = Pt(8)
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER

def h1(doc, t): doc.add_heading(t, 1)
def h2(doc, t): doc.add_heading(t, 2)
def h3(doc, t): doc.add_heading(t, 3)
def para(doc, t, bold=False):
    p = doc.add_paragraph()
    r = p.add_run(t); r.bold = bold
    return p
def bullets(doc, items):
    for i in items:
        doc.add_paragraph(i, style='List Bullet')
def steps(doc, items):
    for i in items:
        doc.add_paragraph(i, style='List Number')
def tip(doc, t):
    p = doc.add_paragraph()
    r = p.add_run('Tips: '); r.bold = True
    p.add_run(t)

def cover(doc, role, title, subtitle):
    for _ in range(6): doc.add_paragraph()
    p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run('BIMBEL GFS'); r.font.size = Pt(16); r.font.color.rgb = BRAND; r.bold = True
    p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run(title); r.font.size = Pt(28); r.bold = True
    p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.add_run(subtitle).font.size = Pt(13)
    doc.add_paragraph()
    p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run(f'Panduan untuk role: {role}'); r.font.size = Pt(12); r.bold = True
    doc.add_page_break()

def intro(doc, audience):
    h1(doc, 'Pendahuluan')
    para(doc, audience)
    bullets(doc, [
        'Login menggunakan email/nomor HP + password yang diberikan admin.',
        'Menu sidebar di sebelah kiri dikelompokkan per kategori; klik nama menu untuk membuka halaman.',
        'Ikon lonceng di kanan atas menampilkan notifikasi; klik avatar untuk logout.',
        'Tampilan menyesuaikan desktop dan mobile — di HP sidebar bisa dibuka lewat ikon garis tiga.',
        'Setiap perubahan penting tercatat di audit log sistem.',
    ])
    para(doc, 'Setiap bab berikut menjelaskan satu menu beserta fungsinya dan langkah penggunaan umum. '
              'Tempat kosong bertanda [ Screenshot: ... ] disediakan untuk menempel tangkapan layar halaman terkait.', bold=False)
    doc.add_page_break()

def table(doc, headers, rows):
    t = doc.add_table(rows=1, cols=len(headers))
    t.style = 'Light Grid Accent 1'
    for i, htxt in enumerate(headers):
        t.rows[0].cells[i].paragraphs[0].add_run(htxt).bold = True
    for row in rows:
        cells = t.add_row().cells
        for i, v in enumerate(row):
            cells[i].text = v

# ============================================================ FINANCE
def build_finance():
    doc = Document()
    cover(doc, 'ADMIN FINANCE', 'Manual Pengguna', 'Sistem Manajemen Bimbel GFS — Modul Keuangan & Administrasi')
    intro(doc,
        'Manual ini ditujukan untuk staf Admin Finance. Role ini menangani seluruh siklus keuangan '
        'bimbel: pendaftaran & tagihan siswa, pembayaran, penagihan piutang, kas/bank, pengeluaran, '
        'RAB (anggaran), payroll tutor, hingga laporan keuangan. Admin Finance juga mengelola data '
        'siswa/orang tua, pengaturan sistem, akun pengguna, dan antrean notifikasi WhatsApp.')

    h1(doc, '1. Dashboard')
    para(doc, 'Halaman awal setelah login. Menampilkan ringkasan kondisi keuangan dan operasional hari ini.')
    bullets(doc, [
        'Ringkasan kas & tagihan: total piutang berjalan, pembayaran masuk periode ini.',
        'Pembayaran yang menunggu verifikasi — klik untuk langsung memproses.',
        'Invoice yang akan jatuh tempo.',
        'Shortcut ke fungsi harian yang sering dipakai.',
    ])
    shot(doc, 'Dashboard Admin Finance — kartu ringkasan dan daftar pembayaran pending')

    h1(doc, '2. Data Siswa')
    para(doc, 'Kelola data siswa: melihat daftar, detail profil, kelompok yang diikuti, tagihan, dan riwayat.')
    bullets(doc, [
        'Pencarian & filter siswa berdasarkan nama/kelompok/status.',
        'Halaman detail siswa: data diri, orang tua, kelompok, invoice, kehadiran.',
        'Kirim reminder WhatsApp ke orang tua siswa (tagihan, jadwal mingguan, performa bulanan).',
        'Nonaktifkan siswa yang sudah tidak aktif (data historis tetap tersimpan).',
    ])
    shot(doc, 'Daftar siswa dengan kolom pencarian dan filter')
    shot(doc, 'Halaman detail siswa — profil, kelompok, dan tagihan')

    h1(doc, '3. Data Orang Tua')
    para(doc, 'Kelola akun orang tua/wali yang terhubung ke satu atau lebih anak.')
    bullets(doc, [
        'Melihat orang tua beserta anak-anak yang terhubung.',
        'Mengaitkan/memutuskan relasi orang tua ↔ siswa.',
        'Mengirim reminder WhatsApp langsung ke orang tua.',
        'Melihat statement (ringkasan tagihan) per orang tua.',
    ])
    shot(doc, 'Daftar orang tua beserta anak yang terhubung')

    h1(doc, '4. Pendaftaran')
    para(doc, 'Memproses pendaftaran siswa baru — baik yang mendaftar lewat form publik maupun pendaftaran manual oleh admin.')
    steps(doc, [
        'Buka menu Pendaftaran — daftar pendaftar baru (status MENUNGGU) tampil di atas.',
        'Klik pendaftar untuk melihat detail: nama, program & jenjang pilihan, kontak.',
        'Verifikasi data, lalu setujui — sistem membuat akun siswa & menghubungkan ke orang tua.',
        'Setelah disetujui, lakukan penempatan ke kelompok dan terbitkan invoice pertama.',
        'Pendaftar juga bisa ditolak dengan catatan alasan.',
    ])
    bullets(doc, [
        'Pendaftaran mandiri oleh orang tua dari portal juga masuk ke antrean yang sama.',
        'Link info pendaftaran publik: https://s.id/info-daftarGFS2627.',
    ])
    shot(doc, 'Antrean pendaftaran dengan status MENUNGGU / DISETUJUI / DITOLAK')

    h1(doc, '5. Program')
    para(doc, 'Daftar program bimbel: Kelas Reguler (multi-mapel), Kelas Extra, dan Kelas Privat.')
    bullets(doc, [
        'Melihat daftar program beserta kode, kategori, dan jenjang yang tersedia.',
        'Program menentukan struktur kelas dan skema penagihan.',
    ])
    shot(doc, 'Daftar program beserta kategori')

    h1(doc, '6. Kelompok')
    para(doc, 'Kelompok belajar per program & jenjang. Admin Finance melihat struktur kelompok untuk kebutuhan penagihan.')
    bullets(doc, [
        'Daftar kelompok beserta kode, program, jenjang, kapasitas, dan jumlah anggota.',
        'Detail kelompok: anggota siswa, tutor pengampu, dan sesi yang berjalan.',
        'Pembuatan & pengaturan kelompok akademik ditangani Admin Academic.',
    ])
    shot(doc, 'Daftar kelompok dan detail anggota')

    h1(doc, '7. Harga Program')
    para(doc, 'Mengatur tarif per program/jenjang dan harga tambahan — menjadi dasar nominal invoice otomatis.')
    bullets(doc, [
        'Harga per program & jenjang (paket per bulan/per periode).',
        'Biaya tambahan (pendaftaran, materi, dll.) per paket.',
        'Perubahan harga berlaku untuk invoice yang diterbitkan setelahnya — invoice lama tidak berubah.',
    ])
    tip(doc, 'Pastikan harga benar sebelum akhir bulan — generate invoice massal memakai harga saat itu.')
    shot(doc, 'Tabel harga per program dan jenjang')

    h1(doc, '8. Invoice')
    para(doc, 'Menerbitkan dan mengelola tagihan siswa.')
    steps(doc, [
        'Buat invoice individual dari halaman detail siswa, atau generate massal per periode.',
        'Setiap invoice punya nomor unik, tanggal jatuh tempo, rincian item, dan status (DRAFT/ISSUED/LUNAS/BATAL).',
        'Invoice ISSUED otomatis tampil di portal orang tua.',
        'Pembayaran yang diverifikasi otomatis menurunkan sisa tagihan; invoice LUNAS menampilkan riwayat pembayaran.',
        'Invoice keliru bisa dibatalkan/dihapus selama belum ada pembayaran.',
    ])
    shot(doc, 'Daftar invoice dengan status dan sisa tagihan')
    shot(doc, 'Detail invoice — rincian item dan riwayat pembayaran')

    h1(doc, '9. Pembayaran')
    para(doc, 'Mencatat pembayaran dan memverifikasi pembayaran yang dikirim orang tua lewat gateway/bukti transfer.')
    bullets(doc, [
        'Pembayaran manual (tunai/transfer yang dicek manual): input nominal, metode, tanggal, invoice tujuan.',
        'Verifikasi pembayaran online: cocokkan dengan bukti, lalu setujui atau tolak.',
        'Riwayat pembayaran per invoice & per siswa dapat ditelusuri.',
        'Struk pembayaran dapat dicetak/diunduh sebagai bukti untuk orang tua.',
    ])
    shot(doc, 'Form input pembayaran dan daftar yang menunggu verifikasi')

    h1(doc, '10. Bukti Pembayaran')
    para(doc, 'Antrean bukti transfer/payment yang diunggah orang tua dari portal.')
    steps(doc, [
        'Buka bukti baru — tampil foto/scan transfer beserta invoice terkait.',
        'Cocokkan nominal & pengirim dengan mutasi/invoice.',
        'Setujui → saldo invoice otomatis berkurang dan status diperbarui.',
        'Tolak dengan alasan → orang tua mendapat notifikasi untuk mengunggah ulang.',
    ])
    shot(doc, 'Antrean bukti pembayaran dengan pratinjau gambar')

    h1(doc, '11. Transaksi Harian')
    para(doc, 'Buku kas harian: seluruh mutasi masuk/keluar per akun kas & bank dalam satu tampilan.')
    bullets(doc, [
        'Filter per tanggal dan per akun (kas tunai, rekening bank, e-wallet).',
        'Saldo berjalan per akun.',
        'Mencatat transaksi non-invoice (mis. penjualan modul, penerimaan lain).',
    ])
    shot(doc, 'Transaksi harian per akun kas/bank')

    h1(doc, '12. Penagihan & Reminder (Piutang)')
    para(doc, 'Kontrol piutang: daftar invoice belum lunas beserta umur tagihan, plus pengiriman reminder WhatsApp.')
    steps(doc, [
        'Lihat piutang per siswa/invoice, urutkan berdasarkan jatuh tempo atau umur.',
        'Kirim reminder WA ke orang tua satu per satu atau massal — isi pesan mengikuti template di Pengaturan.',
        'Status reminder (terkirim/terakhir dikirim) tercatat di tiap baris piutang.',
        'Tagihan yang sudah lunas otomatis hilang dari daftar.',
    ])
    shot(doc, 'Daftar piutang dengan tombol kirim reminder WhatsApp')

    h1(doc, '13. Kas/Bank')
    para(doc, 'Master akun keuangan: kas tunai dan rekening bank tempat pembayaran diterima.')
    bullets(doc, [
        'Tambah/ubah akun: nama, jenis (kas/bank/e-wallet), nomor rekening, atas nama.',
        'Akun aktif tampil sebagai pilihan saat mencatat pembayaran.',
        'Informasi rekening ini juga yang dilihat orang tua saat membayar.',
    ])
    shot(doc, 'Daftar akun kas dan bank beserta nomor rekening')

    h1(doc, '14. RAB (Rencana Anggaran Biaya)')
    para(doc, 'Perencanaan anggaran per periode — pembanding antara rencana dan realisasi pengeluaran.')
    bullets(doc, [
        'Buat RAB per periode dengan item anggaran dan plafon.',
        'Pantau realisasi vs anggaran per item.',
        'Status RAB: draft, disetujui, berjalan, ditutup.',
    ])
    shot(doc, 'Daftar RAB dan detail item anggaran')

    h1(doc, '15. Pengeluaran')
    para(doc, 'Mencatat seluruh pengeluaran operasional selain gaji tutor.')
    bullets(doc, [
        'Input pengeluaran: tanggal, kategori, nominal, akun sumber, bukti/nota.',
        'Kategori pengeluaran dapat dikelola.',
        'Pengeluaran masuk ke laporan laba-rugi dan realisasi RAB.',
    ])
    shot(doc, 'Daftar pengeluaran dengan kategori dan akun')

    h1(doc, '16. Gaji Bulanan Tutor (Payroll)')
    para(doc, 'Menghitung dan memproses penggajian tutor per bulan berdasarkan data mengajar.')
    steps(doc, [
        'Pilih periode — sistem menarik sesi mengajar tiap tutor (kehadiran mengajar ikut dihitung).',
        'Periksa rincian work item per tutor: jumlah sesi, tarif, penyesuaian.',
        'Generate slip/payroll — nominal bisa disesuaikan bila ada koreksi.',
        'Tandai sebagai dibayar setelah transfer dilakukan.',
    ])
    tip(doc, 'Kehadiran tutor IZIN/SAKIT/ALFA di sesi tidak dihitung sebagai work item — absen HADIR/TERLAMBAT dihitung.')
    shot(doc, 'Tabel payroll per tutor dengan rincian sesi')

    h1(doc, '17. Laporan')
    para(doc, 'Pusat laporan keuangan & operasional — ditampilkan langsung di aplikasi, bisa difilter periode dan dicetak/diekspor.')
    bullets(doc, [
        'Laporan keuangan: pemasukan, pengeluaran, laba-rugi per periode.',
        'Laporan piutang & aging tagihan.',
        'Laporan per siswa/per program.',
        'Semua laporan bisa dicetak untuk arsip.',
    ])
    shot(doc, 'Halaman laporan dengan pilihan jenis dan periode')

    h1(doc, '18. Pustaka Media')
    para(doc, 'Gudang file gambar/media yang dipakai lintas modul (logo, foto hero, lampiran).')
    bullets(doc, [
        'Unggah file gambar — didedupelikasi otomatis berdasarkan isi file.',
        'Salin URL untuk dipakai di pengaturan tampilan atau konten.',
        'Hapus file yang tidak terpakai.',
    ])
    shot(doc, 'Pustaka media dengan pratinjau gambar')

    h1(doc, '19. Antrean WhatsApp')
    para(doc, 'Monitor seluruh pesan WhatsApp yang dijadwalkan/dikirim sistem.')
    bullets(doc, [
        'Status tiap pesan: antre, terkirim, gagal — beserta isi pesan & tujuan.',
        'Pesan gagal bisa di-Retry; alasan kegagalan dari provider ditampilkan.',
        'Pesan yang menggantung di provider (device offline) otomatis ditandai gagal setelah batas waktu.',
    ])
    tip(doc, 'Jika banyak pesan "terkirim" tapi tidak sampai, periksa status device WhatsApp di dashboard provider (Fonnte).')
    shot(doc, 'Antrean WhatsApp dengan status per pesan')

    h1(doc, '20. Pengaturan')
    para(doc, 'Konfigurasi sistem — sebagian bagian hanya tampil sesuai wewenang role.')
    bullets(doc, [
        'Identitas bimbel: nama, logo (rekomendasi 1:1 min. 512px, PNG/WebP transparan), foto hero (21:9 desktop / 16:10 mobile).',
        'Template pesan WhatsApp: reminder tagihan, jadwal mingguan, performa bulanan, feedback, tutor berhalangan.',
        'Akun kas/bank (bagian ini khusus wewenang finance).',
        'Pengaturan pembayaran/gateway dan parameter sistem lainnya.',
    ])
    shot(doc, 'Halaman pengaturan — identitas dan template pesan')

    h1(doc, '21. Manajemen Akun')
    para(doc, 'Kelola akun pengguna sistem.')
    bullets(doc, [
        'Buat akun baru, atur ulang password, aktif/nonaktifkan akun.',
        'Kelola role akun lewat dialog "Kelola Role" — tombol Tambah/Hapus per role.',
        'Role OWNER hanya bisa diberikan/dicabut oleh Owner; akun sendiri tidak bisa dicabut rolenya.',
        'Akun nonaktif tidak bisa login tetapi datanya tetap tersimpan.',
    ])
    shot(doc, 'Daftar akun dan dialog kelola role')

    h1(doc, '22. Notifikasi & Profil')
    bullets(doc, [
        'Notifikasi: pusat pemberitahuan in-app (pembayaran masuk, pendaftaran baru, dll.) — tandai dibaca, klik untuk menuju halaman terkait.',
        'Profil: ubah nama, foto, nomor HP, password sendiri; atur preferensi notifikasi (in-app & WhatsApp).',
    ])
    shot(doc, 'Panel notifikasi dan halaman profil')

    doc.save('docs/Manual-Pengguna-Admin-Finance.docx')
    print('Manual-Pengguna-Admin-Finance.docx dibuat')

# ============================================================ ACADEMIC
def build_academic():
    doc = Document()
    cover(doc, 'ADMIN ACADEMIC', 'Manual Pengguna', 'Sistem Manajemen Bimbel GFS — Modul Akademik & Operasional')
    intro(doc,
        'Manual ini ditujukan untuk staf Admin Academic. Role ini menangani seluruh sisi akademik & '
        'operasional: data siswa/orang tua/tutor, kelompok & penempatan, jadwal & sesi per siswa, '
        'absensi, bank soal, materi, latsol, ujian & proctoring, analisis nilai, ranking, pengumuman, '
        'feedback, serta antrean WhatsApp dan pengaturan sistem.')

    h1(doc, '1. Dashboard')
    para(doc, 'Ringkasan operasional akademik hari ini.')
    bullets(doc, [
        'Sesi yang berjalan hari ini dan yang belum diabsen.',
        'Pendaftar baru yang menunggu diproses.',
        'Aktivitas terbaru: ujian aktif, feedback masuk, pengumuman.',
        'Shortcut ke fungsi yang paling sering dipakai.',
    ])
    shot(doc, 'Dashboard Admin Academic — ringkasan sesi dan pendaftaran')

    h1(doc, '2. Program')
    para(doc, 'Kelola program bimbel dan jenjangnya.')
    bullets(doc, [
        'Tiga kategori program: Kelas Reguler (multi-mapel), Kelas Extra, Kelas Privat.',
        'Tiap program memiliki daftar jenjang (kelas sekolah) yang tersedia.',
        'Program & jenjang menjadi dasar struktur kelompok, konten, dan harga.',
    ])
    shot(doc, 'Daftar program dengan jenjang')

    h1(doc, '3. Kelompok')
    para(doc, 'Kelompok belajar = wadah siswa per program & jenjang. Inti pengelolaan operasional.')
    steps(doc, [
        'Buat kelompok: nama, kode, program, jenjang, kapasitas, tutor lead.',
        'Masukkan siswa ke kelompok lewat dialog "Tambah Siswa" — pencarian bisa diketik, filter berdasarkan jenjang.',
        'Tugaskan tutor ke kelompok — satu kelompok boleh punya beberapa tutor (multi-tutor, kelas reguler multi-mapel).',
        'Jadwal TIDAK dibuat di sini — sesi dibuat per tanggal di menu Jadwal & Sesi.',
        'Kirim reminder WhatsApp ke orang tua seluruh anggota (tagihan, jadwal mingguan, performa).',
    ])
    tip(doc, 'Satu kelompok bisa dipecah ke beberapa sesi paralel — misal 5 siswa sesi pagi, 5 siswa sesi siang. Pembagiannya diatur per sesi di Jadwal & Sesi.')
    shot(doc, 'Daftar kelompok dan halaman detail kelompok')
    shot(doc, 'Dialog tambah siswa ke kelompok dengan pencarian')

    h1(doc, '4. Data Siswa')
    bullets(doc, [
        'Daftar & detail siswa: profil, orang tua, kelompok, tagihan, kehadiran, nilai.',
        'Pencarian & filter berdasarkan nama/kelompok/status.',
        'Kirim reminder WhatsApp ke orang tua siswa.',
        'Menonaktifkan siswa (histori tetap tersimpan).',
    ])
    shot(doc, 'Daftar dan detail siswa')

    h1(doc, '5. Data Orang Tua')
    bullets(doc, [
        'Daftar orang tua beserta anak-anak yang terhubung.',
        'Mengaitkan/memutuskan relasi orang tua ↔ siswa.',
        'Kirim reminder WhatsApp langsung ke orang tua.',
    ])
    shot(doc, 'Daftar orang tua')

    h1(doc, '6. Data Tutor')
    bullets(doc, [
        'Daftar tutor beserta status kepegawaian dan kelompok yang diampu.',
        'Detail tutor: kelompok, jadwal mengajar, kehadiran mengajar.',
        'Menonaktifkan tutor — sesi mendatang perlu ditugaskan ulang.',
    ])
    shot(doc, 'Daftar tutor dan detail penugasan')

    h1(doc, '7. Master Data')
    para(doc, 'Data referensi sistem: mata pelajaran, gedung/ruangan, tahun ajaran, dan referensi lain.')
    bullets(doc, [
        'Mapel: kode & nama — dipakai di jenjang, konten, dan jadwal.',
        'Gedung & ruangan — dipakai penjadwalan dan konflik ruangan.',
        'Data nonaktif tidak bisa dipilih pada data baru tapi histori tetap aman.',
    ])
    shot(doc, 'Halaman master data')

    h1(doc, '8. Level (Jenjang)')
    para(doc, 'Struktur jenjang sekolah (TK → SD 1-6 → SMP 7-9 → SMA 10-12) beserta mapel per jenjang.')
    bullets(doc, [
        'Kelola jenjang dan urutannya.',
        'Lampirkan mapel ke jenjang — menentukan mapel yang tersedia untuk kelompok, soal, materi, dan jadwal.',
        'Struktur ini menjadi pohon filter di semua halaman konten.',
    ])
    shot(doc, 'Daftar jenjang dan pemetaan mapel')

    h1(doc, '9. Harga Program')
    para(doc, 'Melihat/mengatur tarif program & biaya tambahan (dibagikan dengan Admin Finance).')
    bullets(doc, [
        'Harga per program & jenjang, biaya tambahan per paket.',
        'Perubahan berlaku untuk invoice berikutnya.',
    ])
    shot(doc, 'Tabel harga program')

    h1(doc, '10. Pendaftaran')
    para(doc, 'Memproses pendaftar baru dari form publik maupun portal orang tua.')
    steps(doc, [
        'Daftar pendaftar berstatus MENUNGGU tampil di antrean.',
        'Periksa data: nama, program & jenjang, kontak.',
        'Setujui → akun siswa dibuat dan terhubung ke orang tua; lanjutkan penempatan ke kelompok.',
        'Tolak dengan alasan bila data tidak valid.',
    ])
    shot(doc, 'Antrean pendaftaran')

    h1(doc, '11. Jadwal & Sesi')
    para(doc, 'Pusat penjadwalan. Sistem baru: jadwal dibuat PER TANGGAL dan pesertanya PER SISWA — bukan satu jadwal untuk seluruh kelompok.')
    h3(doc, '11.1 Papan Penugasan Tutor (mingguan)')
    steps(doc, [
        'Papan mingguan menampilkan semua sesi 7 hari — klik tanggal untuk membuka editor hari itu.',
        'Di dalam editor: lihat sesi hari itu, ganti pengajar lewat dropdown, atau buat sesi baru.',
        'Buat sesi baru: pilih tutor → pilih kelompok → mapel → ruangan → jam mulai/selesai → centang siswa yang hadir.',
        'Defaultnya semua anggota kelompok tercentang; hilangkan centang untuk siswa yang tidak ikut sesi itu.',
    ])
    shot(doc, 'Papan penugasan tutor mingguan')
    shot(doc, 'Form buat sesi dengan daftar centang siswa')
    h3(doc, '11.2 Kalender sesi & Detail sesi')
    bullets(doc, [
        'Kalender bulanan di bawah papan — klik tanggal/sesi untuk membuka panel detail.',
        'Panel detail: pengajar sesi, PESERTA SESI (centang siswa yang dijadwalkan), absensi, override per-siswa, hapus sesi.',
        'Peserta sesi menentukan siapa yang muncul di absensi dan di jadwal siswa/orang tua.',
    ])
    h3(doc, '11.3 Memindahkan siswa antar sesi')
    steps(doc, [
        'Buka detail sesi asal → bagian "Peserta sesi".',
        'Pada baris siswa, pilih "Pindah ke sesi…" → pilih sesi tujuan (kelompok yang sama) → klik Pindah.',
        'Absensi yang sudah tercatat ikut berpindah — histori mengikuti siswa.',
        'Berguna saat siswa berhalangan di sesi awal dan ingin ikut sesi lain.',
    ])
    h3(doc, '11.4 Catatan tanggal & override')
    bullets(doc, [
        'Catatan tanggal (LIBUR/RAPAT/DARURAT/INFO) tampil di kalender dan ikut di reminder jadwal mingguan.',
        'Override per-siswa: ubah jam/ruang untuk 1 siswa saja tanpa mengubah sesi (mis. siswa susulan).',
        'Konflik otomatis dicek: tutor, ruangan, dan siswa tidak boleh terjadwal dobel di jam sama — dua sesi kelompok yang sama diperbolehkan selama pesertanya berbeda.',
        'Reminder mingguan: tombol "Kirim Reminder Jadwal" mengantrekan WA ke semua tutor dan bisa juga ke orang tua per kelompok.',
    ])
    shot(doc, 'Panel detail sesi — peserta, absensi, dan pindah sesi')

    h1(doc, '12. Fasilitas')
    para(doc, 'Kelola gedung dan ruangan tempat sesi berlangsung.')
    bullets(doc, [
        'Tambah/ubah gedung & ruangan, kapasitas, status aktif.',
        'Ruangan nonaktif tidak bisa dipilih pada jadwal baru.',
    ])
    shot(doc, 'Daftar gedung dan ruangan')

    h1(doc, '13. Absensi')
    para(doc, 'Koreksi dan pantau absensi siswa & kehadiran tutor per sesi.')
    bullets(doc, [
        'Pilih sesi → daftar siswa yang muncul = peserta sesi itu (bukan seluruh anggota kelompok).',
        'Status: HADIR, TERLAMBAT, IZIN, SAKIT, ALFA + catatan.',
        'Tutor mengisi absen sekali per sesi; koreksi setelahnya wewenang Admin Academic.',
        'Mengisi absen siswa otomatis menandai tutor hadir mengajar (dipakai payroll).',
        'Siswa ALFA memicu notifikasi ke orang tua & siswa.',
    ])
    shot(doc, 'Form absensi satu sesi')

    h1(doc, '14. Materi')
    para(doc, 'Bank materi pembelajaran terstruktur: jenjang → tingkat/kelas → mapel → kategori.')
    bullets(doc, [
        'Buat materi berisi teks/format + lampiran file.',
        'Filter & drill-down per jenjang, tingkat, mapel, kategori.',
        'Materi tampil di portal siswa sesuai cakupan jenjangnya.',
    ])
    shot(doc, 'Daftar materi dengan filter jenjang/mapel')

    h1(doc, '15. Pustaka Media')
    para(doc, 'Gudang gambar yang dipakai konten & pengaturan (unggah, dedup otomatis, salin URL).')
    shot(doc, 'Pustaka media')

    h1(doc, '16. Bank Soal')
    para(doc, 'Kelola soal per jenjang/mapel: pilihan ganda, benar-salah, pilihan ganda kompleks, benar-salah kompleks, dan isian.')
    bullets(doc, [
        'Buat/edit/hapus soal dengan pembahasan.',
        'Import massal dari file (docx) atau isi satu per satu.',
        'Filter per jenjang, tingkat, mapel — mapel tanpa soal tetap tampil di filter.',
        'Soal dipakai oleh paket Latsol dan Ujian.',
    ])
    shot(doc, 'Bank soal dengan filter dan editor soal')

    h1(doc, '17. Latsol (Latihan Soal)')
    para(doc, 'Paket latihan soal mandiri untuk siswa.')
    bullets(doc, [
        'Buat paket: pilih soal, atur cakupan jenjang/mapel.',
        'Siswa mengerjakan kapan saja; hasil langsung keluar dengan pembahasan.',
        'Riwayat & statistik attempt terekam untuk analisis.',
    ])
    shot(doc, 'Daftar paket latsol dan rekap attempt')

    h1(doc, '18. Ujian')
    para(doc, 'Ujian terjadwal dengan pengaturan lengkap.')
    bullets(doc, [
        'Buat ujian: judul, jadwal mulai/selesai, durasi, mapel/jenjang, dan peserta (kelompok atau kode akses untuk peserta luar/TO).',
        'Multi-subtes: ujian bisa dibagi beberapa subtes, tiap subtes durasi sendiri dan dikerjakan berurutan.',
        'Centang "Acak urutan soal" — urutan acak tersimpan per attempt (konsisten saat refresh/resume, dan acak hanya di dalam tiap subtes).',
        'Proteksi ujian: batasi tab & screenshot, deteksi pelanggaran (pindah tab, keluar fullscreen).',
        'Kunci jawaban & pengaturan rilis hasil.',
        'Unlock attempt yang terkunci karena pelanggaran — sisa waktu subtes yang sedang berjalan otomatis dipertahankan.',
    ])
    shot(doc, 'Form buat ujian dengan opsi acak soal dan proteksi')
    shot(doc, 'Daftar ujian dengan status')

    h1(doc, '19. Proctoring')
    para(doc, 'Monitor pelanggaran selama ujian berlangsung.')
    bullets(doc, [
        'Daftar attempt beserta jumlah/jenis pelanggaran dan status (berjalan/terkunci/selesai).',
        'Unlock attempt terkunci setelah verifikasi — siswa melanjutkan dari posisi terakhir dengan sisa waktu utuh.',
        'Layar mati otomatis dicegah lewat Wake Lock di perangkat siswa (browser yang mendukung).',
    ])
    shot(doc, 'Papan proctoring dengan status attempt')

    h1(doc, '20. Pembahasan')
    para(doc, 'Kelola pembahasan soal ujian — rilis per ujian ketika waktunya dibuka untuk siswa.')
    shot(doc, 'Daftar pembahasan per ujian')

    h1(doc, '21. Analisis')
    para(doc, 'Analisis hasil ujian & latsol: rekap nilai, rekap jawaban per soal, dan statistik.')
    bullets(doc, [
        'Rekap Nilai: tabel siswa × skor — cari nama/sekolah/kelompok, filter kategori nilai (tinggi/sedang/rendah/belum mengumpulkan), urutkan, statistik rata-rata/tertinggi/terendah.',
        'Rekap Jawaban: akurasi per soal dengan kolom nama yang tetap terlihat saat geser.',
        'Paginasi 10/20/50/100/semua — aman untuk ratusan peserta.',
        'Cetak analisis ujian untuk dokumentasi.',
    ])
    shot(doc, 'Analisis — rekap nilai dengan toolbar filter dan paginasi')

    h1(doc, '22. Ranking')
    para(doc, 'Papan podium poin siswa: per kelompok, per gedung, dan seluruh GFS + konfigurasi Score Rules.')
    bullets(doc, [
        'Filter periode (bulan) atau semua waktu; filter kelompok & gedung bisa dikosongkan.',
        'Score Rules menentukan poin per ujian/latsol/tipe soal — data-driven, perubahan tidak retroaktif.',
        'Poin diberikan otomatis saat attempt diselesaikan.',
    ])
    shot(doc, 'Papan ranking tiga kolom dan daftar score rules')

    h1(doc, '23. Laporan')
    para(doc, 'Laporan akademik & performa — langsung tampil di aplikasi, bisa dicetak.')
    bullets(doc, [
        'Rekap kehadiran siswa (per siswa/kelompok/periode) termasuk sesi yang seharusnya dihadiri.',
        'Laporan performa belajar per siswa.',
        'Laporan aktivitas kelompok & utilisasi.',
        'Ekspor feedback & laporan cetak lainnya.',
    ])
    shot(doc, 'Halaman laporan akademik')

    h1(doc, '24. Antrean WhatsApp')
    bullets(doc, [
        'Monitor semua pesan WA sistem: status antre/terkirim/gagal, isi, tujuan.',
        'Retry pesan gagal; alasan kegagalan provider ditampilkan.',
        'Pesan menggantung (device provider offline) otomatis ditandai gagal.',
    ])
    shot(doc, 'Antrean WhatsApp')

    h1(doc, '25. Pengaturan')
    bullets(doc, [
        'Identitas bimbel & tampilan landing (logo, foto hero).',
        'Template pesan WhatsApp (reminder jadwal, performa, feedback, tutor berhalangan).',
        'Parameter akademik & sistem lainnya — bagian kas/bank hanya untuk Admin Finance.',
    ])
    shot(doc, 'Halaman pengaturan')

    h1(doc, '26. Manajemen Akun, Notifikasi & Profil')
    bullets(doc, [
        'Manajemen Akun: buat akun, reset password, aktif/nonaktif, kelola role (OWNER dibatasi).',
        'Notifikasi: pusat pemberitahuan in-app — pendaftar baru, absensi, pembayaran, dll.',
        'Profil: data diri, foto, password, preferensi notifikasi.',
    ])
    shot(doc, 'Manajemen akun dan panel notifikasi')

    h1(doc, 'Lampiran — Alur Kerja Harian yang Disarankan')
    steps(doc, [
        'Pagi: cek Dashboard → pendaftar baru → setujui & tempatkan.',
        'Cek sesi hari ini di Jadwal & Sesi; pastikan tiap sesi punya tutor dan peserta yang benar.',
        'Buat sesi susulan/perubahan; pindahkan siswa berhalangan ke sesi lain bila perlu.',
        'Siang/sore: pantau absensi masuk; koreksi bila tutor salah isi.',
        'Mingguan: kirim Reminder Jadwal ke tutor & orang tua; siapkan konten/ujian minggu berikutnya.',
        'Berkala: pantau Analisis nilai & Ranking; terbitkan pengumuman bila perlu.',
    ])

    doc.save('docs/Manual-Pengguna-Admin-Academic.docx')
    print('Manual-Pengguna-Admin-Academic.docx dibuat')

if __name__ == '__main__':
    build_finance()
    build_academic()
