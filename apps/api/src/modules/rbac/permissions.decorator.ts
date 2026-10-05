import { SetMetadata } from '@nestjs/common';
import { PermissionCode } from './permissions.constants';

export const PERMISSIONS_KEY = 'permissions';

/** Tandai endpoint dengan permission granular yang wajib dimiliki user (dicek di PermissionsGuard). */
export const RequirePermissions = (...permissions: PermissionCode[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * Tandai endpoint yang boleh diakses jika user punya SALAH SATU dari permission.
 * Guard membaca metadata PERMISSIONS_ANY_KEY secara terpisah.
 */
export const PERMISSIONS_ANY_KEY = 'permissions_any';
export const RequireAnyPermissions = (...permissions: PermissionCode[]) =>
  SetMetadata(PERMISSIONS_ANY_KEY, permissions);
