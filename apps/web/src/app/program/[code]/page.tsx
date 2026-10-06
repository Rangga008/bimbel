"use client";

import { use } from "react";
import Link from "next/link";
import {
	ArrowLeft,
	ArrowRight,
	BadgePercent,
	BookOpenCheck,
	Clock,
	GraduationCap,
	Package2,
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
import { fmtIDR, programSlug, useLanding, type LandingLevel } from "@/lib/landing";

const PROGRAM_ICONS: Record<string, typeof GraduationCap> = {
	REG: GraduationCap,
	EXT: Sparkles,
	PRV: Users,
};

const PROGRAM_TAGLINE: Record<string, string> = {
	REG: "Kelas reguler multi-mapel per jenjang — belajar rutin bareng teman sekelas dengan kurikulum terstruktur.",
	EXT: "Kelas tambahan fleksibel untuk pendalaman materi di luar jadwal reguler — promo khusus untuk siswa reguler aktif.",
	PRV: "Bimbingan privat intensif — 1 tutor untuk kelompok kecil atau individu, harga per sesi menyesuaikan jumlah siswa.",
};

const UNIT_LABEL: Record<string, string> = {
	YEAR: "/tahun",
	MONTH: "/bulan",
	SESSION: "/sesi",
};

/** Baris harga satu jenjang — menampilkan semua skema bayar yang tersedia. */
function LevelPriceLines({ level }: { level: LandingLevel }) {
	const unit = UNIT_LABEL[level.priceUnit ?? ""] ?? "";
	const tiers = (level.sessionPrices ?? null) as Record<string, number> | null;
	const tierEntries = tiers
		? Object.entries(tiers).sort((a, b) => Number(a[0]) - Number(b[0]))
		: [];

	return (
		<div className="flex flex-col gap-1 text-sm">
			{level.promoPrice ? (
				<p>
					<span className="mr-2 text-muted-foreground line-through">
						{fmtIDR(level.price)}
					</span>
					<span className="font-bold text-brand-blue-700">
						{fmtIDR(level.promoPrice)}
						<span className="text-xs font-normal text-muted-foreground"> {unit}</span>
					</span>
					<Badge className="ml-2 gap-1 border-0 bg-brand-gold-100 text-brand-gold-700">
						<BadgePercent className="size-3" />
						Promo
					</Badge>
				</p>
			) : (
				<p className="font-semibold text-brand-blue-700">
					{fmtIDR(level.price)}
					<span className="text-xs font-normal text-muted-foreground"> {unit}</span>
				</p>
			)}
			{level.fullPayPrice ? (
				<p className="text-muted-foreground">
					Lunas: <span className="font-medium text-foreground">{fmtIDR(level.fullPayPrice)}</span>
				</p>
			) : null}
			{level.installment2x ? (
				<p className="text-muted-foreground">
					2× cicilan: <span className="font-medium text-foreground">{fmtIDR(level.installment2x)}</span>
				</p>
			) : null}
			{level.monthlyAmount ? (
				<p className="text-muted-foreground">
					Bulanan: <span className="font-medium text-foreground">{fmtIDR(level.monthlyAmount)}</span>
					{level.monthlyCount ? ` ×${level.monthlyCount}` : ""}/bulan
				</p>
			) : null}
			{tierEntries.length > 0 ? (
				<p className="text-muted-foreground">
					{tierEntries.map(([n, price]) => `${n} siswa: ${fmtIDR(price)}`).join(" · ")}
				</p>
			) : null}
			{level.sessionDurationMin ? (
				<p className="flex items-center gap-1 text-muted-foreground">
					<Clock className="size-3.5" />
					{level.sessionDurationMin} menit/sesi
				</p>
			) : null}
			{level.registrationFee ? (
				<p className="text-muted-foreground">
					+ biaya daftar{" "}
					<span className="font-medium text-foreground">{fmtIDR(level.registrationFee)}</span>
				</p>
			) : null}
		</div>
	);
}

export default function ProgramDetailPage({
	params,
}: {
	params: Promise<{ code: string }>;
}) {
	const { code } = use(params);
	const landingQ = useLanding();
	const program = landingQ.data?.catalog.find(
		(p) => programSlug(p.code) === code.toLowerCase(),
	);

	const Icon = program ? (PROGRAM_ICONS[program.code] ?? GraduationCap) : GraduationCap;
	const pkgCount = program?.levels.reduce((n, l) => n + l.packages.length, 0) ?? 0;
	const studentTotal =
		program?.levels.reduce(
			(n, l) => n + l.packages.reduce((m, pk) => m + (pk.studentCount ?? 0), 0),
			0,
		) ?? 0;

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
				<div className="relative mx-auto max-w-6xl px-4 py-14 sm:px-6 md:py-18">
					<Link
						href="/program"
						className="mb-4 inline-flex items-center gap-1.5 text-sm text-brand-blue-200 transition-colors hover:text-white"
					>
						<ArrowLeft className="size-4" />
						Semua Program
					</Link>
					{landingQ.isLoading ? (
						<Skeleton className="h-10 w-72 bg-white/20" />
					) : program ? (
						<div className="flex flex-col gap-4">
							<div className="flex items-center gap-4">
								<span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-brand-gold-400 text-brand-blue-900">
									<Icon className="size-7" />
								</span>
								<div>
									<h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
										{program.name}
									</h1>
									<div className="mt-1 flex flex-wrap gap-2 text-xs text-brand-blue-200">
										<span>{program.levels.length} jenjang</span>
										<span>·</span>
										<span>{pkgCount} paket</span>
										{studentTotal > 0 ? (
											<>
												<span>·</span>
												<span>{studentTotal} siswa aktif</span>
											</>
										) : null}
									</div>
								</div>
							</div>
							<p className="max-w-2xl text-brand-blue-100">
								{program.description || PROGRAM_TAGLINE[program.code] || "Program belajar."}
							</p>
							{program.registrationFee ? (
								<p className="text-sm text-brand-gold-300">
									Biaya pendaftaran: {fmtIDR(program.registrationFee)}
								</p>
							) : null}
						</div>
					) : (
						<h1 className="text-2xl font-bold">Program tidak ditemukan</h1>
					)}
				</div>
			</section>

			<section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
				{!landingQ.isLoading && !program ? (
					<Card>
						<CardContent className="py-10 text-center">
							<p className="font-medium">Program tidak ditemukan</p>
							<p className="mt-1 text-sm text-muted-foreground">
								Kode program tidak valid atau program sudah tidak aktif.
							</p>
							<Button
								variant="outline"
								className="mt-4 gap-2"
								render={<Link href="/program" />}
							>
								<ArrowLeft className="size-4" />
								Lihat semua program
							</Button>
						</CardContent>
					</Card>
				) : null}

				{/* Jenjang & harga */}
				{program ? (
					<>
						<div className="mb-8">
							<h2 className="text-xl font-bold tracking-tight sm:text-2xl">
								Jenjang &amp; Harga
							</h2>
							<p className="mt-1 text-sm text-muted-foreground">
								Pilih jenjang yang sesuai dengan kelas anak — harga per
								jenjang beserta opsi pembayarannya.
							</p>
						</div>
						<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
							{program.levels.map((l) => (
								<Card key={l.id} className="flex flex-col transition-shadow hover:shadow-lg">
									<CardHeader>
										<div className="flex items-start justify-between gap-2">
											<CardTitle className="text-base leading-snug">
												{l.name}
											</CardTitle>
											{l.gradeLevel ? (
												<Badge variant="outline" className="shrink-0">
													{l.gradeLevel.name}
												</Badge>
											) : null}
										</div>
										{l.levelSubjects && l.levelSubjects.length > 0 ? (
											<CardDescription>
												{l.levelSubjects
													.map((ls) => ls.subject?.name)
													.filter(Boolean)
													.join(" · ")}
											</CardDescription>
										) : null}
									</CardHeader>
									<CardContent className="mt-auto">
										<LevelPriceLines level={l} />
									</CardContent>
								</Card>
							))}
						</div>

						{/* Paket program */}
						{program.levels.some((l) => l.packages.length > 0) ? (
							<div className="mt-14">
								<div className="mb-6">
									<h2 className="text-xl font-bold tracking-tight sm:text-2xl">
										Paket {program.name}
									</h2>
									<p className="mt-1 text-sm text-muted-foreground">
										Paket belajar per jenjang dalam program ini.
									</p>
								</div>
								<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
									{program.levels.flatMap((l) =>
										l.packages.map((pkg) => (
											<Card key={pkg.id} className="flex flex-col overflow-hidden transition-shadow hover:shadow-lg">
												<div className="h-1.5 bg-gradient-to-r from-brand-blue-600 via-brand-blue-400 to-brand-gold-400" />
												<CardHeader>
													<div className="flex items-start justify-between gap-2">
														<CardTitle className="text-base leading-snug">
															{pkg.name}
														</CardTitle>
														<p className="shrink-0 text-right text-base font-bold tabular-nums text-brand-blue-700">
															{fmtIDR(pkg.price)}
														</p>
													</div>
													<CardDescription>{l.name}</CardDescription>
												</CardHeader>
												<CardContent className="mt-auto flex flex-col gap-3">
													{pkg.description ? (
														<p className="text-sm text-muted-foreground">
															{pkg.description}
														</p>
													) : null}
													<div className="flex flex-wrap gap-2">
														<Badge variant="secondary" className="gap-1.5">
															<BookOpenCheck className="size-3.5" />
															{pkg.totalSessions} sesi
														</Badge>
														{pkg.durationWeeks ? (
															<Badge variant="secondary" className="gap-1.5">
																<Clock className="size-3.5" />
																{pkg.durationWeeks} minggu
															</Badge>
														) : null}
														{pkg.studentCount > 0 ? (
															<Badge variant="secondary" className="gap-1.5">
																<Users className="size-3.5" />
																{pkg.studentCount} siswa
															</Badge>
														) : null}
													</div>
												</CardContent>
											</Card>
										)),
									)}
								</div>
							</div>
						) : null}

						{/* CTA */}
						<div className="mt-12 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-brand-gold-300/50 bg-brand-gold-50 p-5">
							<div className="flex items-start gap-3">
								<Package2 className="mt-0.5 size-5 shrink-0 text-brand-gold-600" />
								<div>
									<p className="font-medium">Siap bergabung ke {program.name}?</p>
									<p className="text-sm text-muted-foreground">
										Daftar online sekarang — invoice pendaftaran terbit otomatis
										dan bisa dibayar transfer.
									</p>
								</div>
							</div>
							<Button
								render={<Link href="/daftar" />}
								className="gap-2 bg-brand-gold-400 font-semibold text-brand-blue-900 hover:bg-brand-gold-300"
							>
								Daftar Sekarang
								<ArrowRight className="size-4" />
							</Button>
						</div>
					</>
				) : null}
			</section>

			<SiteFooter />
		</div>
	);
}
