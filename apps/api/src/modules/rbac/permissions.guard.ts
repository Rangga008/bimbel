import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PERMISSIONS_KEY, PERMISSIONS_ANY_KEY } from './permissions.decorator';
import { PermissionCode } from './permissions.constants';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';

/**
 * Validasi permission WAJIB di backend (bukan cuma sembunyikan tombol di frontend).
 * Guard ini membaca permission yang sudah tertanam di JWT access token saat login.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredAll = this.reflector.getAllAndOverride<PermissionCode[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    const requiredAny = this.reflector.getAllAndOverride<PermissionCode[]>(
      PERMISSIONS_ANY_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (
      (!requiredAll || requiredAll.length === 0) &&
      (!requiredAny || requiredAny.length === 0)
    ) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException(
        'Anda tidak memiliki akses ke halaman/aksi ini.',
      );
    }

    if (requiredAll && requiredAll.length > 0) {
      const hasAll = requiredAll.every((permission) =>
        user.permissions.includes(permission),
      );
      if (!hasAll) {
        throw new ForbiddenException(
          'Anda tidak memiliki akses ke halaman/aksi ini.',
        );
      }
    }

    if (requiredAny && requiredAny.length > 0) {
      const hasAny = requiredAny.some((permission) =>
        user.permissions.includes(permission),
      );
      if (!hasAny) {
        throw new ForbiddenException(
          'Anda tidak memiliki akses ke halaman/aksi ini.',
        );
      }
    }

    return true;
  }
}
