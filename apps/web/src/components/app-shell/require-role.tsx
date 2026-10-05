"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/auth-store";
import {
	ROLE_BACKEND_NAME,
	ROLE_LABELS,
	type RoleKey,
} from "@/config/role-nav";

/**
 * Guard sisi frontend: tampilkan "akses ditolak" kalau role user tidak cocok.
 * Ini HANYA untuk UX — validasi sesungguhnya tetap di backend
 * (PermissionsGuard di NestJS), sesuai copilot-instructions.md.
 *
 * PENTING (Fase 1 — perbaikan sesi): JANGAN redirect saat bootstrap sesi
 * (`isBootstrapping === true`) sedang berjalan. Redirect harus diefek di
 * `useEffect`, bukan saat render, supaya refresh halaman tidak menendang
 * user ke /login sebelum `POST /api/auth/refresh` selesai.
 */
export function RequireRole({
	role,
	children,
}: {
	role: RoleKey;
	children: ReactNode;
}) {
	const router = useRouter();
	const user = useAuthStore((state) => state.user);
	const isBootstrapping = useAuthStore((state) => state.isBootstrapping);

	useEffect(() => {
		if (!isBootstrapping && !user && typeof window !== "undefined") {
			router.replace("/login");
		}
	}, [isBootstrapping, user, router]);

	if (isBootstrapping) {
		return (
			<div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
				Memuat sesi...
			</div>
		);
	}

	if (!user) {
		return null;
	}

	const hasRole = user.roles.includes(ROLE_BACKEND_NAME[role]);
	if (!hasRole) {
		return (
			<div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
				<h1 className="text-xl font-semibold">Akses ditolak</h1>
				<p className="max-w-sm text-sm text-muted-foreground">
					Akun Anda ({user.name}) tidak memiliki akses ke halaman{" "}
					{ROLE_LABELS[role]}.
				</p>
				<Button render={<Link href="/" />}>Kembali ke dashboard Anda</Button>
			</div>
		);
	}

	return <>{children}</>;
}
