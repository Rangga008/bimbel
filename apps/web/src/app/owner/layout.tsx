import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell/app-shell";

export default function OwnerLayout({ children }: { children: ReactNode }) {
	return <AppShell role="owner">{children}</AppShell>;
}
