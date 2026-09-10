"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS, type RoleKey } from "@/config/role-nav";

interface DashboardResponse {
	role: string;
	user: string;
}

/**
 * Halaman beranda tiap role memanggil endpoint dashboard backend yang di-guard permission,
 * supaya Fase 0 punya alur end-to-end nyata (bukan mockup statis) — bukti guard bekerja.
 */
export function RoleHome({
	role,
	apiPath,
	title,
}: {
	role: RoleKey;
	apiPath: string;
	title: string;
}) {
	const { data, isLoading, isError } = useQuery({
		queryKey: ["dashboard", apiPath],
		queryFn: () => apiFetch<DashboardResponse>(apiPath),
	});

	return (
		<div className="flex flex-col gap-4">
			<h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
			<Card>
				<CardHeader>
					<CardTitle>Status Guard Permission (Fase 0)</CardTitle>
				</CardHeader>
				<CardContent className="space-y-2 text-sm">
					{isLoading && <Skeleton className="h-5 w-48" />}
					{isError && (
						<p className="text-destructive">
							Gagal memuat — cek permission akun Anda.
						</p>
					)}
					{data && (
						<p>
							Backend mengonfirmasi role{" "}
							<Badge variant="secondary">{data.role}</Badge> untuk{" "}
							<span className="font-medium">{data.user}</span>. Guard permission
							bekerja end-to-end.
						</p>
					)}
				</CardContent>
			</Card>
			<p className="text-sm text-muted-foreground">
				Modul {ROLE_LABELS[role]} lainnya akan dibangun di fase berikutnya
				sesuai docs/phases/.
			</p>
		</div>
	);
}
