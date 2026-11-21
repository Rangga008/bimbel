import { create } from "zustand";

export interface AuthUser {
	id: string;
	email: string;
	name: string;
	avatarUrl?: string | null;
	roles: string[];
	permissions: string[];
	/** true = siswa tanpa keanggotaan kelompok (peserta luar/try out) —
	 *  menu disempitkan jadi Ujian + Profil. */
	studentGroupless?: boolean;
}

interface Session {
	accessToken: string;
	user: AuthUser;
}

interface AuthState {
	accessToken: string | null;
	user: AuthUser | null;
	/** true selama bootstrap awal (cek sesi lewat refresh cookie) berjalan. */
	isBootstrapping: boolean;
	/** Sesi admin yang disimpan saat "Login sebagai" — untuk kembali. */
	impersonator: Session | null;
	setSession: (accessToken: string, user: AuthUser) => void;
	clearSession: () => void;
	setBootstrapped: () => void;
	/** Simpan sesi aktif lalu ganti ke sesi target (impersonate). */
	impersonate: (accessToken: string, user: AuthUser) => void;
	/** Kembalikan sesi admin yang disimpan impersonate(). */
	stopImpersonating: () => Session | null;
}

const IMPERSONATOR_KEY = "gfs-impersonator";

function readImpersonator(): Session | null {
	if (typeof window === "undefined") return null;
	try {
		const raw = sessionStorage.getItem(IMPERSONATOR_KEY);
		return raw ? (JSON.parse(raw) as Session) : null;
	} catch {
		return null;
	}
}

/**
 * Access token & profile disimpan di memory (Zustand), BUKAN localStorage, untuk
 * mengurangi risiko XSS. Refresh token ada di httpOnly cookie (dikelola backend).
 * Sesi impersonate disimpan di sessionStorage — hilang saat tab ditutup.
 */
export const useAuthStore = create<AuthState>((set, get) => ({
	accessToken: null,
	user: null,
	isBootstrapping: true,
	impersonator: readImpersonator(),
	setSession: (accessToken, user) => set({ accessToken, user }),
	clearSession: () => {
		if (typeof window !== "undefined") {
			sessionStorage.removeItem(IMPERSONATOR_KEY);
		}
		set({ accessToken: null, user: null, impersonator: null });
	},
	setBootstrapped: () => set({ isBootstrapping: false }),
	impersonate: (accessToken, user) => {
		const current = { accessToken: get().accessToken, user: get().user };
		const stash =
			get().impersonator ??
			(current.accessToken && current.user ? (current as Session) : null);
		if (typeof window !== "undefined" && stash) {
			sessionStorage.setItem(IMPERSONATOR_KEY, JSON.stringify(stash));
		}
		set({ accessToken, user, impersonator: stash });
	},
	stopImpersonating: () => {
		const stash = get().impersonator;
		if (typeof window !== "undefined") {
			sessionStorage.removeItem(IMPERSONATOR_KEY);
		}
		if (stash) {
			set({
				accessToken: stash.accessToken,
				user: stash.user,
				impersonator: null,
			});
		}
		return stash;
	},
}));
