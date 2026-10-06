"use client";

import Link from "next/link";
import {
	ArrowRight,
	BookOpenCheck,
	GraduationCap,
	Sparkles,
	Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SiteHeader } from "@/components/public/site-header";
import { SiteFooter } from "@/components/public/site-footer";
import { fmtIDR, programSlug, useLanding } from "@/lib/landing";

const PROGRAM_ICONS: Record<string, typeof GraduationCap> = {
	REG: GraduationCap,
	EXT: Sparkles,
	PRV: Users,
};

const PROGRAM_TAGLINE: Record<string, string> = {
	REG: "Kelas reguler multi-mapel per jenjang — belajar rutin bareng teman sekelas dengan kurikulum terstruktur.",
	EXT: "Kelas tambahan fleksibel untuk pendalaman materi di luar jadwal reguler — bisa digabung dengan kelas reguler.",
	PRV: "Bimbingan privat intensif — 1 tutor untuk kelompok kecil atau individu, harga per sesi menyesuaikan jumlah siswa.",
};

/** Halaman katalog program — semua kategori program beserta jenjang & harga. */
export default function ProgramCatalogPage() {
	const landingQ = useLanding();
	const programs = landingQ.data?.catalog ?? [];

	return (
		<div className="min-h-screen bg-background">
			<SiteHeader />

			{/* Hero */}
			<section className="relative overflow-hidden bg-brand-blue-900 text-white">
				<div
					aria-hidden
					className="absolute inset-0"
					style={{ backgroundImage: "linear-gradient(135deg, #032a41 0%, #074c74 45%, #0c5d8d 75%, #0f77b4 100%)" }}
				/>
				<div
					aria-hidden
					className="absolute -top-24 right-0 size-[20rem] rounded-full bg-brand-blue-500/25 blur-3xl"
				/>
				<div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-20">
					<p className="mb-2 text-xs font-semibold tracking-widest text-brand-gold-300 uppercase">
						Katalog Program
					</p>
					<h1 className="max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
						Program Belajar Bimbel GFS
					</h1>
					<p className="mt-3 max-w-2xl text-brand-blue-100">
						Les offline tatap muka langsung dengan jadwal menyesuaikan aktivitas
						sekolah — termasuk konsultasi PR, tugas sekolah, perkembangan
						belajar, dan konsultasi sekolah/universitas lanjutan. Pilih kategori
						program untuk melihat jenjang, harga, dan paket lengkapnya.
					</p>
				</div>
			</section>

			{/* Kartu program */}
			<section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
				{landingQ.isLoading ? (
					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{[0, 1, 2].map((i) => (
							<Skeleton key={i} className="h-52 w-full" />
						))}
					</div>
				) : programs.length === 0 ? (
					<Card>
						<CardContent className="py-10 text-center text-sm text-muted-foreground">
							Belum ada program aktif. Hubungi admin untuk info terbaru.
						</CardContent>
					</Card>
				) : (
					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{programs.map((p) => {
							const Icon = PROGRAM_ICONS[p.code] ?? GraduationCap;
							const pkgCount = p.levels.reduce((n, l) => n + l.packages.length, 0);
							const studentTotal = p.levels.reduce(
								(n, l) =>
									n + l.packages.reduce((m, pk) => m + (pk.studentCount ?? 0), 0),
								0,
							);
							const prices = p.levels
								.map((l) => Number(l.promoPrice ?? l.price ?? 0))
								.filter((v) => v > 0);
							const minPrice = prices.length ? Math.min(...prices) : null;
							return (
								<Link
									key={p.id}
									href={`/program/${programSlug(p.code)}`}
									className="group"
								>
									<Card className="flex h-full flex-col transition-all hover:-translate-y-0.5 hover:border-brand-blue-300 hover:shadow-xl">
										<CardHeader>
											<div className="flex items-start justify-between gap-2">
												<span className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-blue-600 to-brand-blue-800 text-white">
													<Icon className="size-5" />
												</span>
												<ArrowRight className="size-5 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-brand-blue-600" />
											</div>
											<CardTitle className="text-lg">{p.name}</CardTitle>
											<CardDescription>
												{p.description || PROGRAM_TAGLINE[p.code] || "Program belajar."}
											</CardDescription>
										</CardHeader>
										<CardContent className="mt-auto flex flex-col gap-3">
											<div className="flex flex-wrap gap-2">
												<Badge variant="secondary">{p.levels.length} jenjang</Badge>
												<Badge variant="secondary">{pkgCount} paket</Badge>
												{studentTotal > 0 ? (
													<Badge variant="secondary" className="gap-1.5">
														<Users className="size-3.5" />
														{studentTotal} siswa
													</Badge>
												) : null}
											</div>
											{minPrice ? (
												<p className="text-sm">
													mulai{" "}
													<span className="font-semibold text-brand-blue-700">
														{fmtIDR(minPrice)}
													</span>
												</p>
											) : null}
										</CardContent>
									</Card>
								</Link>
							);
						})}
					</div>
				)}

				<div className="mt-10 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-brand-gold-300/50 bg-brand-gold-50 p-5">
					<div>
						<p className="font-medium">Bingung pilih program?</p>
						<p className="text-sm text-muted-foreground">
							Daftar dulu — admin kami bantu konsultasi kebutuhan belajar anak Anda.
						</p>
					</div>
					<Button
						render={<Link href="/daftar" />}
						className="gap-2 bg-brand-gold-400 font-semibold text-brand-blue-900 hover:bg-brand-gold-300"
					>
						Daftar Sekarang
						<ArrowRight className="size-4" />
					</Button>
				</div>
			</section>

			<SiteFooter />
		</div>
	);
}
