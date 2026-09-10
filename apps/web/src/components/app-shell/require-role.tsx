"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/auth-store";
import {
	ROLE_BACKEND_NAME,
	ROLE_LABELS,
	type RoleKey,
} from "@/config/role-nav";

/**
 * Guard sisi frontend: redirect ke /login kalau belum login, atau tampilkan "akses ditolak"
 * kalau role user tidak cocok. Ini HANYA untuk UX — validasi sesungguhnya tetap di backend
 * (PermissionsGuard di NestJS), sesuai copilot-instructions.md.
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

	if (!user) {
		if (typeof window !== "undefined") router.replace("/login");
		return null;
	}

	const hasRole = user.roles.includes(ROLE_BACKEND_NAME[role]);
	if (!hasRole) {
		return (
			<div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
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
