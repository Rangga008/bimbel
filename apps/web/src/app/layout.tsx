import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { cn } from "@/lib/utils";
import { ThemeProvider } from "@/components/theme-provider";
import { Providers } from "@/components/providers";
import { AuthBootstrap } from "@/components/auth-bootstrap";
import { DynamicFavicon } from "@/components/dynamic-favicon";
import { Toaster } from "@/components/ui/sonner";

// Font brand: Plus Jakarta Sans (variable) di-bundle di repo via
// next/font/local — sengaja BUKAN next/font/google karena fetch Google
// Fonts saat build gagal/timeout di dalam Docker build.
const plusJakartaSans = localFont({
	src: "./fonts/plus-jakarta-sans-var.woff2",
	variable: "--font-plus-jakarta-sans",
	display: "swap",
	weight: "200 800",
});

const DEFAULT_TITLE = "Bimbel GFS — Aplikasi Manajemen Bimbel";
const DEFAULT_DESC =
	"Aplikasi manajemen bimbingan belajar: akademik, keuangan, dan ujian.";

// URL API untuk fetch server-side (di dalam Docker: http://api:3000/api)
// dan URL browser-facing untuk src favicon <link>.
const API_INTERNAL =
	process.env.API_INTERNAL_URL ??
	process.env.NEXT_PUBLIC_API_URL ??
	"http://localhost:3000/api";
const API_PUBLIC =
	process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api";

/**
 * Judul & favicon mengikuti Pengaturan > Identitas Aplikasi.
 * Fetch di-cache 60 detik (ISR) — gagal fetch pun fallback ke default sehingga
 * halaman publik (login/landing) tetap render tanpa error.
 */
export async function generateMetadata(): Promise<Metadata> {
	let appName = "Bimbel GFS";
	let tagline = "";
	let logoUrl = "";
	try {
		const res = await fetch(`${API_INTERNAL}/public/branding`, {
			next: { revalidate: 60 },
			// Batasi 5s — saat `next build` (Railway/Docker) API belum tentu bisa
			// dijangkau; fetch yang menggantung >60s menggagalkan static generation.
			signal: AbortSignal.timeout(5000),
		});
		if (res.ok) {
			const data = (await res.json()) as {
				appName?: string;
				tagline?: string;
				logoUrl?: string;
			};
			appName = data.appName || appName;
			tagline = data.tagline ?? "";
			logoUrl = data.logoUrl ?? "";
		}
	} catch {
		// API belum siap/down — pakai default, jangan gagalkan render.
	}
	// logoUrl berbentuk path relatif API (/api/media/<id>/file) — jadikan URL
	// absolut yang bisa diakses browser untuk <link rel="icon">.
	const iconUrl = logoUrl
		? logoUrl.startsWith("http")
			? logoUrl
			: `${API_PUBLIC.replace(/\/api\/?$/, "")}${logoUrl.startsWith("/api") ? logoUrl : `/api${logoUrl}`}`
		: "/logo-gfs.png";
	return {
		title: appName || DEFAULT_TITLE,
		description: tagline || DEFAULT_DESC,
		manifest: "/manifest.json",
		icons: { icon: [{ url: iconUrl }] },
	};
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html
			lang="id"
			className={cn(
				"h-full",
				"antialiased",
				"font-sans",
				plusJakartaSans.variable,
			)}
			suppressHydrationWarning
		>
			<body className="min-h-full flex flex-col">
				<ThemeProvider>
					<Providers>
						<AuthBootstrap>
							{/* Re-apply favicon di client saat branding berubah realtime
							    (metadata SSR di-cache 60d). */}
							<DynamicFavicon />
							{children}
						</AuthBootstrap>
						<Toaster />
					</Providers>
				</ThemeProvider>
			</body>
		</html>
	);
}
