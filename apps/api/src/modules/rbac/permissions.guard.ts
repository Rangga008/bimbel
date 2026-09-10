import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PERMISSIONS_KEY } from './permissions.decorator';
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
    const required = this.reflector.getAllAndOverride<PermissionCode[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required || required.length === 0) {
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

    const hasAll = required.every((permission) =>
      user.permissions.includes(permission),
    );
    if (!hasAll) {
      throw new ForbiddenException(
        'Anda tidak memiliki akses ke halaman/aksi ini.',
      );
    }

    return true;
  }
}
