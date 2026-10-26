"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ChevronDown, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
	SheetClose,
} from "@/components/ui/sheet";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useBranding } from "@/lib/use-branding";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import {
	DEFAULT_REGISTRATION_URL,
	programSlug,
	useLanding,
} from "@/lib/landing";

/** Nav utama — sengaja dirampingkan: hanya pintasan penting; anchor detail
 *  (testimoni, fasilitas, cara daftar) tetap bisa diakses lewat footer. */
const NAV_LINKS = [
	{ href: "/#beranda", label: "Beranda" },
	{ href: "/tryout", label: "Try Out" },
	{ href: "/#kontak", label: "Kontak" },
];

/** Navbar publik — dipakai landing + halaman /program. Link anchor memakai
 *  "/#…" supaya tetap bekerja dari halaman manapun. */
export function SiteHeader() {
	const branding = useBranding();
	const landingQ = useLanding();
	const programs = landingQ.data?.catalog ?? [];
	const regUrl =
		landingQ.data?.display?.registrationUrl || DEFAULT_REGISTRATION_URL;

	const programMenu = (
		<DropdownMenu>
			<DropdownMenuTrigger className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-brand-blue-100 transition-colors hover:bg-white/10 hover:text-white">
				Program
				<ChevronDown className="size-3.5" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-56">
				{programs.map((p) => (
					<DropdownMenuItem
						key={p.id}
						render={<Link href={`/program/${programSlug(p.code)}`} />}
					>
						{p.name}
					</DropdownMenuItem>
				))}
				{programs.length > 0 && <DropdownMenuSeparator />}
				<DropdownMenuItem render={<Link href="/program" />}>
					Semua Program
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);

	return (
		<header className="sticky top-0 z-40 border-b border-white/10 bg-brand-blue-900/90 text-white backdrop-blur-md">
			<div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
				<Link href="/" className="flex min-w-0 flex-1 items-center gap-3">
					<Image
						src={branding.resolvedLogoUrl}
						alt={`Logo ${branding.appName}`}
						width={36}
						height={36}
						className="size-9 object-contain"
						priority
						unoptimized
					/>
					<div className="min-w-0">
						<p className="text-sm font-semibold leading-tight">
							{branding.appName}
						</p>
						<p className="truncate text-xs text-brand-blue-200">
							{branding.tagline || "Portal belajar terpadu"}
						</p>
					</div>
				</Link>
				<nav className="hidden items-center gap-1 lg:flex">
					{NAV_LINKS.slice(0, 1).map((l) => (
						<Link
							key={l.href}
							href={l.href}
							className="rounded-lg px-3 py-2 text-sm font-medium text-brand-blue-100 transition-colors hover:bg-white/10 hover:text-white"
						>
							{l.label}
						</Link>
					))}
					{programMenu}
					{NAV_LINKS.slice(1).map((l) => (
						<Link
							key={l.href}
							href={l.href}
							className="rounded-lg px-3 py-2 text-sm font-medium text-brand-blue-100 transition-colors hover:bg-white/10 hover:text-white"
						>
							{l.label}
						</Link>
					))}
				</nav>
				<div className="ml-2 hidden items-center gap-2 lg:flex">
					<ThemeToggle />
					<Button
						variant="outline"
						size="sm"
						render={<a href={regUrl} target="_blank" rel="noopener noreferrer" />}
						className="gap-1.5 border-white/30 bg-white/5 text-white hover:bg-white/15 hover:text-white"
					>
						Info Pendaftaran
					</Button>
					<Button
						variant="ghost"
						size="sm"
						render={<Link href="/login" />}
						className="text-brand-blue-100 hover:bg-white/10 hover:text-white"
					>
						Masuk
					</Button>
					<Button
						render={<Link href="/daftar" />}
						className="gap-2 bg-brand-gold-400 text-brand-blue-900 hover:bg-brand-gold-300"
					>
						Daftar
						<ArrowRight className="size-4" />
					</Button>
				</div>
				<span className="lg:hidden">
					<ThemeToggle />
				</span>
				<Sheet>
					<SheetTrigger
						className="flex size-9 items-center justify-center rounded-lg text-brand-blue-100 transition-colors hover:bg-white/10 lg:hidden"
						aria-label="Buka menu"
					>
						<Menu className="size-5" />
					</SheetTrigger>
					<SheetContent side="right" className="w-72 overflow-y-auto">
						<SheetHeader>
							<SheetTitle>{branding.appName}</SheetTitle>
						</SheetHeader>
						<nav className="flex flex-col gap-1 px-6 pb-6">
							{NAV_LINKS.slice(0, 1).map((l) => (
								<SheetClose key={l.href} render={<Link href={l.href} />}>
									<span className="block rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-muted">
										{l.label}
									</span>
								</SheetClose>
							))}
							<p className="mt-2 px-3 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
								Program
							</p>
							{programs.map((p) => (
								<SheetClose
									key={p.id}
									render={<Link href={`/program/${programSlug(p.code)}`} />}
								>
									<span className="block rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-muted">
										{p.name}
									</span>
								</SheetClose>
							))}
							<SheetClose render={<Link href="/program" />}>
								<span className="block rounded-lg px-3 py-2.5 text-sm font-semibold text-brand-blue-700 hover:bg-muted">
									Semua Program →
								</span>
							</SheetClose>
							{NAV_LINKS.slice(1).map((l) => (
								<SheetClose key={l.href} render={<Link href={l.href} />}>
									<span className="block rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-muted">
										{l.label}
									</span>
								</SheetClose>
							))}
							<div className="mt-4 flex flex-col gap-2">
								<SheetClose
									render={
										<a href={regUrl} target="_blank" rel="noopener noreferrer" />
									}
								>
									<span className="block rounded-lg border px-3 py-2.5 text-center text-sm font-medium">
										Info Pendaftaran (Buku Tamu)
									</span>
								</SheetClose>
								<SheetClose render={<Link href="/daftar" />}>
									<span className="block rounded-lg bg-brand-gold-400 px-3 py-2.5 text-center text-sm font-semibold text-brand-blue-900">
										Daftar Akun Orang Tua
									</span>
								</SheetClose>
								<SheetClose render={<Link href="/login" />}>
									<span className="block rounded-lg border px-3 py-2.5 text-center text-sm font-medium">
										Masuk
									</span>
								</SheetClose>
							</div>
						</nav>
					</SheetContent>
				</Sheet>
			</div>
		</header>
	);
}
