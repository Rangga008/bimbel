"use client";

import { useEffect } from "react";
import { useBranding } from "@/lib/use-branding";

/**
 * Mengganti favicon sesuai logo branding saat data termuat/berubah.
 * PENTING: jangan remove() link icon bawaan — tag <head> dikelola React
 * (metadata), dan menghapusnya memicu crash "removeChild of null" saat
 * navigasi. Cukup mutasi href in-place; buat node baru hanya bila belum ada.
 */
export function DynamicFavicon() {
	const { resolvedLogoUrl } = useBranding();
	useEffect(() => {
		if (!resolvedLogoUrl) return;
		const links = document.querySelectorAll<HTMLLinkElement>(
			'link[rel="icon"], link[rel="shortcut icon"]',
		);
		if (links.length === 0) {
			const link = document.createElement("link");
			link.rel = "icon";
			link.dataset.dynamic = "true";
			link.href = resolvedLogoUrl;
			document.head.appendChild(link);
			return;
		}
		links.forEach((l) => {
			if (l.getAttribute("href") !== resolvedLogoUrl) {
				l.href = resolvedLogoUrl;
			}
		});
	}, [resolvedLogoUrl]);
	return null;
}
