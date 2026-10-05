export interface ManagedUser {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  createdAt: string;
  roles: string[];
  permissions: string[];
}

export interface RoleItem {
  id: string;
  name: string;
  description: string | null;
}
