import { create } from "zustand";

export interface AuthUser {
	id: string;
	email: string;
	name: string;
	avatarUrl?: string | null;
	roles: string[];
	permissions: string[];
}

interface AuthState {
	accessToken: string | null;
	user: AuthUser | null;
	/** true selama bootstrap awal (cek sesi lewat refresh cookie) berjalan. */
	isBootstrapping: boolean;
	setSession: (accessToken: string, user: AuthUser) => void;
	clearSession: () => void;
	setBootstrapped: () => void;
}

/**
 * Access token & profile disimpan di memory (Zustand), BUKAN localStorage, untuk
 * mengurangi risiko XSS. Refresh token ada di httpOnly cookie (dikelola backend).
 */
export const useAuthStore = create<AuthState>((set) => ({
	accessToken: null,
	user: null,
	isBootstrapping: true,
	setSession: (accessToken, user) => set({ accessToken, user }),
	clearSession: () => set({ accessToken: null, user: null }),
	setBootstrapped: () => set({ isBootstrapping: false }),
}));
