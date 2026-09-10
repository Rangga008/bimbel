import { SetMetadata } from '@nestjs/common';
import { PermissionCode } from './permissions.constants';

export const PERMISSIONS_KEY = 'permissions';

/** Tandai endpoint dengan permission granular yang wajib dimiliki user (dicek di PermissionsGuard). */
export const RequirePermissions = (...permissions: PermissionCode[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
