import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreatePackageDto } from './dto/create-package.dto';
import { UpdatePackageDto } from './dto/update-package.dto';

/** CRUD Package — paket punya jumlah sesi tetap (totalSessions). */
@Injectable()
export class PackagesService {
  constructor(private readonly prisma: PrismaService) {}

  list(query: { levelId?: string; programId?: string }) {
    return this.prisma.package.findMany({
      where: {
        ...(query.levelId ? { levelId: query.levelId } : {}),
        ...(query.programId ? { level: { programId: query.programId } } : {}),
      },
      include: {
        level: {
          select: {
            id: true,
            name: true,
            program: { select: { id: true, name: true, code: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
      take: 200,
    });
  }

  async get(id: string) {
    const pkg = await this.prisma.package.findUnique({
      where: { id },
      include: {
        level: {
          select: {
            id: true,
            name: true,
            program: { select: { id: true, name: true, code: true } },
          },
        },
      },
    });
    if (!pkg) throw new NotFoundException('Paket tidak ditemukan.');
    return pkg;
  }

  async create(dto: CreatePackageDto) {
    const level = await this.prisma.level.findUnique({
      where: { id: dto.levelId },
    });
    if (!level) throw new NotFoundException('Level tidak ditemukan.');
    await this.assertUniqueName(dto.levelId, dto.name);
    return this.prisma.package.create({
      data: {
        levelId: dto.levelId,
        name: dto.name,
        code: dto.code,
        totalSessions: dto.totalSessions,
        durationWeeks: dto.durationWeeks,
        price:
          dto.price === undefined ? undefined : new Prisma.Decimal(dto.price),
        description: dto.description,
        isActive: dto.isActive,
      },
    });
  }

  /** Nama paket unik (case-insensitive) dalam satu level — cegah duplikat. */
  private async assertUniqueName(levelId: string, name: string, excludeId?: string) {
    const clash = await this.prisma.package.findFirst({
      where: {
        levelId,
        name: { equals: name.trim(), mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (clash) throw new ConflictException('Paket dengan nama tersebut sudah ada di level ini.');
  }

  async update(id: string, dto: UpdatePackageDto) {
    const existing = await this.get(id);
    if (dto.name !== undefined) {
      await this.assertUniqueName(existing.levelId, dto.name, id);
    }
    return this.prisma.package.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.code !== undefined ? { code: dto.code } : {}),
        ...(dto.totalSessions !== undefined ? { totalSessions: dto.totalSessions } : {}),
        ...(dto.durationWeeks !== undefined ? { durationWeeks: dto.durationWeeks } : {}),
        ...(dto.price !== undefined
          ? { price: dto.price === null ? null : new Prisma.Decimal(dto.price) }
          : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  /**
   * Set harga paket saja — endpoint khusus Admin Finance (`price.manage`).
   * `null` mengosongkan harga (invoice dari paket akan ditolak sampai diisi).
   */
  async setPrice(id: string, price: number | null) {
    await this.get(id);
    if (price !== null && (!Number.isFinite(price) || price < 0)) {
      throw new BadRequestException('Harga harus angka >= 0 atau kosong.');
    }
    return this.prisma.package.update({
      where: { id },
      data: { price: price === null ? null : new Prisma.Decimal(price) },
      include: {
        level: {
          select: {
            id: true,
            name: true,
            program: { select: { id: true, name: true, code: true } },
          },
        },
      },
    });
  }

  /**
   * Hapus paket. Aman terhadap data lain: kelompok & invoice yang merujuk
   * paket otomatis di-SetNull (FK sudah ON DELETE SET NULL) — tapi kalau ada
   * invoice, paket ditolak hapus demi menjaga riwayat keuangan (nonaktifkan
   * saja). Kelompok yang terikat tetap jalan, hanya lepas paketnya.
   */
  async remove(id: string) {
    const pkg = await this.get(id);
    const [invoiceCount, groupCount] = await Promise.all([
      this.prisma.invoice.count({ where: { packageId: id } }),
      this.prisma.learningGroup.count({ where: { packageId: id } }),
    ]);
    if (invoiceCount > 0) {
      throw new BadRequestException(
        `Paket ini sudah dipakai ${invoiceCount} invoice — nonaktifkan saja agar riwayat keuangan tetap utuh.`,
      );
    }
    await this.prisma.package.delete({ where: { id } });
    return { deleted: true, name: pkg.name, unlinkedGroups: groupCount };
  }
}
