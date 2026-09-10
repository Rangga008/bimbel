"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { Menu01Icon, Logout01Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
	SheetClose,
} from "@/components/ui/sheet";
import { apiFetch } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { ROLE_LABELS, ROLE_NAV, type RoleKey } from "@/config/role-nav";

export function AppShellMobile({
	role,
	children,
}: {
	role: RoleKey;
	children: React.ReactNode;
}) {
	const pathname = usePathname();
	const router = useRouter();
	const user = useAuthStore((state) => state.user);
	const clearSession = useAuthStore((state) => state.clearSession);

	const navItems = ROLE_NAV[role].filter((item) => item.placement === "nav");
	const moreItems = ROLE_NAV[role].filter(
		(item) => item.placement === "lainnya",
	);

	async function handleLogout() {
		await apiFetch("/auth/logout", { method: "POST" }).catch(() => undefined);
		clearSession();
		router.replace("/login");
	}

	return (
		<div className="flex min-h-svh flex-col lg:hidden">
			<header className="flex items-center justify-between border-b px-4 py-3">
				<div>
					<p className="text-base font-semibold">Bimbel</p>
					<p className="text-xs text-muted-foreground">{ROLE_LABELS[role]}</p>
				</div>
				<p className="max-w-[45%] truncate text-xs text-muted-foreground">
					{user?.name}
				</p>
			</header>

			<main className="flex-1 overflow-y-auto p-4 pb-20">{children}</main>

			<nav
				className="fixed inset-x-0 bottom-0 z-40 grid border-t bg-background"
				style={{
					gridTemplateColumns: `repeat(${navItems.length + 1}, minmax(0, 1fr))`,
				}}
			>
				{navItems.map((item) => {
					const href = `/${role}${item.slug ? `/${item.slug}` : ""}`;
					const active = pathname === href;
					return (
						<Link
							key={href}
							href={href}
							className={cn(
								"flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium",
								active ? "text-primary" : "text-muted-foreground",
							)}
						>
							<HugeiconsIcon icon={item.icon} size={20} />
							{item.label}
						</Link>
					);
				})}

				<Sheet>
					<SheetTrigger className="flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-muted-foreground">
						<HugeiconsIcon icon={Menu01Icon} size={20} />
						Lainnya
					</SheetTrigger>
					<SheetContent side="bottom" className="max-h-[75svh] overflow-y-auto">
						<SheetHeader>
							<SheetTitle>Menu Lainnya</SheetTitle>
						</SheetHeader>
						<div className="grid grid-cols-3 gap-3 px-6 pb-6">
							{moreItems.map((item) => {
								const href = `/${role}${item.slug ? `/${item.slug}` : ""}`;
								return (
									<SheetClose key={href} render={<Link href={href} />}>
										<div className="flex flex-col items-center gap-2 rounded-lg border p-3 text-center text-xs font-medium">
											<HugeiconsIcon icon={item.icon} size={20} />
											{item.label}
										</div>
									</SheetClose>
								);
							})}
							<button
								type="button"
								onClick={handleLogout}
								className="flex flex-col items-center gap-2 rounded-lg border p-3 text-center text-xs font-medium text-destructive"
							>
								<HugeiconsIcon icon={Logout01Icon} size={20} />
								Logout
							</button>
						</div>
					</SheetContent>
				</Sheet>
			</nav>
		</div>
	);
}
