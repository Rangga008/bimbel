import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditLogInput {
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string;
  oldData?: unknown;
  newData?: unknown;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Semua aksi kritis (perubahan role/permission, verifikasi pembayaran, dst) wajib
 * dicatat lewat service ini agar konsisten (actor, action, entity, before/after).
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: AuditLogInput) {
    return this.prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        oldData:
          input.oldData === undefined ? undefined : (input.oldData as object),
        newData:
          input.newData === undefined ? undefined : (input.newData as object),
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      },
    });
  }
}
