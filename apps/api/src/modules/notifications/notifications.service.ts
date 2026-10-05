// Service Fase 1d: notifikasi in-app skeleton + preferensi.
// Fase 5b: notifyMany() untuk trigger otomatis lintas modul (WA menyusul
// lewat WhatsAppOutboxService — lihat notification-events.service.ts).
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  CreateNotificationDto,
  UpdatePreferenceDto,
} from './dto/notification.dto';

/** Kategori yang punya flag preferensi sendiri di notification_preferences. */
export type NotificationCategory = 'schedule' | 'attendance';

export interface NotifyPayload {
  title: string;
  body?: string;
  link?: string;
  category?: NotificationCategory;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Contoh manual trigger (DoD 1d): admin/owner membuat 1 notif in-app. */
  async create(dto: CreateNotificationDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });
    if (!user) throw new NotFoundException('User tujuan tidak ditemukan.');
    const pref = await this.prisma.notificationPreference.findUnique({
      where: { userId: dto.userId },
    });
    if (pref && !pref.inAppEnabled) {
      // Hormati preferensi: simpan tetap tapi tandai lewat body agar tidak hilang.
      return this.prisma.notification.create({
        data: {
          userId: dto.userId,
          title: dto.title,
          body: `[nonaktif] ${dto.body ?? ''}`.trim(),
          link: dto.link ?? null,
        },
      });
    }
    return this.prisma.notification.create({
      data: {
        userId: dto.userId,
        title: dto.title,
        body: dto.body ?? null,
        link: dto.link ?? null,
      },
    });
  }

  /**
   * Fase 5b — kirim notifikasi in-app ke banyak user sekaligus (dipakai
   * trigger otomatis). Menghormati preferensi per user:
   * - `inAppEnabled=false`      -> tetap disimpan dengan penanda [nonaktif]
   *   (konvensi skeleton Fase 1d, supaya jejak tidak hilang).
   * - `category='schedule'`     -> dilewati bila `scheduleAlert=false`.
   * - `category='attendance'`   -> dilewati bila `attendanceAlert=false`.
   */
  async notifyMany(userIds: string[], payload: NotifyPayload) {
    const ids = [...new Set(userIds.filter(Boolean))];
    if (ids.length === 0) return { created: 0 };
    const prefs = await this.prisma.notificationPreference.findMany({
      where: { userId: { in: ids } },
    });
    const prefByUser = new Map(prefs.map((p) => [p.userId, p]));
    const rows = ids
      .filter((id) => {
        const pref = prefByUser.get(id);
        if (!pref) return true;
        if (payload.category === 'schedule' && !pref.scheduleAlert)
          return false;
        if (payload.category === 'attendance' && !pref.attendanceAlert)
          return false;
        return true;
      })
      .map((id) => {
        const pref = prefByUser.get(id);
        const body =
          pref && !pref.inAppEnabled
            ? `[nonaktif] ${payload.body ?? ''}`.trim()
            : (payload.body ?? null);
        return {
          userId: id,
          title: payload.title,
          body,
          link: payload.link ?? null,
        };
      });
    if (rows.length === 0) return { created: 0 };
    await this.prisma.notification.createMany({ data: rows });
    return { created: rows.length };
  }

  mine(userId: string, unreadOnly: boolean) {
    return this.prisma.notification.findMany({
      where: { userId, ...(unreadOnly ? { isRead: false } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  unreadCount(userId: string) {
    return this.prisma.notification.count({ where: { userId, isRead: false } });
  }

  async markRead(userId: string, id: string) {
    const existing = await this.prisma.notification.findFirst({
      where: { id, userId },
    });
    if (!existing) throw new NotFoundException('Notifikasi tidak ditemukan.');
    if (existing.isRead) return existing;
    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { success: true };
  }

  myPreference(userId: string) {
    return this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
  }

  updatePreference(userId: string, dto: UpdatePreferenceDto) {
    return this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId, ...dto },
      update: { ...dto },
    });
  }
}
