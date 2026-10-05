"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { LayoutGrid, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
	SheetClose,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { apiFetch, resolveAssetUrl } from "@/lib/api-client";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useAuthStore } from "@/stores/auth-store";
import { ROLE_LABELS, ROLE_NAV, type RoleKey } from "@/config/role-nav";
import { NotificationBell, userInitials } from "./shell-shared";
import { useBranding } from "@/lib/use-branding";

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
	const branding = useBranding();

	const navItems = ROLE_NAV[role].filter((item) => item.placement === "nav");
	const moreItems = ROLE_NAV[role].filter(
		(item) => item.placement === "lainnya",
	);
	// Kelompokkan "Lainnya" per grup menu supaya sheet panjang tetap rapi.
	const moreGroups: { name?: string; items: typeof moreItems }[] = [];
	for (const item of moreItems) {
		const last = moreGroups[moreGroups.length - 1];
		if (last && last.name === item.group) last.items.push(item);
		else moreGroups.push({ name: item.group, items: [item] });
	}

	const [logoutOpen, setLogoutOpen] = useState(false);
	async function handleLogout() {
		await apiFetch("/auth/logout", { method: "POST" }).catch(() => undefined);
		clearSession();
		router.replace("/login");
	}

	function isActive(slug: string) {
		const href = `/${role}${slug ? `/${slug}` : ""}`;
		return pathname === href || (slug !== "" && pathname.startsWith(`${href}/`));
	}

	return (
		<div className="flex min-h-screen flex-col lg:hidden">
			<header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur">
				<Link href={`/${role}`} className="flex min-w-0 items-center gap-2.5">
					<Image
						src={branding.resolvedLogoUrl}
						alt={`Logo ${branding.appName}`}
						width={30}
						height={30}
						className="size-7.5 shrink-0 object-contain"
						priority
						unoptimized
					/>
					<div className="min-w-0">
						<p className="truncate text-sm leading-tight font-semibold">
							{branding.appName}
						</p>
						<p className="truncate text-xs leading-tight text-muted-foreground">
							{ROLE_LABELS[role]}
						</p>
					</div>
				</Link>
				<div className="flex shrink-0 items-center gap-1.5">
					<NotificationBell role={role} />
					<Avatar size="sm">
						{user?.avatarUrl ? (
							<AvatarImage src={resolveAssetUrl(user.avatarUrl)} alt={user.name} />
						) : null}
						<AvatarFallback className="bg-brand-blue-100 text-xs font-semibold text-brand-blue-700">
							{userInitials(user?.name)}
						</AvatarFallback>
					</Avatar>
				</div>
			</header>

			<main className="flex-1 overflow-y-auto p-4 pb-24">{children}</main>

			<nav
				className="fixed inset-x-0 bottom-0 z-40 grid border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
				style={{
					gridTemplateColumns: `repeat(${navItems.length + 1}, minmax(0, 1fr))`,
				}}
			>
				{navItems.map((item) => {
					const href = `/${role}${item.slug ? `/${item.slug}` : ""}`;
					const active = isActive(item.slug);
					return (
						<Link
							key={href}
							href={href}
							aria-current={active ? "page" : undefined}
							className={cn(
								"relative flex min-h-14 flex-col items-center justify-center gap-1 pt-1.5 pb-2 text-[11px] font-medium transition-colors",
								active ? "text-primary" : "text-neutral-500",
							)}
						>
							<span
								className={cn(
									"absolute top-0 h-0.5 w-8 rounded-full bg-primary transition-opacity",
									active ? "opacity-100" : "opacity-0",
								)}
							/>
							<item.icon size={24} />
							<span className="max-w-full truncate px-0.5">{item.label}</span>
						</Link>
					);
				})}

				<Sheet>
					<SheetTrigger className="relative flex min-h-14 flex-col items-center justify-center gap-1 pt-1.5 pb-2 text-[11px] font-medium text-neutral-500 transition-colors">
						<LayoutGrid size={24} />
						Lainnya
					</SheetTrigger>
					<SheetContent
						side="bottom"
						className="max-h-[75svh] overflow-y-auto"
					>
						<SheetHeader>
							<SheetTitle>Menu Lainnya</SheetTitle>
						</SheetHeader>
						<div className="flex flex-col gap-3 px-6 pb-6">
							{moreGroups.map((g, gi) => (
								<div key={g.name ?? gi} className="flex flex-col gap-2">
									{g.name ? (
										<p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
											{g.name}
										</p>
									) : null}
									<div className="grid grid-cols-3 gap-3">
										{g.items.map((item) => {
											const href = `/${role}${item.slug ? `/${item.slug}` : ""}`;
											const active = isActive(item.slug);
											return (
												<SheetClose key={href} render={<Link href={href} />}>
													<div
														className={cn(
															"flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border p-3 text-center text-xs font-medium transition-colors",
															active
																? "border-brand-blue-200 bg-brand-blue-50 text-brand-blue-700"
																: "text-foreground",
														)}
													>
														<item.icon
															size={24}
															className={cn(
																active ? "text-primary" : "text-neutral-500",
															)}
														/>
														{item.label}
													</div>
												</SheetClose>
											);
										})}
									</div>
								</div>
							))}
							<button
								type="button"
								onClick={() => setLogoutOpen(true)}
								className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border p-3 text-center text-xs font-medium text-destructive"
							>
								<LogOut size={24} />
								Logout
							</button>
						</div>
					</SheetContent>
				</Sheet>
			</nav>
			<ConfirmDialog
				open={logoutOpen}
				onOpenChange={setLogoutOpen}
				title="Keluar dari akun?"
				description="Anda perlu login ulang untuk mengakses aplikasi lagi."
				confirmLabel="Ya, Logout"
				onConfirm={() => void handleLogout()}
			/>
		</div>
	);
}
