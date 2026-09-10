import type { ReactNode } from "react";
import { RequireRole } from "./require-role";
import { AppShellDesktop } from "./app-shell-desktop";
import { AppShellMobile } from "./app-shell-mobile";
import type { RoleKey } from "@/config/role-nav";

/**
 * Kedua shell dirender sekaligus; Tailwind breakpoint (`lg:` = 1024px) yang menentukan
 * mana yang tampil — BUKAN device-detection/user-agent (lihat ui-mobile-desktop.instructions.md).
 */
export function AppShell({
	role,
	children,
}: {
	role: RoleKey;
	children: ReactNode;
}) {
	return (
		<RequireRole role={role}>
			<AppShellDesktop role={role}>{children}</AppShellDesktop>
			<AppShellMobile role={role}>{children}</AppShellMobile>
		</RequireRole>
	);
}
