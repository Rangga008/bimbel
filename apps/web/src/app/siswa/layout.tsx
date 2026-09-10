import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell/app-shell";

export default function SiswaLayout({ children }: { children: ReactNode }) {
	return <AppShell role="siswa">{children}</AppShell>;
}
