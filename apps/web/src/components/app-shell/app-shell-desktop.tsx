"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { Logout01Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { apiFetch } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { ROLE_LABELS, ROLE_NAV, type RoleKey } from "@/config/role-nav";

export function AppShellDesktop({
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

	async function handleLogout() {
		await apiFetch("/auth/logout", { method: "POST" }).catch(() => undefined);
		clearSession();
		router.replace("/login");
	}

	return (
		<div className="hidden min-h-svh lg:grid lg:grid-cols-[260px_1fr]">
			<aside className="flex flex-col border-r bg-sidebar text-sidebar-foreground">
				<div className="px-5 py-5">
					<p className="text-lg font-semibold">Bimbel</p>
					<p className="text-xs text-muted-foreground">{ROLE_LABELS[role]}</p>
				</div>
				<Separator />
				<nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
					{ROLE_NAV[role].map((item) => {
						const href = `/${role}${item.slug ? `/${item.slug}` : ""}`;
						const active = pathname === href;
						return (
							<Link
								key={href}
								href={href}
								className={cn(
									"flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
									active
										? "bg-primary text-primary-foreground"
										: "text-muted-foreground hover:bg-muted hover:text-foreground",
								)}
							>
								<HugeiconsIcon icon={item.icon} size={18} />
								{item.label}
							</Link>
						);
					})}
				</nav>
				<Separator />
				<div className="flex items-center justify-between gap-2 px-4 py-4">
					<div className="min-w-0">
						<p className="truncate text-sm font-medium">{user?.name}</p>
						<p className="truncate text-xs text-muted-foreground">
							{user?.email}
						</p>
					</div>
					<Button
						variant="ghost"
						size="icon"
						onClick={handleLogout}
						aria-label="Logout"
					>
						<HugeiconsIcon icon={Logout01Icon} size={18} />
					</Button>
				</div>
			</aside>
			<main className="min-w-0 overflow-y-auto p-6">{children}</main>
		</div>
	);
}
