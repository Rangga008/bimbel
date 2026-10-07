"use client";

import Link from "next/link";
import Image from "next/image";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft } from "lucide-react";
import { useBranding } from "@/lib/use-branding";

export interface AuthHighlight {
	icon: LucideIcon;
	text: string;
}

/**
 * Shell halaman autentikasi (masuk/daftar/lupa/reset sandi).
 * Background gradien brand menutupi SELURUH viewport (fixed layer) sehingga
 * tidak pernah ada ruang kosong — baik konten pendek maupun form panjang.
 */
export function AuthShell({
	children,
	highlights,
	footerLink,
	footerText,
}: {
	children: React.ReactNode;
	/** Chip fitur kecil di bawah kartu (desktop & mobile). */
	highlights?: AuthHighlight[];
	footerLink?: { href: string; label: string };
	footerText?: string;
}) {
	const branding = useBranding();
	return (
		<div className="relative flex min-h-dvh flex-col items-center justify-center px-4 py-10 sm:px-6">
			{/* Background fixed: selalu menutupi viewport termasuk saat scroll */}
			<div
				aria-hidden
				className="fixed inset-0 -z-10"
				style={{
					backgroundImage:
						"linear-gradient(155deg, #021c2b 0%, #063a5c 35%, #0a5583 65%, #1283c4 100%)",
				}}
			/>
			<div
				aria-hidden
				className="fixed inset-0 -z-10 opacity-[0.07]"
				style={{
					backgroundImage:
						"linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
					backgroundSize: "52px 52px",
					maskImage:
						"radial-gradient(ellipse 85% 70% at 50% 35%, black, transparent)",
					WebkitMaskImage:
						"radial-gradient(ellipse 85% 70% at 50% 35%, black, transparent)",
				}}
			/>
			<div
				aria-hidden
				className="fixed -top-32 -right-24 -z-10 size-[26rem] rounded-full bg-brand-blue-400/25 blur-3xl"
			/>
			<div
				aria-hidden
				className="fixed -bottom-40 -left-24 -z-10 size-[26rem] rounded-full bg-brand-gold-400/15 blur-3xl"
			/>

			<div className="relative flex w-full max-w-md flex-col items-center gap-6">
				{/* Logo + nama */}
				<Link
					href="/"
					className="flex flex-col items-center gap-3 text-center"
				>
					<Image
						src={branding.resolvedLogoUrl}
						alt={`Logo ${branding.appName}`}
						width={56}
						height={56}
						className="size-14 rounded-2xl bg-white/95 p-1.5 object-contain shadow-lg shadow-black/20"
						priority
						unoptimized
					/>
					<div>
						<p className="text-lg font-semibold text-white">
							{branding.appName}
						</p>
						{branding.tagline ? (
							<p className="text-xs text-brand-blue-200">
								{branding.tagline}
							</p>
						) : null}
					</div>
				</Link>

				{children}

				{/* Chip highlight — bawah kartu, wrap rapi di semua ukuran */}
				{highlights?.length ? (
					<ul className="grid w-full grid-cols-2 gap-2">
						{highlights.map((h) => (
							<li
								key={h.text}
								className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 backdrop-blur-sm"
							>
								<span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-gold-400/15 text-brand-gold-300">
									<h.icon className="size-3.5" />
								</span>
								<span className="text-[11px] leading-snug text-brand-blue-50">
									{h.text}
								</span>
							</li>
						))}
					</ul>
				) : null}

				<div className="flex flex-col items-center gap-3 text-center">
					{footerLink ? (
						<Link
							href={footerLink.href}
							className="inline-flex items-center gap-1.5 text-sm text-brand-blue-200 transition-colors hover:text-white"
						>
							<ArrowLeft className="size-4" />
							{footerLink.label}
						</Link>
					) : null}
					<p className="text-[11px] text-brand-blue-300/70">
						{footerText ??
							`© ${new Date().getFullYear()} ${branding.appName}`}
					</p>
				</div>
			</div>
		</div>
	);
}
