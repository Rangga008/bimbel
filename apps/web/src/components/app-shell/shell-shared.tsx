"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";
import { findNavItem, type RoleKey } from "@/config/role-nav";

/** Polling unread count — sama dengan interval inbox (Fase 5b). */
const POLL_MS = 15_000;

export function userInitials(name?: string): string {
	if (!name) return "?";
	return name
		.split(" ")
		.filter(Boolean)
		.slice(0, 2)
		.map((w) => w[0])
		.join("")
		.toUpperCase();
}

/**
 * Lonceng notifikasi + badge counter unread (polling `/notifications/unread-count`).
 * Link ke halaman "pengumuman" (siswa/orang tua) atau "notifikasi"
 * (tutor/admin/owner); "profil" hanya fallback terakhir.
 */
export function NotificationBell({
	role,
	className,
}: {
	role: RoleKey;
	className?: string;
}) {
	const countQ = useQuery({
		queryKey: ["notifications-count"],
		queryFn: () =>
			apiFetch<{ count: number }>("/notifications/unread-count"),
		refetchInterval: POLL_MS,
	});
	const href = findNavItem(role, "pengumuman")
		? `/${role}/pengumuman`
		: findNavItem(role, "notifikasi")
			? `/${role}/notifikasi`
			: `/${role}/profil`;
	const count = countQ.data?.count ?? 0;

	return (
		<Button
			variant="ghost"
			size="icon"
			render={<Link href={href} />}
			aria-label={`Notifikasi${count > 0 ? `, ${count} belum dibaca` : ""}`}
			className={cn("relative", className)}
		>
			<Bell className="size-5" />
			{count > 0 ? (
				<span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground tabular-nums">
					{count > 99 ? "99+" : count}
				</span>
			) : null}
		</Button>
	);
}
