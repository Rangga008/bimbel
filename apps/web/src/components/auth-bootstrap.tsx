"use client";

import { useEffect, type ReactNode } from "react";
import { tryRefreshSession } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";

/** Coba pulihkan sesi lewat refresh-token cookie sekali saat aplikasi pertama dimuat.
 *  Halaman publik TIDAK diblokir menunggu refresh — halaman terproteksi sudah
 *  punya gerbang sendiri di RequireRole (yang juga membaca isBootstrapping). */
export function AuthBootstrap({ children }: { children: ReactNode }) {
	const setBootstrapped = useAuthStore((state) => state.setBootstrapped);

	useEffect(() => {
		tryRefreshSession().finally(() => setBootstrapped());
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return <>{children}</>;
}
