import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ProgramsService } from './programs.service';
import { receiptDetailInclude } from '../payments/receipt.includes';

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
    const [students, tutors, programCount, packageCount, catalog, rooms, buildings, pkgGroups] =
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
    // Nomor angsuran: urutan invoice pendaftaran yang sama (fallback: paket).
    let installmentNo: number | null = null;
    const inv = receipt.invoice;
    if (inv) {
      const earlier = await this.prisma.invoice.count({
        where: {
          studentId: inv.studentId,
          ...(inv.enrollmentId
            ? { enrollmentId: inv.enrollmentId }
            : { packageId: inv.packageId ?? undefined }),
          OR: [
            { issuedAt: { lt: inv.issuedAt ?? inv.createdAt } },
            {
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
