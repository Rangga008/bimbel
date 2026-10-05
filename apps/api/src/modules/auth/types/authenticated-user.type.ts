export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
  roles: string[];
  permissions: string[];
}
