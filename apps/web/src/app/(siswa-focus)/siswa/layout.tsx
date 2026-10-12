import type { ReactNode } from "react";
import { RequireRole } from "@/components/app-shell/require-role";

/**
 * Layout rute fokus siswa (mengerjakan ujian/latsol, membaca materi).
 * Tidak memakai AppShell — tanpa sidebar, header, maupun bottom nav —
 * di desktop maupun mobile.
 */
export default function SiswaFocusLayout({
	children,
}: {
	children: ReactNode;
}) {
	return (
		<RequireRole role="siswa">
			<div className="min-h-screen bg-background">{children}</div>
		</RequireRole>
	);
}
