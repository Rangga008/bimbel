"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

/** Toggle mode terang/gelap — next-themes mengelola class `.dark` +
 *  penyimpanan preferensi. `mounted` guard mencegah hydration mismatch
 *  (ikon baru diketahui setelah client membaca tema tersimpan). */
export function ThemeToggle({
	className,
	variant = "outline",
}: {
	className?: string;
	/** "outline" = tombol untuk header gelap (landing), "ghost" = di dalam shell. */
	variant?: "outline" | "ghost";
}) {
	const { theme, setTheme } = useTheme();
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);

	const dark = mounted && theme === "dark";
	const base =
		variant === "outline"
			? "flex size-9 items-center justify-center rounded-lg border border-white/30 bg-white/5 text-brand-blue-100 transition-colors hover:bg-white/15 hover:text-white"
			: "flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

	return (
		<button
			type="button"
			onClick={() => setTheme(dark ? "light" : "dark")}
			aria-label={dark ? "Ganti ke mode terang" : "Ganti ke mode gelap"}
			title={dark ? "Mode terang" : "Mode gelap"}
			className={`${base} ${className ?? ""}`}
		>
			{mounted ? (
				dark ? (
					<Sun className="size-4" />
				) : (
					<Moon className="size-4" />
				)
			) : (
				<Moon className="size-4" />
			)}
		</button>
	);
}
