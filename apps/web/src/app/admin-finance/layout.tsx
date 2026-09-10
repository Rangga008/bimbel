import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell/app-shell";

export default function AdminFinanceLayout({
	children,
}: {
	children: ReactNode;
}) {
	return <AppShell role="admin-finance">{children}</AppShell>;
}
