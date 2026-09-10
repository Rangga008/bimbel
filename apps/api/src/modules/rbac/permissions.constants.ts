/**
 * Daftar kode permission & nama role Fase 0. Sumber tunggal dipakai oleh seed script
 * dan guard supaya tidak ada string permission yang hardcode berbeda-beda di tempat lain.
 */
export const ROLE_NAMES = {
  SISWA: 'SISWA',
  ORANG_TUA: 'ORANG_TUA',
  TUTOR: 'TUTOR',
  ADMIN_FINANCE: 'ADMIN_FINANCE',
  ADMIN_ACADEMIC: 'ADMIN_ACADEMIC',
  OWNER: 'OWNER',
} as const;

export type RoleName = (typeof ROLE_NAMES)[keyof typeof ROLE_NAMES];

export const PERMISSION_CODES = {
  DASHBOARD_SISWA_VIEW: 'dashboard.siswa.view',
  DASHBOARD_ORANG_TUA_VIEW: 'dashboard.orang_tua.view',
  DASHBOARD_TUTOR_VIEW: 'dashboard.tutor.view',
  DASHBOARD_ADMIN_FINANCE_VIEW: 'dashboard.admin_finance.view',
  DASHBOARD_ADMIN_ACADEMIC_VIEW: 'dashboard.admin_academic.view',
  DASHBOARD_OWNER_VIEW: 'dashboard.owner.view',
  RBAC_MANAGE_ROLES: 'rbac.manage_roles',
} as const;

export type PermissionCode =
  (typeof PERMISSION_CODES)[keyof typeof PERMISSION_CODES];
