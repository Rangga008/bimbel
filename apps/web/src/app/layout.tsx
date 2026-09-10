import type { Metadata } from "next";
import { Geist, Geist_Mono, Figtree } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { ThemeProvider } from "@/components/theme-provider";
import { Providers } from "@/components/providers";
import { AuthBootstrap } from "@/components/auth-bootstrap";
import { Toaster } from "@/components/ui/sonner";

const figtree = Figtree({ subsets: ["latin"], variable: "--font-sans" });

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});

export const metadata: Metadata = {
	title: "Bimbel — Aplikasi Manajemen Bimbel",
	description:
		"Aplikasi manajemen bimbingan belajar: akademik, keuangan, dan ujian.",
	manifest: "/manifest.json",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
	return (
		<html
			lang="id"
			className={cn(
				"h-full",
				"antialiased",
				geistSans.variable,
				geistMono.variable,
				"font-sans",
				figtree.variable,
			)}
			suppressHydrationWarning
		>
			<body className="min-h-full flex flex-col">
				<ThemeProvider>
					<Providers>
						<AuthBootstrap>{children}</AuthBootstrap>
						<Toaster />
					</Providers>
				</ThemeProvider>
			</body>
		</html>
	);
}
