"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { StudentItem } from "@/lib/phase1a-types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ParentPerformance } from "./parent-performance";

/**
 * Halaman "Performa Anak" (Orang Tua): pilih anak (bisa >1) lalu tampilkan
 * analisis performanya lewat ParentPerformance.
 */
export function ParentPerformancePage() {
	const childrenQ = useQuery({
		queryKey: ["me-children"],
		queryFn: () => apiFetch<StudentItem[]>("/me/children"),
	});
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const selected = selectedId ?? childrenQ.data?.[0]?.id ?? null;

	if (childrenQ.isLoading) {
		return <Skeleton className="h-32 w-full" />;
	}

	if (childrenQ.isError) {
		return (
			<Card>
				<CardContent className="py-10 text-center text-sm text-destructive">
					Gagal memuat data anak.
				</CardContent>
			</Card>
		);
	}

	const children = childrenQ.data ?? [];
	if (children.length === 0) {
		return (
			<Card>
				<CardContent className="py-10 text-center text-sm text-muted-foreground">
					Belum ada anak terhubung ke akun ini. Hubungi admin untuk pendaftaran.
				</CardContent>
			</Card>
		);
	}

	return (
		<div className="flex flex-col gap-6">
			{children.length > 1 ? (
				<div className="flex flex-wrap gap-2">
					{children.map((child) => (
						<Button
							key={child.id}
							variant={selected === child.id ? "default" : "outline"}
							size="sm"
							onClick={() => setSelectedId(child.id)}
						>
							{child.user.name}
						</Button>
					))}
				</div>
			) : null}
			{selected ? <ParentPerformance studentId={selected} /> : null}
		</div>
	);
}
