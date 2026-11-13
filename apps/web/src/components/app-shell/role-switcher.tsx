"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuthStore } from "@/stores/auth-store";
import {
	ROLE_KEY_BY_BACKEND_NAME,
	ROLE_LABELS,
	type RoleKey,
} from "@/config/role-nav";
import { cn } from "@/lib/utils";

/** Pemilih "Tampil sebagai" untuk akun multi-role (mis. Admin Finance + Tutor
 *  atau Orang Tua + Tutor). Menampilkan fallback statis bila user hanya punya
 *  satu role. */
export function RoleSwitcher({
	role,
	fallback,
	className,
}: {
	role: RoleKey;
	/** Tampilan saat akun hanya punya satu role (label statis biasa). */
	fallback: ReactNode;
	className?: string;
}) {
	const user = useAuthStore((s) => s.user);
	const owned = (user?.roles ?? [])
		.map((r) => ROLE_KEY_BY_BACKEND_NAME[r])
		.filter((k): k is RoleKey => Boolean(k));

	if (owned.length <= 1) return <>{fallback}</>;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				className={cn(
					"flex w-full items-center justify-between gap-1.5 rounded-md border border-border/60 bg-muted/40 px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
					className,
				)}
			>
				<span className="truncate">{ROLE_LABELS[role]}</span>
				<ChevronsUpDown className="size-3 shrink-0" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-52">
				<DropdownMenuLabel className="text-xs text-muted-foreground">
					Tampil sebagai
				</DropdownMenuLabel>
				{owned.map((k) => (
					<DropdownMenuItem key={k} render={<Link href={`/${k}`} />}>
						<Check
							className={cn(
								"size-4",
								k === role ? "opacity-100" : "opacity-0",
							)}
						/>
						{ROLE_LABELS[k]}
						{k === role ? (
							<span className="ml-auto text-[10px] text-muted-foreground">
								aktif
							</span>
						) : null}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
