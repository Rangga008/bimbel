"use client";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, resolveAssetUrl } from "@/lib/api-client";

export interface Branding {
	appName: string;
	tagline: string;
	logoUrl: string;
}

const DEFAULT_BRANDING: Branding = {
	appName: "Bimbel GFS",
	tagline: "",
	logoUrl: "",
};

/**
 * Branding aplikasi dari endpoint publik `/public/branding` (diatur di
 * Pengaturan > Identitas Aplikasi). Dipakai sidebar, login, dan landing —
 * fallback ke default bila fetch gagal/loading supaya UI tak pernah kosong.
 */
export function useBranding(): Branding & { resolvedLogoUrl: string } {
	const q = useQuery({
		queryKey: ["public-branding"],
		queryFn: () => apiFetch<Branding>("/public/branding", { auth: false }),
		staleTime: 5 * 60 * 1000,
		retry: 1,
	});
	const b = q.data ?? DEFAULT_BRANDING;
	return {
		...b,
		appName: b.appName || DEFAULT_BRANDING.appName,
		resolvedLogoUrl: resolveAssetUrl(b.logoUrl) || "/logo-gfs.png",
	};
}
