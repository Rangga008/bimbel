"use client";

import Link from "next/link";
import Image from "next/image";
import { Clock, MapPin } from "lucide-react";
import { useBranding } from "@/lib/use-branding";
import { programSlug, useLanding } from "@/lib/landing";

const FOOTER_LINKS = [
	{ href: "/#beranda", label: "Beranda" },
	{ href: "/#tentang", label: "Tentang" },
	{ href: "/#cara-daftar", label: "Cara Daftar" },
	{ href: "/#testimoni", label: "Testimoni" },
	{ href: "/#fasilitas", label: "Fasilitas" },
	{ href: "/#kontak", label: "Kontak" },
];

/** Footer publik — navigasi, program, lokasi & jam operasional. */
export function SiteFooter() {
	const branding = useBranding();
	const landingQ = useLanding();
	const programs = landingQ.data?.catalog ?? [];
	const locations = landingQ.data?.locations ?? [];

	return (
		<footer className="border-t text-white" style={{ backgroundColor: "#032a41" }}>
			<div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-4">
				<div className="flex flex-col gap-3">
					<div className="flex items-center gap-3">
						<Image
							src={branding.resolvedLogoUrl}
							alt={`Logo ${branding.appName}`}
							width={32}
							height={32}
							className="size-8 object-contain"
							unoptimized
						/>
						<div>
							<p className="text-sm font-semibold">{branding.appName}</p>
							<p className="text-xs text-brand-blue-200">
								{branding.tagline || "Portal belajar terpadu"}
							</p>
						</div>
					</div>
					<p className="text-xs leading-relaxed text-brand-blue-200">
						Bimbingan belajar terstruktur dengan pemantauan perkembangan
						siswa secara real-time untuk siswa dan orang tua.
					</p>
				</div>
				<div>
					<p className="mb-3 text-xs font-semibold tracking-widest text-brand-gold-300 uppercase">
						Navigasi
					</p>
					<nav className="flex flex-col gap-2 text-sm text-brand-blue-100">
						{FOOTER_LINKS.map((l) => (
							<Link
								key={l.href}
								href={l.href}
								className="w-fit transition-colors hover:text-white"
							>
								{l.label}
							</Link>
						))}
						<Link href="/daftar" className="w-fit transition-colors hover:text-white">
							Daftar
						</Link>
						<Link href="/login" className="w-fit transition-colors hover:text-white">
							Masuk
						</Link>
					</nav>
				</div>
				<div>
					<p className="mb-3 text-xs font-semibold tracking-widest text-brand-gold-300 uppercase">
						Program
					</p>
					<nav className="flex flex-col gap-2 text-sm text-brand-blue-100">
						{programs.map((p) => (
							<Link
								key={p.id}
								href={`/program/${programSlug(p.code)}`}
								className="w-fit transition-colors hover:text-white"
							>
								{p.name}
							</Link>
						))}
						<Link href="/program" className="w-fit font-medium transition-colors hover:text-white">
							Semua Program →
						</Link>
					</nav>
				</div>
				<div>
					<p className="mb-3 text-xs font-semibold tracking-widest text-brand-gold-300 uppercase">
						Lokasi &amp; Jam Buka
					</p>
					{locations.length > 0 ? (
						<ul className="flex flex-col gap-3 text-sm text-brand-blue-100">
							{locations.map((loc) => (
								<li key={loc.name} className="flex items-start gap-2">
									<MapPin className="mt-0.5 size-4 shrink-0 text-brand-gold-300" />
									<span>
										<span className="font-medium text-white">{loc.name}</span>
										{loc.address ? (
											<span className="block text-xs text-brand-blue-200">
												{loc.address}
											</span>
										) : null}
									</span>
								</li>
							))}
						</ul>
					) : (
						<p className="text-sm text-brand-blue-200">
							Hubungi admin untuk informasi lokasi.
						</p>
					)}
					<p className="mt-3 flex items-start gap-2 text-sm text-brand-blue-100">
						<Clock className="mt-0.5 size-4 shrink-0 text-brand-gold-300" />
						<span>
							Senin – Sabtu
							<span className="block text-xs text-brand-blue-200">
								09.00 – 18.00 WIB
							</span>
						</span>
					</p>
				</div>
			</div>
			<div className="border-t border-white/10">
				<p className="mx-auto max-w-6xl px-4 py-5 text-center text-xs text-brand-blue-300 sm:px-6">
					© {new Date().getFullYear()} {branding.appName}. Semua hak
					dilindungi.
				</p>
			</div>
		</footer>
	);
}
