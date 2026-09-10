"use client";

import { useEffect, type ReactNode } from "react";
import { tryRefreshSession } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";

/** Coba pulihkan sesi lewat refresh-token cookie sekali saat aplikasi pertama dimuat. */
export function AuthBootstrap({ children }: { children: ReactNode }) {
	const isBootstrapping = useAuthStore((state) => state.isBootstrapping);
	const setBootstrapped = useAuthStore((state) => state.setBootstrapped);

	useEffect(() => {
		tryRefreshSession().finally(() => setBootstrapped());
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	if (isBootstrapping) {
		return (
			<div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
				Memuat sesi...
			</div>
		);
	}

	return <>{children}</>;
}
