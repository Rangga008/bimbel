import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ProgramsService } from './programs.service';
import { receiptDetailInclude } from '../payments/receipt.includes';
import { LANDING_DISPLAY_DEFAULTS } from '../settings/settings.service';

/**
 * Endpoint publik (tanpa JWT) untuk landing page `/`:
 * statistik ringkas + katalog program/level/paket aktif.
 * Hanya data agregat & katalog promosi — tidak ada data personal.
 */
@Controller('public')
export class PublicController {
  constructor(
    private readonly programs: ProgramsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('landing')
  async landing() {
    const [students, tutors, programCount, packageCount, catalog, rooms, buildings, pkgGroups, displayRow] =
      await Promise.all([
        this.prisma.student.count({ where: { isActive: true } }),
        this.prisma.tutor.count({ where: { isActive: true } }),
        this.prisma.program.count({ where: { isActive: true } }),
        this.prisma.package.count({ where: { isActive: true } }),
        this.programs.catalog(),
        this.prisma.room.findMany({
          where: { isActive: true },
          orderBy: { name: 'asc' },
          select: {
            id: true,
            name: true,
            capacity: true,
            photoUrl: true,
            building: { select: { name: true } },
          },
        }),
        this.prisma.building.findMany({
          orderBy: { name: 'asc' },
          select: { name: true, address: true },
        }),
        // Jumlah siswa per paket — dipakai landing untuk menampilkan
        // "paket terpopuler" (paket dengan anggota kelompok terbanyak).
        this.prisma.learningGroup.findMany({
          where: { packageId: { not: null } },
          select: { packageId: true, _count: { select: { members: true } } },
        }),
        // Pengaturan tampilan landing — foto hero + link formulir pendaftaran.
        this.prisma.appSetting.findUnique({ where: { key: 'display' } }),
      ]);

    const pkgStudents = new Map<string, number>();
    for (const g of pkgGroups) {
      if (!g.packageId) continue;
      pkgStudents.set(
        g.packageId,
        (pkgStudents.get(g.packageId) ?? 0) + g._count.members,
      );
    }
    const catalogWithCounts = catalog.map((p) => ({
      ...p,
      levels: p.levels.map((l) => ({
        ...l,
        packages: l.packages.map((pkg) => ({
          ...pkg,
          studentCount: pkgStudents.get(pkg.id) ?? 0,
        })),
      })),
    }));

    const displayVal = (displayRow?.value ?? {}) as Record<string, unknown>;
    // Teks landing — fallback ke default bila admin belum mengisi.
    const dstr = (k: keyof typeof LANDING_DISPLAY_DEFAULTS) =>
      typeof displayVal[k] === 'string' && displayVal[k]
        ? (displayVal[k] as string)
        : LANDING_DISPLAY_DEFAULTS[k];
    return {
      stats: {
        students,
        tutors,
        programs: programCount,
        packages: packageCount,
      },
      catalog: catalogWithCounts,
      facilities: rooms.map((r) => ({
        id: r.id,
        name: r.name,
        capacity: r.capacity,
        photoUrl: r.photoUrl,
        buildingName: r.building?.name ?? null,
      })),
      locations: buildings,
      display: {
        heroImages: Array.isArray(displayVal.heroImages)
          ? displayVal.heroImages
          : [],
        registrationUrl:
          typeof displayVal.registrationUrl === 'string' &&
          displayVal.registrationUrl
            ? displayVal.registrationUrl
            : 'https://s.id/info-daftarGFS2627',
        heroBadge: dstr('heroBadge'),
        heroTitle: dstr('heroTitle'),
        heroHighlight: dstr('heroHighlight'),
        heroSubtitle: dstr('heroSubtitle'),
        aboutParagraph1: dstr('aboutParagraph1'),
        aboutParagraph2: dstr('aboutParagraph2'),
        officeAddress: dstr('officeAddress'),
        officeHours: dstr('officeHours'),
        ctaTitle: dstr('ctaTitle'),
        ctaSubtitle: dstr('ctaSubtitle'),
        testimonials: Array.isArray(displayVal.testimonials)
          ? displayVal.testimonials
          : [],
        locations: Array.isArray(displayVal.locations)
          ? displayVal.locations
          : [],
      },
    };
  }

  /**
   * Try out publik — ujian yang ditandai "tampil di landing /tryout" oleh
   * admin. Dipakai untuk promosi: peserta luar daftar akun → verifikasi HP →
   * masukkan kode akses → kerjakan. Hanya info non-sensitif (tanpa soal).
   */
  @Get('tryouts')
  async tryouts() {
    const [exams, catDefs] = await Promise.all([
      this.prisma.exam.findMany({
        where: { isPublic: true, status: 'PUBLISHED' },
        orderBy: { scheduledStartAt: 'desc' },
        take: 30,
        select: {
          id: true,
          title: true,
          description: true,
          category: true,
          accessCode: true,
          scheduledStartAt: true,
          scheduledEndAt: true,
          durationMinutes: true,
          status: true,
          showResultImmediately: true,
          subject: { select: { name: true } },
          _count: { select: { items: true } },
          subtes: {
            orderBy: { sortOrder: 'asc' },
            select: {
              name: true,
              durationMinutes: true,
              _count: { select: { items: true } },
            },
          },
        },
      }),
      this.prisma.contentCategoryDef.findMany({
        select: { code: true, name: true },
      }),
    ]);
    const catName = new Map(catDefs.map((c) => [c.code, c.name]));
    return {
      tryouts: exams.map((e) => ({
        id: e.id,
        title: e.title,
        description: e.description,
        // Label ramah dari definisi kategori konten (kode → nama).
        category: (e.category && catName.get(e.category)) || e.category || 'Umum',
        accessCode: e.accessCode,
        scheduledStartAt: e.scheduledStartAt,
        scheduledEndAt: e.scheduledEndAt,
        durationMinutes: e.durationMinutes,
        status: e.status,
        showResultImmediately: e.showResultImmediately,
        subjectName: e.subject?.name ?? null,
        questionCount: e.subtes.length
          ? e.subtes.reduce((n, s) => n + s._count.items, 0)
          : e._count.items,
        subtes: e.subtes.map((s) => ({
          name: s.name,
          durationMinutes: s.durationMinutes,
          questionCount: s._count.items,
        })),
      })),
    };
  }

  /** Branding aplikasi (nama, tagline, logo) untuk login/landing/sidebar. */
  @Get('branding')
  async branding() {
    const row = await this.prisma.appSetting.findUnique({
      where: { key: 'branding' },
    });
    const stored = (row?.value ?? {}) as Record<string, unknown>;
    return {
      appName:
        typeof stored.appName === 'string' && stored.appName
          ? stored.appName
          : 'Bimbel GFS',
      tagline: typeof stored.tagline === 'string' ? stored.tagline : '',
      logoUrl: typeof stored.logoUrl === 'string' ? stored.logoUrl : '',
    };
  }

  /**
   * Kwitansi publik — id UUID tidak bisa ditebak (pola sama seperti
   * /media/:id/file). Dipakai sebagai link "Lihat kwitansi" di pesan WA.
   */
  @Get('receipt/:id')
  async receipt(@Param('id') id: string) {
    const receipt = await this.prisma.receipt.findUnique({
      where: { id },
      include: receiptDetailInclude,
    });
    if (!receipt) throw new NotFoundException('Kwitansi tidak ditemukan.');
    const [student, verifier, companyRow, brandingRow, financeRow] =
      await Promise.all([
        this.prisma.student.findUnique({
          where: { id: receipt.studentId },
          select: { user: { select: { name: true } } },
        }),
        receipt.verifierId && receipt.verifierId !== 'GATEWAY-WEBHOOK'
          ? this.prisma.user.findUnique({
              where: { id: receipt.verifierId },
              select: { name: true },
            })
          : Promise.resolve(null),
        this.prisma.appSetting.findUnique({ where: { key: 'company' } }),
        this.prisma.appSetting.findUnique({ where: { key: 'branding' } }),
        this.prisma.appSetting.findUnique({ where: { key: 'finance' } }),
      ]);
    const company = (companyRow?.value ?? {}) as Record<string, unknown>;
    const branding = (brandingRow?.value ?? {}) as Record<string, unknown>;
    const finance = (financeRow?.value ?? {}) as Record<string, unknown>;
    // Nomor angsuran: urutan invoice pendaftaran yang sama (fallback: paket),
    // diurutkan per bulan jatuh tempo (dueDate); fallback issuedAt/createdAt.
    let installmentNo: number | null = null;
    const inv = receipt.invoice;
    if (inv) {
      const pivot = inv.dueDate ?? inv.issuedAt ?? inv.createdAt;
      const earlier = await this.prisma.invoice.count({
        where: {
          studentId: inv.studentId,
          id: { not: inv.id },
          ...(inv.enrollmentId
            ? { enrollmentId: inv.enrollmentId }
            : { packageId: inv.packageId ?? undefined }),
          OR: [
            { dueDate: { lt: pivot } },
            {
              AND: [
                { dueDate: pivot },
                { createdAt: { lt: inv.createdAt } },
              ],
            },
            {
              dueDate: null,
              issuedAt: { lt: inv.issuedAt ?? inv.createdAt },
            },
            {
              dueDate: null,
              issuedAt: null,
              createdAt: { lt: inv.createdAt },
            },
          ],
        },
      });
      installmentNo = earlier + 1;
    }
    return {
      ...receipt,
      student,
      verifier,
      installmentNo,
      remaining: inv
        ? Number(inv.totalAmount) - Number(inv.amountPaid)
        : null,
      company: {
        logoUrl: typeof branding.logoUrl === 'string' ? branding.logoUrl : '',
        name:
          typeof company.name === 'string' && company.name
            ? company.name
            : (branding.appName as string) || 'Bimbel GFS',
        address: typeof company.address === 'string' ? company.address : '',
        phone: typeof company.phone === 'string' ? company.phone : '',
        email: typeof company.email === 'string' ? company.email : '',
        // Penandatangan kwitansi — diatur admin di Pengaturan > Keuangan.
        signerName:
          typeof finance.receiptSignerName === 'string'
            ? finance.receiptSignerName
            : '',
        signerTitle:
          typeof finance.receiptSignerTitle === 'string'
            ? finance.receiptSignerTitle
            : '',
        signatureUrl:
          typeof finance.receiptSignatureUrl === 'string'
            ? finance.receiptSignatureUrl
            : '',
      },
    };
  }
}
