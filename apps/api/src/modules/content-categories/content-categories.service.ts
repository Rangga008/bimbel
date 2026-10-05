import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  CreateContentCategoryDto,
  UpdateContentCategoryDto,
} from './dto/content-category.dto';

/**
 * Kategori konten dinamis (latihan harian, UTS, TO, UAS, Bab 1..N, dst.) —
 * dipakai materi, bank soal, paket latsol, dan ujian. Kolom `category` pada
 * konten menyimpan `code` dari tabel ini, jadi mengganti nama tidak merusak
 * data lama.
 */
@Injectable()
export class ContentCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  list(includeInactive = false) {
    return this.prisma.contentCategoryDef.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  /**
   * Validasi nilai `category` saat konten dibuat/diupdate — kode harus ada di
   * tabel dan masih aktif. Dipanggil service konten agar tidak ada nilai bebas.
   */
  async assertUsable(code?: string | null) {
    if (code === undefined || code === null || code === '') return;
    const cat = await this.prisma.contentCategoryDef.findUnique({
      where: { code },
    });
    if (!cat) {
      throw new BadRequestException(`Kategori "${code}" tidak ditemukan.`);
    }
    if (!cat.isActive) {
      throw new BadRequestException(`Kategori "${cat.name}" sudah dinonaktifkan.`);
    }
  }

  /** Kode unik dari nama: "Bab 1" → BAB-1, "Try Out" → TRY-OUT. */
  private codeFromName(name: string) {
    const base =
      name
        .normalize('NFKD')
        .replace(/[^\w\s-]/g, '')
        .trim()
        .toUpperCase()
        .replace(/[\s_]+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 40) || 'TIPE';
    return base;
  }

  async create(dto: CreateContentCategoryDto) {
    const base = this.codeFromName(dto.name);
    let code = base;
    for (let i = 1; i <= 100; i++) {
      const existing = await this.prisma.contentCategoryDef.findUnique({
        where: { code },
      });
      if (!existing) break;
      // Reaktivasi kalau kode yang sama sudah pernah ada tapi nonaktif.
      if (i === 100) throw new BadRequestException('Kode kategori tidak bisa dibuat unik.');
      code = `${base}-${i}`;
    }
    return this.prisma.contentCategoryDef.create({
      data: {
        code,
        name: dto.name.trim(),
        sortOrder: dto.sortOrder ?? 100,
      },
    });
  }

  async update(id: string, dto: UpdateContentCategoryDto) {
    const cat = await this.prisma.contentCategoryDef.findUnique({
      where: { id },
    });
    if (!cat) throw new NotFoundException('Kategori tidak ditemukan.');
    return this.prisma.contentCategoryDef.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
    });
  }

  /**
   * Hapus hanya kalau belum dipakai konten mana pun — kategori yang sudah
   * terpakai harus dinonaktifkan agar label di konten lama tetap terbaca.
   */
  async delete(id: string) {
    const cat = await this.prisma.contentCategoryDef.findUnique({
      where: { id },
    });
    if (!cat) throw new NotFoundException('Kategori tidak ditemukan.');
    const [materials, questions, packages, exams] = await Promise.all([
      this.prisma.material.count({ where: { category: cat.code } }),
      this.prisma.question.count({ where: { category: cat.code } }),
      this.prisma.latsolPackage.count({ where: { category: cat.code } }),
      this.prisma.exam.count({ where: { category: cat.code } }),
    ]);
    const used = materials + questions + packages + exams;
    if (used > 0) {
      throw new BadRequestException(
        `Kategori ini masih dipakai ${used} konten — nonaktifkan saja agar riwayat tetap terbaca.`,
      );
    }
    await this.prisma.contentCategoryDef.delete({ where: { id } });
    return { success: true };
  }
}
