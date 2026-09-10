import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell/app-shell";

export default function OrangTuaLayout({ children }: { children: ReactNode }) {
	return <AppShell role="orang-tua">{children}</AppShell>;
}
