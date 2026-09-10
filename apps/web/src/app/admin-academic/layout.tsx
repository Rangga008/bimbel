import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell/app-shell";

export default function AdminAcademicLayout({
	children,
}: {
	children: ReactNode;
}) {
	return <AppShell role="admin-academic">{children}</AppShell>;
}
