"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
	ArrowRight,
	Clock,
	Copy,
	FileCheck2,
	GraduationCap,
	KeyRound,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SiteHeader } from "@/components/public/site-header";
import { SiteFooter } from "@/components/public/site-footer";
import { useTryouts, type PublicTryout } from "@/lib/landing";
import { useAuthStore } from "@/stores/auth-store";

const fmtDate = (iso: string) =>
	new Intl.DateTimeFormat("id-ID", {
		day: "numeric",
		month: "short",
		year: "numeric",
	}).format(new Date(iso));

/** Sisa waktu ke tanggal target — format "X hari Y jam Z menit". */
function remainingParts(targetIso: string) {
	const diff = Math.max(0, new Date(targetIso).getTime() - Date.now());
	const days = Math.floor(diff / 86_400_000);
	const hours = Math.floor((diff % 86_400_000) / 3_600_000);
	const mins = Math.floor((diff % 3_600_000) / 60_000);
	return { days, hours, mins };
}

function Countdown({ target, label }: { target: string; label: string }) {
	const [, setTick] = useState(0);
	// Interval ringan — rerender tiap 30 detik cukup untuk tampilan hari/jam/menit.
	useEffect(() => {
		const t = setInterval(() => setTick((n) => n + 1), 30_000);
		return () => clearInterval(t);
	}, []);
	const { days, hours, mins } = remainingParts(target);
	return (
		<div className="grid gap-1">
			<p className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
				{label}
			</p>
			<div className="flex gap-2">
				{[
					{ v: days, l: "hari" },
					{ v: hours, l: "jam" },
					{ v: mins, l: "menit" },
				].map((u) => (
					<div
						key={u.l}
						className="flex min-w-14 flex-col items-center rounded-lg bg-brand-blue-900 px-2.5 py-1.5 text-white"
					>
						<span className="text-lg font-bold tabular-nums">
							{String(u.v).padStart(2, "0")}
						</span>
						<span className="text-[10px] text-brand-blue-200">{u.l}</span>
					</div>
				))}
			</div>
		</div>
	);
}

function TryoutCard({ exam, ctaHref }: { exam: PublicTryout; ctaHref: string }) {
	const now = Date.now();
	const start = new Date(exam.scheduledStartAt).getTime();
	const end = new Date(exam.scheduledEndAt).getTime();
	const live = now >= start && now <= end;

	return (
		<Card className="overflow-hidden">
			<div className="grid sm:grid-cols-[180px_1fr]">
				{/* Panel kiri — aksen kategori */}
				<div className="hidden flex-col items-center justify-center gap-2 bg-brand-blue-50 p-6 text-center sm:flex dark:bg-brand-blue-900/20">
					<GraduationCap className="size-9 text-brand-blue-500" />
					<p className="text-xs font-bold tracking-widest text-brand-blue-700 uppercase dark:text-brand-blue-300">
						{exam.category}
					</p>
				</div>
				<div>
					<CardHeader className="pb-2">
						<div className="flex flex-wrap items-center gap-2">
							<span
								className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
									live
										? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
										: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
								}`}
							>
								<span
									className={`size-1.5 rounded-full ${live ? "bg-emerald-500" : "bg-amber-500"}`}
								/>
								{live ? "Berlangsung" : "Akan Datang"}
							</span>
							<span className="rounded-full border px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
								{exam.category}
							</span>
						</div>
						<CardTitle className="text-lg">{exam.title}</CardTitle>
						{exam.description ? (
							<p className="text-sm text-muted-foreground">
								{exam.description}
							</p>
						) : null}
					</CardHeader>
					<CardContent className="grid gap-4">
						{exam.subtes.length > 0 ? (
							<div className="flex flex-wrap gap-1.5">
								{exam.subtes.map((s) => (
									<span
										key={s.name}
										className="rounded-md border bg-muted/40 px-2 py-1 text-xs text-muted-foreground"
									>
										{s.name} · {s.questionCount} soal
										{s.durationMinutes
											? ` · ${s.durationMinutes} mnt`
											: ""}
									</span>
								))}
							</div>
						) : (
							<p className="text-sm text-muted-foreground">
								{exam.questionCount} soal
								{exam.durationMinutes
									? ` · ${exam.durationMinutes} menit`
									: ""}
								{exam.subjectName ? ` · ${exam.subjectName}` : ""}
							</p>
						)}
						<div className="flex flex-wrap items-end justify-between gap-4">
							<div className="grid gap-2">
								<p className="flex items-center gap-1.5 text-xs text-muted-foreground">
									<Clock className="size-3.5" />
									{fmtDate(exam.scheduledStartAt)} –{" "}
									{fmtDate(exam.scheduledEndAt)}
								</p>
								{live ? (
									<Countdown
										target={exam.scheduledEndAt}
										label="Sisa waktu"
									/>
								) : (
									<Countdown
										target={exam.scheduledStartAt}
										label="Dimulai dalam"
									/>
								)}
							</div>
							<div className="grid gap-2">
								{exam.accessCode ? (
									<button
										type="button"
										onClick={() => {
											navigator.clipboard
												?.writeText(exam.accessCode ?? "")
												.then(() =>
													toast.success(
														"Kode akses disalin — tempel di halaman Ujian setelah login.",
													),
												)
												.catch(() => {});
										}}
										className="inline-flex items-center gap-1.5 rounded-md border border-dashed px-2.5 py-1.5 font-mono text-sm font-semibold tracking-widest hover:bg-muted/50"
										title="Klik untuk salin kode akses"
									>
										<KeyRound className="size-3.5" />
										{exam.accessCode}
										<Copy className="size-3 text-muted-foreground" />
									</button>
								) : null}
								<Button
									render={<Link href={ctaHref} />}
									className="gap-2 bg-brand-gold-400 font-semibold text-brand-blue-900 hover:bg-brand-gold-300"
								>
									Ikut Try Out
									<ArrowRight className="size-4" />
								</Button>
							</div>
						</div>
					</CardContent>
				</div>
			</div>
		</Card>
	);
}

/** Halaman publik /tryout — daftar try out yang ditandai admin "tampil di
 *  landing". Pengkategorian per `category` ujian (chips seperti halaman
 *  tryout populer). Ikut → daftar akun murid → verifikasi HP → masukkan kode. */
export default function TryoutPage() {
	const tryoutsQ = useTryouts();
	const user = useAuthStore((s) => s.user);
	const [cat, setCat] = useState("");

	const tryouts = tryoutsQ.data?.tryouts ?? [];
	const categories = useMemo(() => {
		const m = new Map<string, number>();
		for (const t of tryouts) m.set(t.category, (m.get(t.category) ?? 0) + 1);
		return [...m.entries()].sort((a, b) => b[1] - a[1]);
	}, [tryouts]);

	const visible = cat ? tryouts.filter((t) => t.category === cat) : tryouts;
	const now = Date.now();
	const live = visible.filter(
		(t) =>
			now >= new Date(t.scheduledStartAt).getTime() &&
			now <= new Date(t.scheduledEndAt).getTime(),
	);
	const upcoming = visible.filter(
		(t) => now < new Date(t.scheduledStartAt).getTime(),
	);

	// Belum login → daftar akun murid (peserta luar); sudah login siswa →
	// langsung ke halaman ujian untuk memasukkan kode.
	const ctaHref = user?.roles.includes("SISWA")
		? "/siswa/ujian"
		: "/daftar-siswa";

	return (
		<div className="min-h-screen bg-background">
			<SiteHeader />

			<section className="border-b bg-brand-blue-900 text-white">
				<div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
					<span className="inline-flex w-fit items-center gap-2 rounded-full border border-brand-gold-400/40 bg-brand-gold-400/10 px-3 py-1 text-xs font-medium text-brand-gold-200">
						<FileCheck2 className="size-3.5" />
						Try Out GFS
					</span>
					<h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
						Try Out Online{" "}
						<span className="bg-gradient-to-r from-brand-gold-300 to-brand-gold-500 bg-clip-text text-transparent">
							Gratis &amp; Terbuka
						</span>
					</h1>
					<p className="mt-3 max-w-2xl text-sm text-brand-blue-100 sm:text-base">
						Daftar akun murid, verifikasi nomor HP, lalu masukkan kode
						akses — kerjakan per subtes dengan timer seperti ujian asli.
						Nilai keseluruhan, nilai per subtes, dan pembahasan tampil
						setelah selesai.
					</p>
				</div>
			</section>

			<main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
				{/* Chips kategori — jumlah tryout per kategori */}
				<div className="flex flex-wrap gap-2">
					<button
						type="button"
						onClick={() => setCat("")}
						className={`relative rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors ${
							cat === ""
								? "border-brand-blue-600 bg-brand-blue-50 text-brand-blue-800 dark:bg-brand-blue-900/30 dark:text-brand-blue-200"
								: "hover:bg-muted"
						}`}
					>
						Semua
						<span className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-brand-gold-400 text-[10px] font-bold text-brand-blue-900">
							{tryouts.length}
						</span>
					</button>
					{categories.map(([c, n]) => (
						<button
							key={c}
							type="button"
							onClick={() => setCat(cat === c ? "" : c)}
							className={`relative rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors ${
								cat === c
									? "border-brand-blue-600 bg-brand-blue-50 text-brand-blue-800 dark:bg-brand-blue-900/30 dark:text-brand-blue-200"
									: "hover:bg-muted"
							}`}
						>
							{c}
							<span className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-brand-gold-400 text-[10px] font-bold text-brand-blue-900">
								{n}
							</span>
						</button>
					))}
				</div>

				{tryoutsQ.isLoading ? (
					<div className="mt-8 grid gap-4">
						<Skeleton className="h-48 w-full rounded-xl" />
						<Skeleton className="h-48 w-full rounded-xl" />
					</div>
				) : visible.length === 0 ? (
					<div className="mt-10 rounded-xl border border-dashed p-10 text-center">
						<p className="font-medium">Belum ada try out yang dibuka.</p>
						<p className="mt-1 text-sm text-muted-foreground">
							Pantau halaman ini — try out baru akan tampil di sini saat
							dibuka admin.
						</p>
					</div>
				) : (
					<>
						{live.length > 0 ? (
							<section className="mt-8">
								<h2 className="mb-4 text-lg font-bold">
									Lagi berlangsung{" "}
									<span className="text-sm font-normal text-muted-foreground">
										{live.length}
									</span>
								</h2>
								<div className="grid gap-4">
									{live.map((t) => (
										<TryoutCard
											key={t.id}
											exam={t}
											ctaHref={ctaHref}
										/>
									))}
								</div>
							</section>
						) : null}
						{upcoming.length > 0 ? (
							<section className="mt-8">
								<h2 className="mb-4 text-lg font-bold">
									Akan datang{" "}
									<span className="text-sm font-normal text-muted-foreground">
										{upcoming.length}
									</span>
								</h2>
								<div className="grid gap-4">
									{upcoming.map((t) => (
										<TryoutCard
											key={t.id}
											exam={t}
											ctaHref={ctaHref}
										/>
									))}
								</div>
							</section>
						) : null}
					</>
				)}

				<div className="mt-10 rounded-xl border bg-muted/30 p-5 text-sm text-muted-foreground">
					<p className="font-semibold text-foreground">Cara ikut:</p>
					<ol className="mt-2 list-decimal space-y-1 pl-5">
						<li>Daftar akun murid di halaman Daftar Siswa.</li>
						<li>Verifikasi nomor HP lewat kode WhatsApp.</li>
						<li>Buka menu Ujian, masukkan kode akses try out.</li>
						<li>
							Kerjakan per subtes — hasil nilai &amp; pembahasan muncul
							setelah selesai.
						</li>
					</ol>
				</div>
			</main>

			<SiteFooter />
		</div>
	);
}
