"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
	ArrowRight,
	BadgeCheck,
	Banknote,
	BookOpenCheck,
	Building2,
	CalendarCheck,
	ChartLine,
	ChevronLeft,
	ChevronRight,
	CircleCheck,
	ClipboardList,
	Clock,
	CreditCard,
	DoorOpen,
	FileCheck2,
	GraduationCap,
	MapPin,
	NotebookPen,
	Package2,
	Presentation,
	Quote,
	ShieldCheck,
	Sparkles,
	TrendingUp,
	Users,
	UserCheck,
	UserPlus,
	Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { resolveAssetUrl } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { useBranding } from "@/lib/use-branding";
import { ROLE_KEY_BY_BACKEND_NAME } from "@/config/role-nav";
import { SiteHeader } from "@/components/public/site-header";
import { SiteFooter } from "@/components/public/site-footer";
import {
	fmtIDR,
	programSlug,
	useLanding,
	type LandingPackage,
} from "@/lib/landing";

interface PackageSlide {
	key: string;
	programName: string;
	levelName: string;
	pkg: LandingPackage;
}

const SLIDE_ICONS = [GraduationCap, BookOpenCheck, NotebookPen, Presentation];

/** Jumlah slide paket populer yang ditampilkan di landing. */
const POPULAR_LIMIT = 9;

const PROGRAM_ICONS: Record<string, typeof GraduationCap> = {
	REG: GraduationCap,
	EXT: Sparkles,
	PRV: Users,
};

const PROGRAM_TAGLINE: Record<string, string> = {
	REG: "Kelas reguler multi-mapel per jenjang — belajar rutin bareng teman sekelas.",
	EXT: "Kelas tambahan fleksibel untuk pendalaman materi di luar jadwal reguler.",
	PRV: "Bimbingan privat intensif — 1 tutor untuk kelompok kecil atau individu.",
};

const BENEFITS = [
	{
		icon: CalendarCheck,
		title: "Belajar Terstruktur",
		description:
			"Jadwal sesi dan kurikulum tersusun rapi per program — siswa tahu apa yang dipelajari setiap pertemuan.",
	},
	{
		icon: ChartLine,
		title: "Progres Terpantau",
		description:
			"Nilai, kehadiran, dan perkembangan tercatat di sistem — orang tua bisa memantau kapan saja.",
	},
	{
		icon: NotebookPen,
		title: "Latihan & Ujian Terkelola",
		description:
			"Bank soal, latsol mandiri, dan ujian daring dengan pembahasan — evaluasi belajar berjalan otomatis.",
	},
	{
		icon: Presentation,
		title: "Bimbingan Tutor",
		description:
			"Tutor mengabsen, menilai, dan memberi pembahasan langsung — siswa tidak belajar sendirian.",
	},
	{
		icon: ShieldCheck,
		title: "Pembayaran Transparan",
		description:
			"Invoice, bukti pembayaran, dan status tagihan jelas — orang tua tenang, administrasi rapi.",
	},
	{
		icon: BadgeCheck,
		title: "Ranking & Motivasi",
		description:
			"Papan peringkat dan poin prestasi membuat siswa termotivasi untuk terus berkembang.",
	},
];

/** Alur pendaftaran online — sesuai flow pendaftaran di sistem ini. */
const REGISTER_STEPS = [
	{
		icon: UserPlus,
		title: "Buat Akun Orang Tua",
		description:
			"Daftar online lewat tombol Daftar — bisa juga datang langsung ke kantor GFS untuk dibantu.",
	},
	{
		icon: ClipboardList,
		title: "Isi Data Anak & Pilih Program",
		description:
			"Masuk sebagai orang tua, isi data anak, lalu pilih program sesuai jenjang kelas: Reguler, Extra, atau Privat.",
	},
	{
		icon: CreditCard,
		title: "Bayar Invoice Pendaftaran",
		description:
			"Invoice otomatis berisi biaya pendaftaran + periode pertama — bayar dan unggah bukti transfer.",
	},
	{
		icon: UserCheck,
		title: "Verifikasi & Mulai Belajar",
		description:
			"Admin memverifikasi pembayaran lalu menempatkan anak ke kelompok belajar. Jadwal, materi, dan nilai langsung bisa dipantau.",
	},
];

const TESTIMONIALS = [
	{
		name: "Octaviani Putri",
		school: "UPI — Jurusan Pend. Kimia",
		quote:
			"Belajar di GFS banyak ilmu dan prestasi juga di sekolah. Menyenangkan gabung di GFS.",
	},
	{
		name: "Fazri Adnand",
		school: "UNPAD — Jurusan Fisika",
		quote:
			"Selama di GFS, saya bangga dan senang karena fasilitas yang mendukung pelajaran jadi mudah diterima. Pokoknya GFS bimbel yang recommended.",
	},
];

/** Slider paket program: scroll-snap, swipe di HP + tombol di PC. */
function PackageSlider({ slides }: { slides: PackageSlide[] }) {
	const trackRef = useRef<HTMLDivElement>(null);
	const [active, setActive] = useState(0);

	const cardStep = () => {
		const el = trackRef.current;
		if (!el) return 300;
		const card = el.querySelector<HTMLElement>("[data-slide]");
		return card ? card.offsetWidth + 16 : 300;
	};

	const scroll = (dir: number) => {
		trackRef.current?.scrollBy({ left: dir * cardStep(), behavior: "smooth" });
	};

	const onScroll = () => {
		const el = trackRef.current;
		if (!el) return;
		setActive(Math.round(el.scrollLeft / cardStep()));
	};

	return (
		<div className="relative">
			<div
				ref={trackRef}
				onScroll={onScroll}
				className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
			>
				{slides.map((s, i) => {
					const Icon = SLIDE_ICONS[i % SLIDE_ICONS.length];
					return (
						<Card
							key={s.key}
							data-slide
							className="group flex w-[82%] shrink-0 snap-start flex-col overflow-hidden transition-shadow hover:shadow-xl sm:w-[46%] lg:w-[31.5%]"
						>
							<div className="relative h-2 bg-gradient-to-r from-brand-blue-600 via-brand-blue-400 to-brand-gold-400" />
							<CardHeader>
								<div className="flex items-start justify-between gap-2">
									<span className="flex size-10 items-center justify-center rounded-lg bg-gradient-to-br from-brand-blue-50 to-brand-blue-100 text-brand-blue-600 transition-colors group-hover:from-brand-blue-600 group-hover:to-brand-blue-700 group-hover:text-white">
										<Icon className="size-5" />
									</span>
									<div className="text-right">
										<p className="text-lg font-bold tabular-nums text-brand-blue-700">
											{fmtIDR(s.pkg.price)}
										</p>
										{s.pkg.studentCount > 0 ? (
											<p className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
												<Users className="size-3" />
												{s.pkg.studentCount} siswa
											</p>
										) : null}
									</div>
								</div>
								<CardTitle className="text-base leading-snug">
									{s.pkg.name}
								</CardTitle>
								<CardDescription>
									{s.programName} · {s.levelName}
								</CardDescription>
							</CardHeader>
							<CardContent className="flex flex-1 flex-col gap-4">
								{s.pkg.description ? (
									<p className="text-sm text-muted-foreground">
										{s.pkg.description}
									</p>
								) : null}
								<div className="mt-auto flex flex-wrap gap-2">
									<Badge variant="secondary" className="gap-1.5">
										<BookOpenCheck className="size-3.5" />
										{s.pkg.totalSessions} sesi
									</Badge>
									{s.pkg.durationWeeks ? (
										<Badge variant="secondary" className="gap-1.5">
											<Clock className="size-3.5" />
											{s.pkg.durationWeeks} minggu
										</Badge>
									) : null}
								</div>
							</CardContent>
						</Card>
					);
				})}
			</div>
			<div className="mt-4 flex items-center justify-between">
				<div className="flex gap-1.5" aria-hidden>
					{slides.map((_, i) => (
						<span
							key={i}
							className={
								i === active
									? "h-1.5 w-6 rounded-full bg-brand-blue-600"
									: "h-1.5 w-1.5 rounded-full bg-neutral-300"
							}
						/>
					))}
				</div>
				<div className="flex gap-2">
					<Button
						variant="outline"
						size="icon"
						onClick={() => scroll(-1)}
						aria-label="Paket sebelumnya"
					>
						<ChevronLeft className="size-4" />
					</Button>
					<Button
						variant="outline"
						size="icon"
						onClick={() => scroll(1)}
						aria-label="Paket berikutnya"
					>
						<ChevronRight className="size-4" />
					</Button>
				</div>
			</div>
		</div>
	);
}

export default function LandingPage() {
	const router = useRouter();
	const user = useAuthStore((state) => state.user);
	const isBootstrapping = useAuthStore((state) => state.isBootstrapping);

	const branding = useBranding();
	const landingQ = useLanding();

	// Pengguna yang sudah login langsung diarahkan ke dashboard rolenya
	// (perilaku lama halaman root dipertahankan).
	useEffect(() => {
		if (isBootstrapping || !user) return;
		const roleKey = ROLE_KEY_BY_BACKEND_NAME[user.roles[0]];
		if (roleKey) router.replace(`/${roleKey}`);
	}, [user, isBootstrapping, router]);

	// Scroll halus untuk link anchor navbar.
	useEffect(() => {
		const html = document.documentElement;
		const prev = html.style.scrollBehavior;
		html.style.scrollBehavior = "smooth";
		return () => {
			html.style.scrollBehavior = prev;
		};
	}, []);

	const stats = landingQ.data?.stats;
	const facilities = landingQ.data?.facilities ?? [];
	const programs = landingQ.data?.catalog ?? [];

	// Hanya paket dengan siswa terbanyak yang tampil di landing — katalog
	// lengkap pindah ke halaman /program dan /program/[code].
	const allSlides: PackageSlide[] = programs.flatMap((p) =>
		p.levels.flatMap((l) =>
			l.packages.map((pkg) => ({
				key: pkg.id,
				programName: p.name,
				levelName: l.name,
				pkg,
			})),
		),
	);
	const popularSlides = [...allSlides]
		.sort((a, b) => (b.pkg.studentCount ?? 0) - (a.pkg.studentCount ?? 0))
		.slice(0, POPULAR_LIMIT);

	const statItems = [
		{ icon: Users, value: stats?.students, label: "Siswa aktif terdaftar" },
		{ icon: Presentation, value: stats?.tutors, label: "Tutor berpengalaman" },
		{ icon: BookOpenCheck, value: stats?.programs, label: "Program aktif" },
		{ icon: Package2, value: stats?.packages, label: "Paket belajar tersedia" },
	];

	return (
		<div className="min-h-screen bg-background">
			<SiteHeader />

			{/* ---- Hero ---- */}
			<section id="beranda" className="relative overflow-hidden bg-brand-blue-900 text-white">
				{/* Dekorasi gradient & pola */}
				<div
					aria-hidden
					className="absolute inset-0"
					style={{ backgroundImage: "linear-gradient(135deg, #032a41 0%, #074c74 45%, #0c5d8d 75%, #0f77b4 100%)" }}
				/>
				<div
					aria-hidden
					className="absolute -top-32 right-0 size-[28rem] rounded-full bg-brand-blue-500/25 blur-3xl"
				/>
				<div
					aria-hidden
					className="absolute -bottom-40 -left-24 size-[24rem] rounded-full bg-brand-gold-400/15 blur-3xl"
				/>
				<div
					aria-hidden
					className="absolute inset-0 opacity-[0.07]"
					style={{
						backgroundImage:
							"linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
						backgroundSize: "56px 56px",
					}}
				/>
				<div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 sm:px-6 md:py-28 lg:grid-cols-2">
					<div className="flex flex-col gap-6">
						<span className="inline-flex w-fit items-center gap-2 rounded-full border border-brand-gold-400/40 bg-brand-gold-400/10 px-3 py-1 text-xs font-medium text-brand-gold-200">
							<Sparkles className="size-3.5" />
							Les murah plus berkualitas — sejak 2011
						</span>
						<h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl lg:text-5xl">
							Belajar Lebih Terarah,{" "}
							<span className="bg-gradient-to-r from-brand-gold-300 via-brand-gold-400 to-brand-gold-500 bg-clip-text text-transparent">
								Prestasi Lebih Nyata
							</span>
						</h1>
						<p className="max-w-xl text-base text-brand-blue-100 sm:text-lg">
							{branding.appName} mendampingi siswa SD hingga persiapan UTBK dengan
							jadwal terstruktur, tutor berpengalaman, evaluasi berkala, dan
							laporan perkembangan yang bisa dipantau orang tua.
						</p>
						<div className="flex flex-wrap gap-3">
							<Button
								size="lg"
								render={<Link href="/daftar" />}
								className="gap-2 bg-brand-gold-400 font-semibold text-brand-blue-900 hover:bg-brand-gold-300"
							>
								Daftar Sekarang
								<ArrowRight className="size-4" />
							</Button>
							<Button
								size="lg"
								variant="outline"
								render={<Link href="/program" />}
								className="border-white/30 bg-white/5 text-white hover:bg-white/15 hover:text-white"
							>
								Lihat Program
							</Button>
						</div>
						{/* Statistik ringkas dalam hero */}
						<div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
							{statItems.map((s) => (
								<div
									key={s.label}
									className="rounded-xl border border-white/10 bg-white/5 p-3 backdrop-blur-sm"
								>
									{landingQ.isLoading ? (
										<Skeleton className="h-7 w-12 bg-white/20" />
									) : (
										<p className="text-xl font-bold tabular-nums text-brand-gold-300">
											{s.value ?? 0}
										</p>
									)}
									<p className="mt-0.5 text-[11px] leading-tight text-brand-blue-200">
										{s.label}
									</p>
								</div>
							))}
						</div>
					</div>
					<Card className="border-white/15 bg-white/10 text-white shadow-2xl backdrop-blur-md">
						<CardHeader>
							<CardTitle className="flex items-center gap-2 text-base text-white">
								<CircleCheck className="size-5 text-brand-gold-300" />
								Portal belajar terpadu
							</CardTitle>
							<CardDescription className="text-brand-blue-200">
								Satu akun untuk semua kebutuhan belajar
							</CardDescription>
						</CardHeader>
						<CardContent className="grid gap-3">
							{[
								{ icon: CalendarCheck, text: "Jadwal sesi & kehadiran real-time" },
								{ icon: FileCheck2, text: "Ujian online dengan pembahasan" },
								{ icon: NotebookPen, text: "Latihan soal mandiri terjadwal" },
								{ icon: Wallet, text: "Invoice & pembayaran transparan" },
								{ icon: ChartLine, text: "Performa & ranking siswa" },
							].map((f) => (
								<div
									key={f.text}
									className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-3"
								>
									<span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-gold-400/15 text-brand-gold-300">
										<f.icon className="size-4.5" />
									</span>
									<p className="text-sm font-medium text-brand-blue-50">{f.text}</p>
								</div>
							))}
						</CardContent>
					</Card>
				</div>
				{/* Pemisah melengkung ke section berikutnya */}
				<div
					aria-hidden
					className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-background to-transparent"
				/>
			</section>

			{/* ---- Tentang ---- */}
			<section id="tentang" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 md:py-20">
				<div className="grid items-center gap-10 lg:grid-cols-2">
					<div>
						<p className="mb-2 text-xs font-semibold tracking-widest text-brand-gold-600 uppercase">
							Tentang Kami
						</p>
						<h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
							Sekilas {branding.appName}
						</h2>
						<p className="mt-4 text-muted-foreground">
							Bimbingan Belajar Great Formula Solution (Bimbel GFS) berdiri
							sejak tahun 2011 dan telah membimbing lebih dari 3.000 siswa
							dengan tutor-tutor berpengalaman di bidangnya, sehingga bisa
							membimbing dan membantu para siswa semakin berprestasi.
						</p>
						<p className="mt-3 text-muted-foreground">
							Ditunjang fasilitas belajar yang memadai — multimedia, AC, dan
							free wifi — siswa nyaman belajar. Dan yang paling penting:
							dengan biaya yang terjangkau.
						</p>
						<div className="mt-6 flex flex-wrap gap-3">
							<Button
								variant="outline"
								render={<Link href="/program" />}
								className="gap-2"
							>
								Jelajahi Program
								<ArrowRight className="size-4" />
							</Button>
						</div>
					</div>
					<div className="grid gap-4 sm:grid-cols-2">
						{[
							{ icon: BadgeCheck, title: "Sejak 2011", text: "Berpengalaman lebih dari satu dekade membimbing siswa." },
							{ icon: Users, title: "3.000+ Siswa", text: "Telah bergabung dan berkembang bersama Bimbel GFS." },
							{ icon: Presentation, title: "Tutor Berpengalaman", text: "Tutor ahli di bidangnya, siap membimbing setiap siswa." },
							{ icon: Banknote, title: "Biaya Terjangkau", text: "Les murah plus berkualitas — investasi belajar yang masuk akal." },
						].map((f) => (
							<Card key={f.title} className="transition-shadow hover:shadow-lg">
								<CardHeader>
									<span className="flex size-10 items-center justify-center rounded-lg bg-gradient-to-br from-brand-blue-50 to-brand-blue-100 text-brand-blue-600">
										<f.icon className="size-5" />
									</span>
									<CardTitle className="text-base">{f.title}</CardTitle>
								</CardHeader>
								<CardContent>
									<p className="text-sm text-muted-foreground">{f.text}</p>
								</CardContent>
							</Card>
						))}
					</div>
				</div>
			</section>

			{/* ---- Kategori Program + Paket Terpopuler ---- */}
			<section id="program" className="scroll-mt-20 border-y bg-gradient-to-b from-brand-blue-50/60 to-background">
				<div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-20">
					<div className="mb-10 flex flex-wrap items-end justify-between gap-4">
						<div className="max-w-2xl">
							<p className="mb-2 text-xs font-semibold tracking-widest text-brand-gold-600 uppercase">
								Katalog Kami
							</p>
							<h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
								Program Belajar
							</h2>
							<p className="mt-2 text-muted-foreground">
								Pilih kategori program — masing-masing punya halaman
								detail dengan jenjang, harga, dan paket lengkapnya.
							</p>
						</div>
						<Button variant="outline" render={<Link href="/program" />} className="gap-2">
							Semua Program
							<ArrowRight className="size-4" />
						</Button>
					</div>

					{/* Kartu kategori program → halaman detail per program */}
					{landingQ.isLoading ? (
						<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
							{[0, 1, 2].map((i) => (
								<Skeleton key={i} className="h-44 w-full" />
							))}
						</div>
					) : (
						<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
							{programs.map((p) => {
								const Icon = PROGRAM_ICONS[p.code] ?? GraduationCap;
								const pkgCount = p.levels.reduce(
									(n, l) => n + l.packages.length,
									0,
								);
								const studentTotal = p.levels.reduce(
									(n, l) =>
										n + l.packages.reduce((m, pk) => m + (pk.studentCount ?? 0), 0),
									0,
								);
								return (
									<Link
										key={p.id}
										href={`/program/${programSlug(p.code)}`}
										className="group"
									>
										<Card className="h-full transition-all hover:-translate-y-0.5 hover:border-brand-blue-300 hover:shadow-xl">
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
											<CardContent className="flex flex-wrap gap-2">
												<Badge variant="secondary">{p.levels.length} jenjang</Badge>
												<Badge variant="secondary">{pkgCount} paket</Badge>
												{studentTotal > 0 ? (
													<Badge variant="secondary" className="gap-1.5">
														<Users className="size-3.5" />
														{studentTotal} siswa
													</Badge>
												) : null}
											</CardContent>
										</Card>
									</Link>
								);
							})}
						</div>
					)}

					{/* Paket terpopuler (berdasar jumlah siswa) */}
					<div className="mt-14">
						<div className="mb-6 flex flex-wrap items-end justify-between gap-4">
							<div>
								<h3 className="text-xl font-bold tracking-tight">
									Paket Terpopuler
								</h3>
								<p className="mt-1 text-sm text-muted-foreground">
									Paket dengan siswa terbanyak saat ini — geser untuk
									melihat.
								</p>
							</div>
						</div>
						{landingQ.isLoading ? (
							<div className="flex gap-4 overflow-hidden">
								{[0, 1, 2].map((i) => (
									<Skeleton
										key={i}
										className="h-56 w-[82%] shrink-0 sm:w-[46%] lg:w-[31.5%]"
									/>
								))}
							</div>
						) : popularSlides.length > 0 ? (
							<PackageSlider slides={popularSlides} />
						) : (
							<Card>
								<CardContent className="flex flex-col items-center gap-2 py-10 text-center">
									<Package2 className="size-10 text-muted-foreground" />
									<p className="font-medium">Belum ada paket program aktif</p>
									<p className="text-sm text-muted-foreground">
										Hubungi admin untuk informasi paket belajar terbaru.
									</p>
								</CardContent>
							</Card>
						)}
					</div>
				</div>
			</section>

			{/* ---- Cara Daftar ---- */}
			<section id="cara-daftar" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 md:py-20">
				<div className="mb-10 max-w-2xl">
					<p className="mb-2 text-xs font-semibold tracking-widest text-brand-gold-600 uppercase">
						Cara Daftar
					</p>
					<h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
						Daftar Les dalam 4 Langkah
					</h2>
					<p className="mt-2 text-muted-foreground">
						Semua bisa dilakukan online dari rumah — atau datang langsung ke
						kantor GFS dan kami bantu prosesnya.
					</p>
				</div>
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					{REGISTER_STEPS.map((s, i) => (
						<div key={s.title} className="relative">
							<Card className="h-full">
								<CardHeader>
									<div className="flex items-center justify-between">
										<span className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-blue-600 to-brand-blue-800 text-white">
											<s.icon className="size-5" />
										</span>
										<span className="text-4xl font-bold text-brand-blue-100">
											{i + 1}
										</span>
									</div>
									<CardTitle className="text-base">{s.title}</CardTitle>
								</CardHeader>
								<CardContent>
									<p className="text-sm text-muted-foreground">{s.description}</p>
								</CardContent>
							</Card>
							{i < REGISTER_STEPS.length - 1 ? (
								<ArrowRight
									aria-hidden
									className="absolute top-1/2 -right-4 hidden size-5 -translate-y-1/2 text-brand-blue-300 lg:block"
								/>
							) : null}
						</div>
					))}
				</div>
				<div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-brand-gold-300/50 bg-brand-gold-50 p-5">
					<div className="flex items-start gap-3">
						<MapPin className="mt-0.5 size-5 shrink-0 text-brand-gold-600" />
						<div>
							<p className="font-medium">Mau datang langsung?</p>
							<p className="text-sm text-muted-foreground">
								Kantor GFS: Jl. Hj. Saodah No. 125, Jatihandap – Cicaheum,
								Bandung — Senin–Sabtu, 09.00–18.00.
							</p>
						</div>
					</div>
					<Button
						render={<Link href="/daftar" />}
						className="gap-2 bg-brand-gold-400 font-semibold text-brand-blue-900 hover:bg-brand-gold-300"
					>
						Daftar Online Sekarang
						<ArrowRight className="size-4" />
					</Button>
				</div>
			</section>

			{/* ---- Testimoni ---- */}
			<section id="testimoni" className="scroll-mt-20 border-y bg-card">
				<div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-20">
					<div className="mb-10 max-w-2xl">
						<p className="mb-2 text-xs font-semibold tracking-widest text-brand-gold-600 uppercase">
							Testimoni
						</p>
						<h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
							Kata Alumni &amp; Siswa GFS
						</h2>
					</div>
					<div className="grid gap-4 sm:grid-cols-2">
						{TESTIMONIALS.map((t) => (
							<Card key={t.name} className="relative overflow-hidden">
								<Quote
									aria-hidden
									className="absolute -top-2 -right-2 size-20 text-brand-blue-50"
								/>
								<CardHeader>
									<CardTitle className="text-base">{t.name}</CardTitle>
									<CardDescription>{t.school}</CardDescription>
								</CardHeader>
								<CardContent>
									<p className="text-sm leading-relaxed text-muted-foreground italic">
										&ldquo;{t.quote}&rdquo;
									</p>
								</CardContent>
							</Card>
						))}
					</div>
				</div>
			</section>

			{/* ---- Fasilitas & Ruangan ---- */}
			<section id="fasilitas" className="scroll-mt-20">
				<div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-20">
					<div className="mb-10 max-w-2xl">
						<p className="mb-2 text-xs font-semibold tracking-widest text-brand-gold-600 uppercase">
							Lingkungan Belajar
						</p>
						<h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
							Fasilitas &amp; Ruangan
						</h2>
						<p className="mt-2 text-muted-foreground">
							Ruang belajar yang nyaman dan terkelola untuk mendukung fokus
							belajar siswa.
						</p>
					</div>
					{landingQ.isLoading ? (
						<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
							{[0, 1, 2].map((i) => (
								<Skeleton key={i} className="h-52 w-full" />
							))}
						</div>
					) : facilities.length > 0 ? (
						<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
							{facilities.map((f) => (
								<Card
									key={f.id}
									className="group overflow-hidden pt-0 transition-shadow hover:shadow-xl"
								>
									<div className="relative h-44 overflow-hidden bg-gradient-to-br from-brand-blue-700 to-brand-blue-900">
										{f.photoUrl ? (
											<Image
												src={resolveAssetUrl(f.photoUrl)}
												alt={`Foto ${f.name}`}
												fill
												className="object-cover transition-transform duration-300 group-hover:scale-105"
												unoptimized
											/>
										) : (
											<div className="flex size-full items-center justify-center">
												<DoorOpen className="size-12 text-white/40" />
											</div>
										)}
										<div
											aria-hidden
											className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent"
										/>
										<div className="absolute bottom-3 left-4 right-4 flex items-end justify-between gap-2">
											<div className="min-w-0">
												<p className="truncate font-semibold text-white">
													{f.name}
												</p>
												{f.buildingName ? (
													<p className="flex items-center gap-1 text-xs text-white/80">
														<Building2 className="size-3" />
														{f.buildingName}
													</p>
												) : null}
											</div>
											{f.capacity ? (
												<Badge className="shrink-0 border-0 bg-white/15 text-white backdrop-blur-sm">
													<Users className="size-3" />
													{f.capacity} kursi
												</Badge>
											) : null}
										</div>
									</div>
								</Card>
							))}
						</div>
					) : (
						<Card>
							<CardContent className="flex flex-col items-center gap-2 py-10 text-center">
								<DoorOpen className="size-10 text-muted-foreground" />
								<p className="font-medium">Informasi fasilitas segera hadir</p>
								<p className="text-sm text-muted-foreground">
									Hubungi admin untuk tur lokasi dan detail ruangan.
								</p>
							</CardContent>
						</Card>
					)}
				</div>
			</section>

			{/* ---- Keunggulan / Kebutuhan ---- */}
			<section id="keunggulan" className="scroll-mt-20 border-y bg-card">
				<div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-20">
					<div className="mb-10 max-w-2xl">
						<p className="mb-2 text-xs font-semibold tracking-widest text-brand-gold-600 uppercase">
							Keunggulan
						</p>
						<h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
							Kenapa Butuh Bimbel yang Terkelola?
						</h2>
						<p className="mt-2 text-muted-foreground">
							{branding.appName} menjawab kebutuhan siswa dan orang tua lewat sistem
							belajar yang rapi, terukur, dan transparan.
						</p>
					</div>
					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{BENEFITS.map((b) => (
							<Card
								key={b.title}
								className="transition-shadow hover:shadow-lg"
							>
								<CardHeader>
									<span className="flex size-10 items-center justify-center rounded-lg bg-gradient-to-br from-brand-gold-100 to-brand-gold-200 text-brand-gold-700">
										<b.icon className="size-5" />
									</span>
									<CardTitle className="text-base">{b.title}</CardTitle>
								</CardHeader>
								<CardContent>
									<p className="text-sm text-muted-foreground">{b.description}</p>
								</CardContent>
							</Card>
						))}
					</div>
				</div>
			</section>

			{/* ---- CTA / Kontak ---- */}
			<section id="kontak" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6">
				<div className="relative overflow-hidden rounded-3xl bg-brand-blue-900 px-6 py-14 text-center sm:px-12">
					<div
						aria-hidden
						className="absolute inset-0 bg-gradient-to-br from-brand-blue-900 via-brand-blue-800 to-brand-blue-600"
					/>
					<div
						aria-hidden
						className="absolute -top-20 -right-20 size-72 rounded-full bg-brand-gold-400/20 blur-3xl"
					/>
					<div
						aria-hidden
						className="absolute -bottom-24 -left-16 size-72 rounded-full bg-brand-blue-500/40 blur-3xl"
					/>
					<div className="relative mx-auto flex max-w-xl flex-col items-center gap-4">
						<h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
							Jadilah siswa GFS berikutnya!
						</h2>
						<p className="text-sm text-brand-blue-100 sm:text-base">
							Sudah lebih dari 3.000 siswa bergabung sejak 2011. Daftar sebagai
							orang tua, lalu hubungkan anak Anda ke program belajar — jadwal,
							ujian, latihan, dan pembayaran dalam satu tempat.
						</p>
						<div className="mt-2 flex flex-wrap justify-center gap-3">
							<Button
								size="lg"
								render={<Link href="/daftar" />}
								className="gap-2 bg-brand-gold-400 font-semibold text-brand-blue-900 hover:bg-brand-gold-300"
							>
								Daftar Sekarang
								<ArrowRight className="size-4" />
							</Button>
							<Button
								size="lg"
								variant="outline"
								render={<Link href="/login" />}
								className="border-white/30 bg-white/5 text-white hover:bg-white/15 hover:text-white"
							>
								Masuk
							</Button>
						</div>
					</div>
				</div>
			</section>

			<SiteFooter />
		</div>
	);
}
