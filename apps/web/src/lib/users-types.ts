export interface ManagedUser {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  /** ISO date — null = no HP belum diverifikasi (akun daftar-mandiri). */
  phoneVerifiedAt?: string | null;
  createdAt: string;
  roles: string[];
  permissions: string[];
  /** Profil siswa milik akun (bila role SISWA) — isExternal = daftar sendiri/orang luar. */
  student?: { id: string; isExternal: boolean; schoolOrigin: string | null } | null;
}

export interface RoleItem {
  id: string;
  name: string;
  description: string | null;
}
