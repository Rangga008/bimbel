"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronDown, ChevronsLeft, ChevronsRight, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { apiFetch, resolveAssetUrl } from "@/lib/api-client";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useAuthStore } from "@/stores/auth-store";
import {
	findNavItem,
	ROLE_LABELS,
	ROLE_NAV,
	type NavItem,
	type RoleKey,
} from "@/config/role-nav";
import { NotificationBell, userInitials } from "./shell-shared";
import { useBranding } from "@/lib/use-branding";

const COLLAPSED_KEY = "gfs-sidebar-collapsed";
const GROUPS_KEY = "gfs-sidebar-groups";

function readOpenGroups(): Record<string, boolean> {
	try {
		return JSON.parse(localStorage.getItem(GROUPS_KEY) ?? "{}");
	} catch {
		return {};
	}
}

/** Kelompokkan item berurutan berdasarkan `item.group` untuk heading sidebar. */
function groupItems(items: NavItem[]): { name?: string; items: NavItem[] }[] {
	const groups: { name?: string; items: NavItem[] }[] = [];
	for (const item of items) {
		const last = groups[groups.length - 1];
		if (last && last.name === item.group) {
			last.items.push(item);
		} else {
			groups.push({ name: item.group, items: [item] });
		}
	}
	return groups;
}

function NavLink({
	role,
	item,
	active,
	collapsed,
}: {
	role: RoleKey;
	item: NavItem;
	active: boolean;
	collapsed: boolean;
}) {
	const href = `/${role}${item.slug ? `/${item.slug}` : ""}`;
	const link = (
		<Link
			href={href}
			aria-label={collapsed ? item.label : undefined}
			aria-current={active ? "page" : undefined}
			className={cn(
				"flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
				collapsed && "justify-center px-0",
				active
					? "bg-primary text-primary-foreground"
					: "text-neutral-500 hover:bg-muted hover:text-foreground",
			)}
		>
			<item.icon size={20} className="shrink-0" />
			{!collapsed && <span className="truncate">{item.label}</span>}
		</Link>
	);

	if (!collapsed) return link;
	return (
		<Tooltip>
			<TooltipTrigger render={<span className="block" />}>{link}</TooltipTrigger>
			<TooltipContent side="right">{item.label}</TooltipContent>
		</Tooltip>
	);
}

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
	const branding = useBranding();
	// Shell baru ter-mount setelah bootstrap sesi selesai (RequireRole render
	// loader saat SSR/awal), jadi lazy-init dari localStorage aman — tidak ada
	// hydration mismatch karena komponen ini tidak ikut render SSR.
	const [collapsed, setCollapsed] = useState(
		() =>
			typeof window !== "undefined" &&
			localStorage.getItem(COLLAPSED_KEY) === "1",
	);

	function toggleCollapsed() {
		setCollapsed((c) => {
			localStorage.setItem(COLLAPSED_KEY, c ? "0" : "1");
			return !c;
		});
	}

	const [logoutOpen, setLogoutOpen] = useState(false);
	// Grup menu collapsible — default: hanya grup berisi halaman aktif yang terbuka
	// (grup "Utama" selalu terbuka). Pilihan user diingat di localStorage.
	const [openOverrides, setOpenOverrides] = useState<Record<string, boolean>>(
		() => (typeof window !== "undefined" ? readOpenGroups() : {}),
	);
	const groups = groupItems(ROLE_NAV[role]);
	const currentSlug = pathname.split("/")[2] ?? "";
	const activeGroupName = groups.find((g) =>
		g.items.some((item) => item.slug === currentSlug),
	)?.name;
	const isGroupOpen = (name?: string) =>
		name === undefined || name === "Utama"
			? true
			: (openOverrides[`${role}:${name}`] ?? name === activeGroupName);
	function toggleGroup(name: string) {
		setOpenOverrides((prev) => {
			const next = { ...prev, [`${role}:${name}`]: !isGroupOpen(name) };
			localStorage.setItem(GROUPS_KEY, JSON.stringify(next));
			return next;
		});
	}

	async function handleLogout() {
		await apiFetch("/auth/logout", { method: "POST" }).catch(() => undefined);
		clearSession();
		router.replace("/login");
	}

	const currentItem = findNavItem(role, currentSlug);

	return (
		<TooltipProvider>
			<div className="hidden min-h-screen lg:flex">
				<aside
					className={cn(
						"sticky top-0 flex h-screen shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-in-out",
						collapsed ? "w-[76px]" : "w-[264px]",
					)}
				>
					<div
						className={cn(
							"flex items-center gap-3 px-4 py-4",
							collapsed && "justify-center px-2",
						)}
					>
						<Image
							src={branding.resolvedLogoUrl}
							alt={`Logo ${branding.appName}`}
							width={36}
							height={36}
							className="size-9 shrink-0 object-contain"
							priority
							unoptimized
						/>
						{!collapsed && (
							<>
								<div className="min-w-0 flex-1">
									<p className="truncate text-sm font-semibold">
										{branding.appName}
									</p>
									<p className="truncate text-xs text-muted-foreground">
										{ROLE_LABELS[role]}
									</p>
								</div>
								<Button
									variant="ghost"
									size="icon-sm"
									onClick={toggleCollapsed}
									aria-label="Sembunyikan sidebar"
								>
									<ChevronsLeft className="size-4" />
								</Button>
							</>
						)}
					</div>
					{collapsed && (
						<Button
							variant="ghost"
							size="icon-sm"
							onClick={toggleCollapsed}
							aria-label="Tampilkan sidebar"
							className="mx-auto mb-2"
						>
							<ChevronsRight className="size-4" />
						</Button>
					)}
					<Separator />
					<nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
						{groups.map((group, gi) => {
							const groupOpen = collapsed || isGroupOpen(group.name);
							return (
								<div key={group.name ?? gi} className="space-y-1">
									{group.name ? (
										collapsed ? (
											<Separator className="mx-2 my-2 w-auto" />
										) : (
											<button
												type="button"
												onClick={() => toggleGroup(group.name!)}
												aria-expanded={groupOpen}
												className="flex w-full items-center justify-between rounded-md px-3 pt-1 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase transition-colors hover:text-foreground"
											>
												{group.name}
												<ChevronDown
													className={cn(
														"size-3.5 transition-transform",
														!groupOpen && "-rotate-90",
													)}
												/>
											</button>
										)
									) : null}
									{groupOpen
										? group.items.map((item) => {
												const href = `/${role}${item.slug ? `/${item.slug}` : ""}`;
												const active =
													pathname === href ||
													(item.slug !== "" && pathname.startsWith(`${href}/`));
												return (
													<NavLink
														key={href}
														role={role}
														item={item}
														active={active}
														collapsed={collapsed}
													/>
												);
											})
										: null}
								</div>
							);
						})}
					</nav>
					<Separator />
					<div
						className={cn(
							"flex items-center gap-2 px-4 py-4",
							collapsed && "flex-col px-2",
						)}
					>
						<Avatar size={collapsed ? "sm" : "default"}>
							{user?.avatarUrl ? (
								<AvatarImage src={resolveAssetUrl(user.avatarUrl)} alt={user.name} />
							) : null}
							<AvatarFallback className="bg-brand-blue-100 text-brand-blue-700 text-xs font-semibold">
								{userInitials(user?.name)}
							</AvatarFallback>
						</Avatar>
						{!collapsed && (
							<div className="min-w-0 flex-1">
								<p className="truncate text-sm font-medium">{user?.name}</p>
								<p className="truncate text-xs text-muted-foreground">
									{user?.email}
								</p>
							</div>
						)}
						<Tooltip>
							<TooltipTrigger
								render={
									<Button
										variant="ghost"
										size="icon"
										onClick={() => setLogoutOpen(true)}
										aria-label="Logout"
									/>
								}
							>
								<LogOut className="size-4.5" />
							</TooltipTrigger>
							<TooltipContent side={collapsed ? "right" : "top"}>
								Logout
							</TooltipContent>
						</Tooltip>
					</div>
				</aside>
				<div className="flex min-w-0 flex-1 flex-col">
					<header className="sticky top-0 z-30 flex items-center gap-3 border-b bg-background/95 px-6 py-3 backdrop-blur">
						<Breadcrumb>
							<BreadcrumbList>
								<BreadcrumbItem>
									<BreadcrumbLink render={<Link href={`/${role}`} />}>
										{ROLE_LABELS[role]}
									</BreadcrumbLink>
								</BreadcrumbItem>
								<BreadcrumbSeparator />
								<BreadcrumbItem>
									<BreadcrumbPage>
										{currentItem?.label ??
											(currentSlug
												? currentSlug
														.split("-")
														.map((w) => w[0]?.toUpperCase() + w.slice(1))
														.join(" ")
												: "Beranda")}
									</BreadcrumbPage>
								</BreadcrumbItem>
							</BreadcrumbList>
						</Breadcrumb>
						<div className="ml-auto flex items-center gap-2">
							<NotificationBell role={role} />
							<div className="hidden text-right xl:block">
								<p className="text-sm leading-tight font-medium">{user?.name}</p>
								<p className="text-xs leading-tight text-muted-foreground">
									{ROLE_LABELS[role]}
								</p>
							</div>
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
					<main className="min-w-0 flex-1 overflow-y-auto p-6">{children}</main>
				</div>
			</div>
			<ConfirmDialog
				open={logoutOpen}
				onOpenChange={setLogoutOpen}
				title="Keluar dari akun?"
				description="Anda perlu login ulang untuk mengakses aplikasi lagi."
				confirmLabel="Ya, Logout"
				onConfirm={() => void handleLogout()}
			/>
		</TooltipProvider>
	);
}
