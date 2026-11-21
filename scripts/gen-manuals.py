#!/usr/bin/env python3
"""Generate Word manuals untuk Admin Finance & Admin Academic.

Fitur:
- Halaman DAFTAR ISI di awal — tiap entri adalah hyperlink internal:
  Ctrl+Klik (Word) lompat langsung ke judul bab terkait.
- Semua menu sidebar role tercakup (sesuai apps/web/src/config/role-nav.ts).
- Placeholder [ Screenshot: ... ] untuk tempel tangkapan layar.

Regenerate: python scripts/gen-manuals.py
"""
from docx import Document
from docx.shared import Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

BRAND = RGBColor(0x0B, 0x5C, 0xAB)
LINK = "0563C1"
GRAY = RGBColor(0x55, 0x55, 0x55)


# ---------------------------------------------------------------- helpers
def shot(doc, caption):
    p = doc.add_paragraph()
    r = p.add_run(f'[ Screenshot: {caption} ]')
    r.italic = True
    r.font.color.rgb = GRAY
    r.font.size = Pt(9)
    p.paragraph_format.space_before = Pt(4)
    p.paragraph_format.space_after = Pt(8)
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER


def h1(doc, t, bookmark=None):
    h = doc.add_heading(t, 1)
    if bookmark:
        _add_bookmark(h, bookmark)
    return h


def h3(doc, t):
    doc.add_heading(t, 3)


def para(doc, t, bold=False):
    p = doc.add_paragraph()
    r = p.add_run(t)
    r.bold = bold
    return p


def bullets(doc, items):
    for i in items:
        doc.add_paragraph(i, style='List Bullet')


def steps(doc, items):
    for i in items:
        doc.add_paragraph(i, style='List Number')


def tip(doc, t):
    p = doc.add_paragraph()
    r = p.add_run('Tips: ')
    r.bold = True
    p.add_run(t)


def table(doc, headers, rows):
    t = doc.add_table(rows=1, cols=len(headers))
    t.style = 'Light Grid Accent 1'
    for i, htxt in enumerate(headers):
        t.rows[0].cells[i].paragraphs[0].add_run(htxt).bold = True
    for row in rows:
        cells = t.add_row().cells
        for i, v in enumerate(row):
            cells[i].text = v


# ------------------------------------------------- bookmark + hyperlink TOC
_bm_id = [1000]


def _add_bookmark(paragraph, name):
    """Sisipkan bookmark bernama `name` pada sebuah paragraph (untuk anchor)."""
    _bm_id[0] += 1
    bid = str(_bm_id[0])
    start = OxmlElement('w:bookmarkStart')
    start.set(qn('w:id'), bid)
    start.set(qn('w:name'), name)
    end = OxmlElement('w:bookmarkEnd')
    end.set(qn('w:id'), bid)
    paragraph._p.insert(0, start)
    paragraph._p.append(end)


def _add_internal_link(paragraph, text, anchor):
    """Tambahkan hyperlink internal (w:hyperlink w:anchor) ke paragraph."""
    link = OxmlElement('w:hyperlink')
    link.set(qn('w:anchor'), anchor)
    run = OxmlElement('w:r')
    rpr = OxmlElement('w:rPr')
    color = OxmlElement('w:color')
    color.set(qn('w:val'), LINK)
    rpr.append(color)
    u = OxmlElement('w:u')
    u.set(qn('w:val'), 'single')
    rpr.append(u)
    run.append(rpr)
    t = OxmlElement('w:t')
    t.set(qn('xml:space'), 'preserve')
    t.text = text
    run.append(t)
    link.append(run)
    paragraph._p.append(link)


def toc_page(doc, entries):
    """Halaman Daftar Isi — tiap entri Ctrl+Klik → lompat ke judul bab."""
    doc.add_heading('Daftar Isi', 1)
    p = doc.add_paragraph()
    r = p.add_run(
        'Tahan Ctrl lalu klik judul untuk langsung menuju bab tersebut.'
    )
    r.italic = True
    r.font.size = Pt(9)
    r.font.color.rgb = GRAY
    for text, anchor in entries:
        p = doc.add_paragraph()
        p.paragraph_format.space_after = Pt(2)
        _add_internal_link(p, text, anchor)
    doc.add_page_break()


def cover(doc, role, title, subtitle):
    for _ in range(6):
        doc.add_paragraph()
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run('BIMBEL GFS')
    r.font.size = Pt(16)
    r.font.color.rgb = BRAND
    r.bold = True
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run(title)
    r.font.size = Pt(28)
    r.bold = True
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.add_run(subtitle).font.size = Pt(13)
    doc.add_paragraph()
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run(f'Panduan untuk role: {role}')
    r.font.size = Pt(12)
    r.bold = True
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run('Versi November 2026')
    r.font.size = Pt(10)
    r.font.color.rgb = GRAY
    doc.add_page_break()


def render_section(doc, sec, anchor):
    h1(doc, sec['title'], bookmark=anchor)
    for t in sec.get('paras', []):
        para(doc, t)
    if 'steps' in sec:
        steps(doc, sec['steps'])
    if 'bullets' in sec:
        bullets(doc, sec['bullets'])
    for t in sec.get('tips', []):
        tip(doc, t)
    if 'table' in sec:
        table(doc, sec['table'][0], sec['table'][1])
    for sub in sec.get('subs', []):
        h3(doc, sub['title'])
        for t in sub.get('paras', []):
            para(doc, t)
        if 'steps' in sub:
            steps(doc, sub['steps'])
        if 'bullets' in sub:
            bullets(doc, sub['bullets'])
        for t in sub.get('tips', []):
            tip(doc, t)
    for cap in sec.get('shots', []):
        shot(doc, cap)


def build_doc(role, subtitle, audience_paras, sections, out_path):
    doc = Document()
    cover(doc, role, 'Manual Pengguna', subtitle)
    entries = [('Pendahuluan', 'sec_0')] + [
        (s['title'], f'sec_{i}') for i, s in enumerate(sections, 1)
    ]
    toc_page(doc, entries)

    h1(doc, 'Pendahuluan', bookmark='sec_0')
    for t in audience_paras:
        para(doc, t)
    bullets(doc, [
        'Login menggunakan email/nomor HP + password yang diberikan admin.',
        'Menu sidebar di sebelah kiri dikelompokkan per kategori; klik nama menu untuk membuka halaman.',
        'Ikon lonceng di kanan atas menampilkan notifikasi; klik avatar untuk logout.',
        'Tampilan menyesuaikan desktop dan mobile — di HP sidebar bisa dibuka lewat ikon garis tiga.',
        'Semua dropdown pemilihan (tutor, kelompok, mapel, ruangan, siswa, sesi, program, jenjang, akun) bersifat searchable — ketik untuk mencari. Daftar dropdown juga tidak terpotong di tepi layar (scroll sampai opsi terakhir).',
        'Setiap perubahan penting tercatat di audit log sistem.',
    ])
    para(doc,
         'Setiap bab berikut menjelaskan satu menu beserta fungsinya dan langkah penggunaan umum. '
         'Tempat kosong bertanda [ Screenshot: ... ] disediakan untuk menempel tangkapan layar halaman terkait.')
    doc.add_page_break()

    for i, sec in enumerate(sections, 1):
        render_section(doc, sec, f'sec_{i}')

    doc.save(out_path)
    print(f'{out_path} dibuat')


SHARED_SYS_SECTIONS = [
    {
        'title': 'Pengaturan',
        'paras': [
            'Konfigurasi sistem — sebagian bagian hanya tampil sesuai wewenang role. '
            'Tiap sub-bagian punya tombol Simpan sendiri.',
        ],
        'subs': [
            {
                'title': 'Identitas & Branding',
                'bullets': [
                    'Nama aplikasi, tagline, logo (rekomendasi 1:1, min. 512×512 px, PNG/WebP transparan).',
                    'Identitas lembaga: alamat, telepon, email — dipakai di kwitansi & laporan cetak.',
                ],
            },
            {
                'title': 'Tampilan Landing',
                'bullets': [
                    'Teks hero/tentang/CTA, foto hero (rekomendasi 21:9 desktop, 16:10 mobile — object-cover).',
                    'Testimoni di halaman awal.',
                    'Lokasi di Footer: nama lokasi, alamat, dan Link Google Maps (opsional) — tempel URL share maps; '
                    'klik lokasi di footer membuka Google Maps di tab baru. Kosongkan daftar untuk memakai data gedung.',
                    'Link formulir info & pendaftaran publik.',
                ],
            },
            {
                'title': 'Template Pesan WhatsApp',
                'bullets': [
                    'Template reminder: tagihan, jadwal mingguan, performa bulanan, feedback, tutor berhalangan.',
                    'Variabel {nama}, {tagihan}, dll. diganti otomatis — ikuti panduan di tiap kolom.',
                ],
            },
            {
                'title': 'Pembayaran & Lainnya',
                'bullets': [
                    'Akun kas/bank dan kredensial payment gateway (wewenang Finance).',
                    'Parameter sistem lainnya sesuai wewenang role.',
                ],
            },
        ],
        'shots': ['Halaman pengaturan — bagian identitas', 'Bagian Lokasi di Footer dengan kolom link Google Maps'],
    },
    {
        'title': 'Manajemen Akun',
        'bullets': [
            'Buat akun baru, atur ulang password, aktif/nonaktifkan akun.',
            'Kelola role akun lewat dialog "Kelola Role" — tombol Tambah/Hapus per role.',
            'Role OWNER hanya bisa diberikan/dicabut oleh Owner; akun sendiri tidak bisa dicabut rolenya.',
            'Akun nonaktif tidak bisa login tetapi datanya tetap tersimpan.',
        ],
        'shots': ['Daftar akun dan dialog kelola role'],
    },
    {
        'title': 'Notifikasi & Profil',
        'bullets': [
            'Notifikasi: pusat pemberitahuan in-app — klik untuk menuju halaman terkait, tandai sudah dibaca.',
            'Profil: ubah nama, foto, nomor HP, password sendiri.',
            'Preferensi notifikasi: pilih kanal in-app dan/atau WhatsApp per jenis pemberitahuan.',
        ],
        'shots': ['Panel notifikasi dan halaman profil'],
    },
]


# ============================================================ FINANCE
FINANCE_SECTIONS = [
    {
        'title': '1. Dashboard',
        'paras': [
            'Halaman awal setelah login — ringkasan kondisi keuangan & operasional hari ini.',
        ],
        'bullets': [
            'Aksi Cepat di bawah judul: Verifikasi Bukti, Buat Invoice, Transaksi Harian, Pendaftaran, Penagihan.',
            'Kartu KPI: piutang berjalan, pembayaran masuk periode ini, invoice jatuh tempo.',
            'Pembayaran yang menunggu verifikasi — klik untuk langsung memproses.',
            'Strip kesehatan sistem: jumlah pesan WhatsApp antre/gagal — klik untuk membuka Antrean WA.',
            'Grafik tren pemasukan/pengeluaran per periode.',
        ],
        'shots': ['Dashboard Admin Finance — aksi cepat, KPI, dan pembayaran pending'],
    },
    {
        'title': '2. Siswa',
        'paras': ['Kelola data siswa: daftar, detail profil, kelompok, tagihan, dan riwayat.'],
        'bullets': [
            'Pencarian & filter siswa berdasarkan nama/kelompok/status.',
            'Detail siswa: data diri, orang tua, kelompok yang diikuti, invoice, kehadiran, nilai.',
            'Kirim reminder WhatsApp ke orang tua siswa (tagihan, jadwal mingguan, performa bulanan).',
            'Nonaktifkan siswa yang sudah tidak aktif (data historis tetap tersimpan).',
        ],
        'shots': ['Daftar siswa dengan pencarian dan filter', 'Detail siswa — profil, kelompok, tagihan'],
    },
    {
        'title': '3. Orang Tua',
        'paras': ['Kelola akun orang tua/wali yang terhubung ke satu atau lebih anak.'],
        'bullets': [
            'Daftar orang tua beserta anak-anak yang terhubung.',
            'Mengaitkan/memutuskan relasi orang tua ↔ siswa.',
            'Melihat akun yang dipakai anak (telepon/email) — berguna saat ortu lupa login anak.',
            'Kirim reminder WhatsApp langsung ke orang tua.',
            'Statement (ringkasan tagihan) per orang tua — bisa dicetak/diunduh.',
        ],
        'shots': ['Daftar orang tua beserta anak yang terhubung'],
    },
    {
        'title': '4. Pendaftaran',
        'paras': [
            'Memproses pendaftar baru — dari form publik maupun pendaftaran yang dibuat orang tua '
            'di portal. Alur: pendaftar → verifikasi → akun siswa dibuat → penempatan → invoice.',
        ],
        'steps': [
            'Buka menu Pendaftaran — antrean pendaftar status MENUNGGU tampil di atas.',
            'Klik pendaftar untuk detail: nama, program & jenjang pilihan, kontak, status akun anak (menunggu/terverifikasi).',
            'Setujui — sistem membuat akun siswa dan menghubungkannya ke orang tua.',
            'Lanjutkan penempatan ke kelompok dan terbitkan invoice pertama.',
            'Atau tolak dengan catatan alasan.',
        ],
        'bullets': [
            'Label harga di formulir tambah anak menunjukkan paket & cara bayar tahun ajaran.',
            'Link info pendaftaran publik: https://s.id/info-daftarGFS2627.',
        ],
        'shots': ['Antrean pendaftaran — MENUNGGU / DISETUJUI / DITOLAK'],
    },
    {
        'title': '5. Program',
        'paras': [
            'Daftar program bimbel: Kelas Reguler (multi-mapel), Kelas Extra, dan Kelas Privat. '
            'Klik program untuk membuka halaman detail berisi kartu-kartu jenjang.',
        ],
        'bullets': [
            'Di detail program, tiap kartu jenjang menampilkan mapel, harga, dan daftar paket belajar.',
            'Paket Populer: klik tombol bintang di samping nama paket untuk menandai paket tampil di slider '
            '"Paket Terpopuler" halaman awal (landing). Klik lagi untuk melepas tanda.',
            'Bila tidak ada paket yang ditandai, slider menampilkan paket dengan siswa terbanyak seperti biasa.',
            'Edit Program mengubah nama, kategori, biaya pendaftaran, deskripsi, dan status aktif.',
        ],
        'shots': ['Daftar program', 'Kartu jenjang dengan daftar paket dan tombol bintang populer'],
    },
    {
        'title': '6. Kelompok',
        'paras': ['Kelompok belajar per program & jenjang — dasar penagihan dan penempatan siswa.'],
        'bullets': [
            'Daftar kelompok: kode, program, jenjang, kapasitas, jumlah anggota.',
            'Detail kelompok: anggota siswa, tutor pengampu, dan sesi yang berjalan.',
            'Buat kelompok baru: nama, program, jenjang, tutor lead, mapel — penjadwalan dilakukan '
            'terpisah per tanggal di menu Jadwal & Sesi (bukan template mingguan di sini).',
        ],
        'shots': ['Daftar kelompok dan detail anggota'],
    },
    {
        'title': '7. Harga Program',
        'paras': ['Mengatur tarif per program/jenjang — dasar nominal invoice otomatis.'],
        'bullets': [
            'Pilih program → jenjang → isi pricelist sesuai satuan harga (per tahun ajaran / per bulan / per pertemuan / per paket).',
            'Reguler: harga lunas awal, angsuran 2x, angsuran bulanan. Privat: harga per jumlah siswa + durasi. Extra: harga promo untuk siswa reguler.',
            'Biaya pendaftaran bisa di-override per jenjang — kosong = ikut program.',
            'Perubahan berlaku untuk invoice yang diterbitkan setelahnya — invoice lama tidak berubah.',
        ],
        'tips': ['Pastikan harga benar sebelum akhir bulan — generate invoice massal memakai harga saat itu.'],
        'shots': ['Form harga per jenjang sesuai satuan'],
    },
    {
        'title': '8. Invoice',
        'paras': ['Menerbitkan dan mengelola tagihan siswa.'],
        'steps': [
            'Buat invoice individual dari detail siswa, atau generate massal per periode.',
            'Tiap invoice punya nomor unik, jatuh tempo, rincian item, dan status (DRAFT / ISSUED / LUNAS / BATAL).',
            'Invoice ISSUED otomatis tampil di portal orang tua.',
            'Pembayaran terverifikasi menurunkan sisa tagihan otomatis; LUNAS menampilkan riwayat pembayaran.',
            'Invoice keliru bisa dibatalkan selama belum ada pembayaran.',
        ],
        'shots': ['Daftar invoice dengan status dan sisa tagihan', 'Detail invoice — item dan riwayat pembayaran'],
    },
    {
        'title': '9. Pembayaran',
        'paras': ['Mencatat pembayaran dan memverifikasi pembayaran yang dikirim orang tua.'],
        'bullets': [
            'Pembayaran manual (tunai/transfer cek manual): nominal, metode, tanggal, invoice tujuan.',
            'Verifikasi pembayaran online: cocokkan bukti → setujui atau tolak.',
            'Riwayat pembayaran per invoice & per siswa dapat ditelusuri.',
            'Struk/kwitansi pembayaran dapat dicetak atau diunduh sebagai bukti untuk orang tua — '
            'kwitansi juga punya link publik yang dikirim via WhatsApp.',
        ],
        'shots': ['Form input pembayaran dan daftar yang menunggu verifikasi'],
    },
    {
        'title': '10. Bukti',
        'paras': ['Antrean bukti transfer yang diunggah orang tua dari portal.'],
        'steps': [
            'Buka bukti baru — tampil foto/scan transfer beserta invoice terkait.',
            'Cocokkan nominal & pengirim dengan mutasi/invoice.',
            'Setujui → saldo invoice berkurang dan status diperbarui otomatis.',
            'Tolak dengan alasan → orang tua dinotifikasi untuk mengunggah ulang.',
        ],
        'shots': ['Antrean bukti pembayaran dengan pratinjau gambar'],
    },
    {
        'title': '11. Transaksi Harian',
        'paras': ['Buku kas harian: seluruh mutasi masuk/keluar per akun kas & bank.'],
        'bullets': [
            'Filter per tanggal dan per akun (kas tunai, rekening bank, e-wallet).',
            'Saldo berjalan per akun.',
            'Catat transaksi non-invoice (penjualan modul, penerimaan lain).',
        ],
        'shots': ['Transaksi harian per akun kas/bank'],
    },
    {
        'title': '12. Penagihan & Reminder',
        'paras': ['Kontrol piutang: invoice belum lunas + umur tagihan + pengiriman reminder WhatsApp.'],
        'steps': [
            'Lihat piutang per siswa/invoice, urutkan jatuh tempo atau umur.',
            'Kirim reminder WA satu per satu atau massal — isi pesan mengikuti template di Pengaturan.',
            'Status reminder (terkirim/terakhir dikirim) tercatat di tiap baris.',
            'Tagihan lunas otomatis hilang dari daftar.',
        ],
        'shots': ['Daftar piutang dengan tombol kirim reminder WhatsApp'],
    },
    {
        'title': '13. Kas/Bank',
        'paras': ['Master akun keuangan tempat pembayaran diterima.'],
        'bullets': [
            'Tambah/ubah akun: nama, jenis (kas/bank/e-wallet), nomor rekening, atas nama.',
            'Akun aktif tampil sebagai pilihan saat mencatat pembayaran.',
            'Rekening ini juga yang dilihat orang tua saat membayar.',
        ],
        'shots': ['Daftar akun kas dan bank'],
    },
    {
        'title': '14. RAB',
        'paras': ['Rencana Anggaran Biaya per periode — pembanding rencana vs realisasi pengeluaran.'],
        'bullets': [
            'Buat RAB per periode dengan item anggaran dan plafon.',
            'Pantau realisasi vs anggaran per item.',
            'Status RAB: draft, disetujui, berjalan, ditutup.',
        ],
        'shots': ['Daftar RAB dan detail item anggaran'],
    },
    {
        'title': '15. Pengeluaran',
        'paras': ['Seluruh pengeluaran operasional selain gaji tutor.'],
        'bullets': [
            'Input: tanggal, kategori, nominal, akun sumber, bukti/nota.',
            'Kategori pengeluaran dapat dikelola.',
            'Masuk ke laporan laba-rugi dan realisasi RAB.',
        ],
        'shots': ['Daftar pengeluaran dengan kategori dan akun'],
    },
    {
        'title': '16. Gaji Bulanan Tutor',
        'paras': ['Payroll tutor per bulan berdasarkan data mengajar.'],
        'steps': [
            'Pilih periode — sistem menarik sesi mengajar tiap tutor.',
            'Periksa rincian work item: jumlah sesi, tarif, penyesuaian.',
            'Generate slip/payroll — nominal bisa disesuaikan bila ada koreksi.',
            'Tandai dibayar setelah transfer dilakukan.',
        ],
        'tips': ['Kehadiran tutor IZIN/SAKIT/ALFA tidak dihitung work item — HADIR/TERLAMBAT dihitung.'],
        'shots': ['Tabel payroll per tutor dengan rincian sesi'],
    },
    {
        'title': '17. Laporan',
        'paras': ['Pusat laporan keuangan & operasional — tampil langsung di aplikasi, bisa dicetak/diekspor.'],
        'bullets': [
            'Laporan keuangan: pemasukan, pengeluaran, laba-rugi per periode.',
            'Laporan piutang & aging tagihan.',
            'Laporan per siswa/per program.',
            'Semua laporan bisa dicetak untuk arsip.',
        ],
        'shots': ['Halaman laporan dengan pilihan jenis dan periode'],
    },
    {
        'title': '18. Pustaka Media',
        'paras': ['Gudang file gambar/media yang dipakai lintas modul (logo, foto hero, lampiran).'],
        'bullets': [
            'Unggah file gambar — deduplikasi otomatis berdasarkan isi file (SHA-256).',
            'Salin URL untuk dipakai di pengaturan tampilan atau konten.',
            'Hapus file yang tidak terpakai.',
        ],
        'shots': ['Pustaka media dengan pratinjau gambar'],
    },
    {
        'title': '19. Antrean WA',
        'paras': ['Monitor seluruh pesan WhatsApp yang dijadwalkan/dikirim sistem.'],
        'bullets': [
            'Status tiap pesan: antre, terkirim, gagal — beserta isi pesan & tujuan.',
            'Pesan gagal bisa di-Retry; alasan kegagalan provider ditampilkan.',
            'Pesan menggantung di provider (device offline) otomatis ditandai gagal setelah batas waktu.',
        ],
        'tips': ['Bila banyak "terkirim" tapi tidak sampai, periksa status device WhatsApp di dashboard provider (Fonnte).'],
        'shots': ['Antrean WhatsApp dengan status per pesan'],
    },
    *SHARED_SYS_SECTIONS,
    {
        'title': 'Lampiran — Alur Kerja Harian yang Disarankan',
        'steps': [
            'Pagi: cek Dashboard → pembayaran menunggu verifikasi → proses bukti baru.',
            'Kirim reminder tagihan ke piutang mendekati jatuh tempo.',
            'Catat transaksi harian & pengeluaran segera setelah terjadi.',
            'Akhir bulan: generate invoice massal → pantau piutang → payroll tutor.',
            'Berkala: backup database (Pengaturan/Backup bila tersedia) dan cek Antrean WA.',
        ],
    },
]


# ============================================================ ACADEMIC
ACADEMIC_SECTIONS = [
    {
        'title': '1. Dashboard',
        'paras': ['Ringkasan operasional akademik hari ini — dirancang sebagai pusat kendali harian.'],
        'bullets': [
            'Aksi Cepat: Jadwal & Sesi, Kelompok Baru, Buat Ujian, Buat Materi, Pendaftaran, Absensi.',
            'Kartu KPI: jumlah siswa/tutor/kelompok aktif.',
            'Strip notifikasi penting: siswa sedang ujian, attempt terkunci (butuh unlock), pesan WA antre/gagal.',
            'Sesi Hari Ini (dengan jumlah siswa roster per sesi) + Sesi 7 Hari ke Depan.',
            'Ujian Bulan Ini: tiap ujian menampilkan badge LIVE, jumlah submission/attempt, status.',
            'Nilai per Kelompok — Bulan Ini dan Top Siswa — Bulan Ini.',
            'Absensi belum diisi, pemakaian paket, funnel pendaftaran, tren kehadiran.',
        ],
        'shots': ['Dashboard Admin Academic — aksi cepat, sesi, ujian, dan nilai kelompok'],
    },
    {
        'title': '2. Program',
        'paras': [
            'Kelola program bimbel dan jenjangnya: Kelas Reguler (multi-mapel), Kelas Extra, Kelas Privat. '
            'Klik program untuk halaman detail berisi kartu-kartu jenjang.',
        ],
        'bullets': [
            'Tambah Level di detail program: nama (otomatis dari Level Kelas bila dipilih), mapel, satuan harga, pricelist, dan mapel multi (khusus reguler).',
            'Paket Populer: klik tombol bintang di samping nama paket (di dalam kartu jenjang) untuk '
            'menandai paket tampil di slider "Paket Terpopuler" landing. Klik lagi untuk melepas.',
            'Edit Program: nama, kategori, biaya pendaftaran, deskripsi, status aktif; Hapus program bila tidak terpakai.',
        ],
        'shots': ['Daftar program dan kartu jenjang', 'Tombol bintang populer di daftar paket'],
    },
    {
        'title': '3. Kelompok',
        'paras': ['Kelompok belajar = wadah siswa per program & jenjang — inti operasional harian.'],
        'steps': [
            'Buat kelompok: nama, kode, program, jenjang, kapasitas, tutor lead, dan mapel (reguler boleh multi).',
            'Masukkan siswa lewat dialog "Tambah Siswa" — ada kolom pencarian, filter jenjang.',
            'Tugaskan tutor — satu kelompok boleh beberapa tutor (multi-tutor untuk reguler multi-mapel).',
            'Penjadwalan TIDAK dibuat di sini — dilakukan per tanggal dengan pilih siswa di menu Jadwal & Sesi.',
            'Reminder WhatsApp ke orang tua seluruh anggota (tagihan, jadwal mingguan, performa).',
        ],
        'tips': ['Satu kelompok boleh dipecah ke beberapa sesi paralel (mis. 5 anak pagi, 5 anak siang) — pembagiannya diatur per sesi di Jadwal & Sesi.'],
        'shots': ['Daftar kelompok dan detail kelompok', 'Dialog tambah siswa dengan pencarian'],
    },
    {
        'title': '4. Siswa',
        'bullets': [
            'Daftar & detail siswa: profil, orang tua, kelompok, tagihan, kehadiran, nilai.',
            'Pencarian & filter nama/kelompok/status.',
            'Kirim reminder WhatsApp ke orang tua siswa.',
            'Nonaktifkan siswa (histori tetap tersimpan).',
        ],
        'shots': ['Daftar dan detail siswa'],
    },
    {
        'title': '5. Orang Tua',
        'bullets': [
            'Daftar orang tua beserta anak-anak yang terhubung.',
            'Mengaitkan/memutuskan relasi orang tua ↔ siswa.',
            'Kirim reminder WhatsApp langsung ke orang tua.',
        ],
        'shots': ['Daftar orang tua'],
    },
    {
        'title': '6. Tutor',
        'bullets': [
            'Daftar tutor: status kepegawaian, kelompok yang diampu.',
            'Detail tutor: kelompok, jadwal mengajar, kehadiran mengajar.',
            'Nonaktifkan tutor — sesi mendatang perlu ditugaskan ulang ke tutor lain.',
        ],
        'shots': ['Daftar tutor dan detail penugasan'],
    },
    {
        'title': '7. Master Data',
        'paras': ['Data referensi sistem yang dipakai lintas modul.'],
        'bullets': [
            'Mapel: kode & nama — dipakai di jenjang, konten, jadwal.',
            'Level kelas (grade level), tahun ajaran, dan referensi lain.',
            'Data nonaktif tidak bisa dipilih pada data baru, histori tetap aman.',
        ],
        'shots': ['Halaman master data'],
    },
    {
        'title': '8. Level',
        'paras': ['Tampilan lintas program dari semua jenjang — flat, searchable, filterable.'],
        'bullets': [
            'Filter program, level kelas, status; cari nama level/program/mapel.',
            'Edit jenjang dari sini atau dari detail Program — data sama.',
            'Mapel per jenjang menentukan pilihan mapel di kelompok, soal, materi, jadwal.',
        ],
        'shots': ['Tabel level lintas program'],
    },
    {
        'title': '9. Harga Program',
        'paras': ['Lihat/atur tarif program & jenjang — dibagikan dengan Admin Finance.'],
        'bullets': [
            'Pricelist per satuan harga (tahun ajaran / bulan / pertemuan / paket).',
            'Biaya pendaftaran per jenjang — kosong = ikut program.',
            'Perubahan berlaku untuk invoice berikutnya.',
        ],
        'shots': ['Form harga program'],
    },
    {
        'title': '10. Pendaftaran',
        'paras': ['Proses pendaftar dari form publik maupun portal orang tua.'],
        'steps': [
            'Antrean pendaftar MENUNGGU tampil di atas.',
            'Periksa data: nama, program & jenjang, kontak, status akun anak.',
            'Setujui → akun siswa dibuat dan terhubung ke orang tua; lanjutkan penempatan kelompok.',
            'Tolak dengan alasan bila data tidak valid.',
        ],
        'shots': ['Antrean pendaftaran'],
    },
    {
        'title': '11. Jadwal & Sesi',
        'paras': [
            'Pusat penjadwalan. Sistem menjadwalkan PER TANGGAL dengan peserta PER SISWA — '
            'satu kelompok boleh dipecah ke beberapa sesi paralel.',
        ],
        'subs': [
            {
                'title': 'Papan penugasan tutor (mingguan)',
                'steps': [
                    'Papan mingguan menampilkan semua sesi 7 hari — klik tanggal membuka editor hari itu.',
                    'Di editor: lihat sesi hari itu, ganti pengajar lewat dropdown searchable, atau buat sesi baru.',
                    'Buat sesi: pilih tutor → kelompok → mapel → ruangan → jam → centang siswa yang hadir.',
                    'Semua anggota kelompok tercentang secara default; panel siswa punya kolom CARI plus '
                    'aksi massal "Semua hasil"/"Bersihkan hasil" yang hanya memengaruhi siswa hasil filter.',
                ],
            },
            {
                'title': 'Edit sesi & roster peserta',
                'bullets': [
                    'Ikon pensil di tiap sesi membuka form edit: jam, mapel, ruangan, status — '
                    'plus editor ROSTER di bawahnya (centang/hapus centang siswa, cari, pilih hasil, pindah sesi).',
                    'Panel detail sesi dan halaman absensi tutor memakai editor roster yang sama — '
                    'perubahan di satu tempat langsung terlihat di tempat lain.',
                    'Siswa yang sudah diabsen tidak bisa di-uncheck (ditolak server — koreksi lewat absen).',
                ],
            },
            {
                'title': 'Pindah siswa antar sesi',
                'steps': [
                    'Di editor roster, baris siswa punya dropdown "Pindah ke sesi…" (searchable, label lengkap jam+mapel).',
                    'Pilih sesi tujuan satu kelompok → tombol Pindah aktif → klik.',
                    'Absensi yang sudah tercatat ikut berpindah; siswa mendapat notifikasi perubahan sesi.',
                    'Tutor bisa memindahkan siswa ke sesi tutor lain dalam kelompok yang sama.',
                ],
            },
            {
                'title': 'Kalender, catatan tanggal & override',
                'bullets': [
                    'Kalender bulanan di bawah papan — klik tanggal/sesi membuka panel detail.',
                    'Catatan tanggal (LIBUR/RAPAT/DARURAT/INFO) tampil di kalender & ikut reminder mingguan.',
                    'Override per-siswa: ubah jam/ruang untuk 1 siswa tanpa mengubah sesi.',
                    'Konflik otomatis dicek: tutor/ruangan/siswa tidak boleh dobel — dua sesi satu kelompok '
                    'diperbolehkan selama pesertanya berbeda.',
                    'Reminder mingguan dikirim per siswa sesuai roster — ortu hanya menerima sesi anaknya; '
                    'reminder tutor merangkum sesi yang dia ampu.',
                ],
            },
        ],
        'shots': ['Papan penugasan tutor mingguan', 'Form buat sesi dengan cari & centang siswa', 'Editor roster dengan pindah sesi'],
    },
    {
        'title': '12. Fasilitas',
        'bullets': [
            'Kelola gedung & ruangan tempat sesi berlangsung: nama, alamat, kapasitas, status.',
            'Ruangan nonaktif tidak bisa dipilih pada jadwal baru.',
            'Konflik ruangan dicek otomatis saat membuat sesi.',
        ],
        'shots': ['Daftar gedung dan ruangan'],
    },
    {
        'title': '13. Absensi',
        'paras': ['Pantau dan koreksi absensi siswa & kehadiran tutor per sesi.'],
        'bullets': [
            'Pilih sesi → daftar siswa = peserta sesi itu (roster), bukan seluruh anggota kelompok.',
            'Status: HADIR, TERLAMBAT, IZIN, SAKIT, ALFA + catatan.',
            'Panel "Atur peserta sesi" di halaman absen bisa mengubah roster sebelum mengisi absen.',
            'Tutor mengisi sekali per sesi; koreksi setelahnya wewenang Admin Academic.',
            'Absen siswa otomatis menandai tutor hadir mengajar (dipakai payroll); ALFA memicu notifikasi ke ortu & siswa.',
        ],
        'shots': ['Form absensi satu sesi dengan panel atur peserta'],
    },
    {
        'title': '14. Materi',
        'paras': ['Bank materi terstruktur: tingkat → jenjang → mapel → kategori.'],
        'bullets': [
            'Buat materi: judul, pilih Tingkat → Jenjang → Mapel → Kategori → isi konten/lampiran.',
            'Filter & drill-down di daftar; mapel tanpa materi tetap tampil di filter.',
            'Materi tampil di portal siswa sesuai cakupan jenjangnya.',
        ],
        'shots': ['Daftar materi dengan filter dan form buat materi'],
    },
    {
        'title': '15. Pustaka Media',
        'paras': ['Gudang gambar lintas modul — unggah, dedup otomatis (SHA-256), salin URL, hapus.'],
        'shots': ['Pustaka media'],
    },
    {
        'title': '16. Soal (Bank Soal)',
        'paras': ['Kelola soal per jenjang/mapel untuk dipakai Latsol & Ujian.'],
        'bullets': [
            'Tipe: pilihan ganda, benar-salah, pilihan ganda kompleks, benar-salah kompleks, isian.',
            'Buat/edit/hapus soal dengan pembahasan; import massal dari file.',
            'Bacaan (stimulus) bisa dilampirkan dan dipilih saat membuat soal.',
            'Filter jenjang, tingkat, mapel — semua dropdown searchable.',
        ],
        'shots': ['Bank soal dengan filter dan editor soal'],
    },
    {
        'title': '17. Latsol',
        'paras': ['Paket latihan soal mandiri untuk siswa.'],
        'steps': [
            'Buat paket: isi Judul, pilih Tingkat → Jenjang → Mapel (opsional, boleh campur) → Kategori → Simpan Paket.',
            'Setelah paket dibuat, sistem mengarah ke halaman "Kelola Soal" untuk memilih soalnya.',
            'Edit paket: detail yang sama bisa diubah; soal dikelola terpisah.',
            'Siswa mengerjakan kapan saja — hasil langsung keluar dengan pembahasan; riwayat attempt terekam.',
        ],
        'tips': ['Mapel boleh dikosongkan untuk paket campuran (soal lintas mapel).'],
        'shots': ['Form buat paket latsol — tingkat, jenjang, mapel, kategori', 'Halaman kelola soal paket'],
    },
    {
        'title': '18. Ujian',
        'paras': ['Ujian terjadwal dengan pengaturan lengkap — reguler maupun peserta luar.'],
        'bullets': [
            'Buat ujian: judul, jadwal mulai/selesai, durasi, mapel/jenjang, peserta (kelompok, atau kode akses untuk peserta luar/tryout).',
            'Multi-subtes: tiap subtes durasi sendiri dan dikerjakan berurutan.',
            'Acak urutan soal — acakan tersimpan per attempt (konsisten saat refresh/resume, hanya di dalam subtes).',
            'Proteksi: batasi tab & screenshot, deteksi pelanggaran (pindah tab, keluar fullscreen); '
            'Wake Lock mencegah layar mati di browser yang mendukung (Chrome/Edge).',
            'Kunci jawaban & pengaturan rilis hasil; unlock attempt terkunci dengan sisa waktu subtes utuh.',
            'Ujian publik ditandai "tampil di /tryout" — muncul di halaman Try Out landing untuk promosi.',
        ],
        'shots': ['Form buat ujian', 'Daftar ujian dengan status dan badge LIVE'],
    },
    {
        'title': '19. Proctoring',
        'paras': ['Monitor pelanggaran selama ujian berlangsung, real-time.'],
        'bullets': [
            'Daftar attempt: jumlah/jenis pelanggaran, status (berjalan/terkunci/selesai).',
            'Unlock attempt terkunci setelah verifikasi — siswa lanjut dari posisi terakhir, sisa waktu utuh.',
        ],
        'shots': ['Papan proctoring dengan status attempt'],
    },
    {
        'title': '20. Pembahasan',
        'paras': ['Kelola pembahasan soal ujian — rilis per ujian ketika dibuka untuk siswa.'],
        'shots': ['Daftar pembahasan per ujian'],
    },
    {
        'title': '21. Analisis',
        'paras': ['Analisis hasil ujian & latsol: rekap nilai, rekap jawaban per soal, statistik.'],
        'bullets': [
            'Rekap Nilai: tabel siswa × skor — cari nama/sekolah/kelompok, filter kategori nilai, urutkan, statistik rata-rata/tertinggi/terendah.',
            'Rekap Jawaban: akurasi per soal; kolom nama tetap terlihat saat geser.',
            'Paginasi 10/20/50/100/semua — aman untuk ratusan peserta.',
            'Cetak analisis ujian untuk dokumentasi.',
        ],
        'shots': ['Analisis — rekap nilai dengan toolbar filter'],
    },
    {
        'title': '22. Ranking',
        'paras': ['Papan podium poin siswa + konfigurasi Score Rules.'],
        'bullets': [
            'Podium per kelompok, per gedung, dan seluruh GFS — filter periode (bulan) atau semua waktu.',
            'Semua filter (kelompok, level, program, gedung) searchable dan bisa dikosongkan.',
            'Score Rules: poin per ujian/latsol/tipe soal — data-driven, perubahan tidak retroaktif.',
            'Poin diberikan otomatis saat attempt selesai.',
        ],
        'shots': ['Papan ranking tiga kolom dan score rules'],
    },
    {
        'title': '23. Laporan',
        'paras': ['Laporan akademik & performa — tampil langsung di aplikasi, bisa dicetak.'],
        'bullets': [
            'Rekap kehadiran siswa (per siswa/kelompok/periode) termasuk sesi yang seharusnya dihadiri.',
            'Laporan hasil belajar per siswa — pilih anak, tipe ujian, tes kemampuan dasar.',
            'Laporan aktivitas kelompok & utilisasi; ekspor feedback & laporan cetak lainnya.',
        ],
        'shots': ['Halaman laporan akademik'],
    },
    {
        'title': '24. Antrean WA',
        'bullets': [
            'Monitor semua pesan WA sistem: status antre/terkirim/gagal, isi, tujuan.',
            'Retry pesan gagal; alasan kegagalan provider ditampilkan.',
        ],
        'shots': ['Antrean WhatsApp'],
    },
    *SHARED_SYS_SECTIONS,
    {
        'title': 'Lampiran — Alur Kerja Harian yang Disarankan',
        'steps': [
            'Pagi: Dashboard → pendaftar baru → setujui & tempatkan; cek sesi hari ini (tutor & roster benar).',
            'Buat sesi susulan/perubahan; pindahkan siswa berhalangan ke sesi lain bila perlu.',
            'Siang/sore: pantau absensi masuk; koreksi bila tutor salah isi.',
            'Pantau strip notifikasi dashboard: attempt ujian terkunci → unlock bila sah; WA gagal → retry.',
            'Mingguan: kirim Reminder Jadwal (otomatis per-siswa sesuai roster); siapkan konten/ujian minggu berikutnya.',
            'Berkala: pantau Analisis & Ranking; tandai paket unggulan untuk landing; terbitkan pengumuman bila perlu.',
        ],
    },
]


if __name__ == '__main__':
    build_doc(
        'ADMIN FINANCE',
        'Sistem Manajemen Bimbel GFS — Modul Keuangan & Administrasi',
        [
            'Manual ini ditujukan untuk staf Admin Finance. Role ini menangani seluruh siklus keuangan '
            'bimbel: pendaftaran & tagihan siswa, pembayaran, penagihan piutang, kas/bank, pengeluaran, '
            'RAB (anggaran), payroll tutor, hingga laporan keuangan.',
            'Admin Finance juga mengelola data siswa/orang tua, program & paket unggulan, pengaturan '
            'sistem, akun pengguna, dan antrean notifikasi WhatsApp.',
        ],
        FINANCE_SECTIONS,
        'docs/Manual-Pengguna-Admin-Finance.docx',
    )
    build_doc(
        'ADMIN ACADEMIC',
        'Sistem Manajemen Bimbel GFS — Modul Akademik & Operasional',
        [
            'Manual ini ditujukan untuk staf Admin Academic. Role ini menangani seluruh sisi akademik & '
            'operasional: data siswa/orang tua/tutor, kelompok & penempatan, jadwal & sesi per siswa, '
            'absensi, bank soal, materi, latsol, ujian & proctoring, analisis nilai, ranking, '
            'feedback, serta antrean WhatsApp dan pengaturan sistem.',
        ],
        ACADEMIC_SECTIONS,
        'docs/Manual-Pengguna-Admin-Academic.docx',
    )
