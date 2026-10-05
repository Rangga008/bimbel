// CRUD Building & Room minimal (Fase 1c): hanya untuk conflict detection ruangan.
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateBuildingDto } from './dto/create-building.dto';
import { CreateRoomDto, UpdateRoomDto } from './dto/create-room.dto';

@Injectable()
export class FacilitiesService {
  constructor(private readonly prisma: PrismaService) {}

  listBuildings() {
    return this.prisma.building.findMany({
      include: { rooms: { select: { id: true, name: true, isActive: true } } },
      orderBy: { name: 'asc' },
      take: 100,
    });
  }

  createBuilding(dto: CreateBuildingDto) {
    return this.prisma.building.create({ data: { name: dto.name, address: dto.address, isActive: dto.isActive ?? true } });
  }

  listRooms(buildingId?: string) {
    return this.prisma.room.findMany({
      where: { ...(buildingId ? { buildingId } : {}) },
      include: { building: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
      take: 200,
    });
  }

  async removeBuilding(id: string) {
    const building = await this.prisma.building.findUnique({
      where: { id },
      include: { _count: { select: { rooms: true } } },
    });
    if (!building) throw new NotFoundException('Gedung tidak ditemukan.');
    if (building._count.rooms > 0) {
      throw new BadRequestException(
        `Gedung ini masih punya ${building._count.rooms} ruangan — pindahkan atau hapus ruangannya dulu.`,
      );
    }
    return this.prisma.building.delete({ where: { id } });
  }

  async removeRoom(id: string) {
    const room = await this.prisma.room.findUnique({ where: { id } });
    if (!room) throw new NotFoundException('Ruangan tidak ditemukan.');
    const [sessions, schedules] = await Promise.all([
      this.prisma.session.count({ where: { roomId: id } }),
      this.prisma.schedule.count({ where: { roomId: id } }),
    ]);
    if (sessions + schedules > 0) {
      throw new BadRequestException(
        `Ruangan ini dipakai ${sessions} sesi — nonaktifkan saja agar riwayat jadwal tetap utuh.`,
      );
    }
    return this.prisma.room.delete({ where: { id } });
  }

  async createRoom(dto: CreateRoomDto) {
    if (dto.buildingId) {
      const b = await this.prisma.building.findUnique({ where: { id: dto.buildingId } });
      if (!b) throw new NotFoundException('Gedung tidak ditemukan.');
    }
    const clash = await this.prisma.room.findFirst({
      where: { name: dto.name, buildingId: dto.buildingId ?? null },
    });
    if (clash) throw new ConflictException('Nama ruangan sudah dipakai di gedung ini.');
    return this.prisma.room.create({
      data: {
        name: dto.name,
        buildingId: dto.buildingId ?? null,
        capacity: dto.capacity ?? null,
        photoUrl: dto.photoUrl || null,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateRoom(id: string, dto: UpdateRoomDto) {
    const room = await this.prisma.room.findUnique({ where: { id } });
    if (!room) throw new NotFoundException('Ruangan tidak ditemukan.');
    if (dto.buildingId) {
      const b = await this.prisma.building.findUnique({ where: { id: dto.buildingId } });
      if (!b) throw new NotFoundException('Gedung tidak ditemukan.');
    }
    const nextName = dto.name ?? room.name;
    const nextBuilding =
      dto.buildingId !== undefined ? dto.buildingId : room.buildingId;
    const clash = await this.prisma.room.findFirst({
      where: {
        id: { not: id },
        name: nextName,
        buildingId: nextBuilding ?? null,
      },
    });
    if (clash) throw new ConflictException('Nama ruangan sudah dipakai di gedung ini.');
    return this.prisma.room.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.buildingId !== undefined ? { buildingId: dto.buildingId } : {}),
        ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
        ...(dto.photoUrl !== undefined ? { photoUrl: dto.photoUrl || null } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }
}
