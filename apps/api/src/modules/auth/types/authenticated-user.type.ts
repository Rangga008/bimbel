export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
  roles: string[];
  permissions: string[];
  /** true = akun siswa tanpa keanggotaan kelompok (siswa luar/peserta
   *  try out) — frontend menyempitkan menu jadi Ujian + Profil saja. */
  studentGroupless?: boolean;
}
