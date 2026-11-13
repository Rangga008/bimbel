"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
	ArrowDownToLine,
	ArrowUpFromLine,
	Bell,
	BookOpen,
	CalendarClock,
	ChartColumn,
	ClipboardCheck,
	FileCheck2,
	GraduationCap,
	Landmark,
	Lock,
	MessageSquareText,
	Package,
	Presentation,
	Receipt,
	Star,
	TrendingUp,
	TriangleAlert,
	Users,
	Wallet,
	Zap,
	type LucideIcon,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { KpiCard } from "@/components/shared/kpi-card";
import { MiniBars } from "@/components/shared/mini-bars";
import { EmptyState } from "@/components/shared/empty-state";
import type { RoleKey } from "@/config/role-nav";
import { useAuthStore } from "@/stores/auth-store";
import { fmtDateTime } from "@/lib/phase1c-types";
import type { ExamBriefHome, HomeData } from "@/lib/home-types";
import { rupiah } from "@/components/phase2a/invoices-manager";
import { SiswaPodium } from "@/components/phase4b/siswa-podium";

const COUNT_META: Record<string, { label: string; icon: LucideIcon }> = {
	students: { label: "Siswa", icon: GraduationCap },
	parents: { label: "Orang Tua", icon: Users },
	tutors: { label: "Tutor", icon: Presentation },
	groups: { label: "Kelompok", icon: Users },
	activeGroups: { label: "Kelompok Aktif", icon: Users },
	programs: { label: "Program", icon: BookOpen },
};

const ATTENDANCE_VARIANT: Record<
	string,
	"success" | "warning" | "destructive" | "outline"
> = {
	HADIR: "success",
	IZIN: "warning",
	SAKIT: "warning",
	ALPHA: "destructive",
	ALFA: "destructive",
};

const ENROLLMENT_LABEL: Record<string, string> = {
	PENDING_PAYMENT: "Menunggu Bayar",
	PAID: "Sudah Bayar",
	ACCEPTED: "Terverifikasi",
	PLACED: "Terjadwal",
	REJECTED: "Ditolak",
};

const INVOICE_LABEL: Record<string, string> = {
	DRAFT: "Draft",
	ISSUED: "Terbit",
	PARTIALLY_PAID: "Cicilan",
	PAID: "Lunas",
	CANCELLED: "Batal",
};

/** Format rupiah ringkas untuk label grafik: 1.2jt / 350rb. */
function compactIDR(v: number) {
	const abs = Math.abs(v);
	if (abs >= 1e9) return `${(v / 1e9).toFixed(1)}M`;
	if (abs >= 1e6) return `${(v / 1e6).toFixed(1)}jt`;
	if (abs >= 1e3) return `${Math.round(v / 1e3)}rb`;
	return String(Math.round(v));
}

function sessionVariant(status: string) {
	if (status === "CANCELLED") return "destructive" as const;
	if (status === "DONE" || status === "COMPLETED") return "success" as const;
	if (status === "SCHEDULED") return "secondary" as const;
	return "outline" as const;
}

function examVariant(status: string) {
	if (status === "PUBLISHED") return "success" as const;
	if (status === "ENDED") return "secondary" as const;
	if (status === "LOCKED") return "warning" as const;
	return "outline" as const;
}

/** Aksi cepat per role — pintasan ke halaman kerja paling sering dipakai. */
const QUICK_ACTIONS: Record<RoleKey, { href: string; label: string }[]> = {
	siswa: [
		{ href: "/siswa/ujian", label: "Kerjakan Ujian" },
		{ href: "/siswa/latsol", label: "Latsol" },
		{ href: "/siswa/jadwal", label: "Jadwal" },
		{ href: "/siswa/materi", label: "Materi" },
	],
	"orang-tua": [
		{ href: "/orang-tua/pendaftaran", label: "Anak & Daftar" },
		{ href: "/orang-tua/pembayaran", label: "Pembayaran" },
		{ href: "/orang-tua/jadwal", label: "Jadwal Anak" },
		{ href: "/orang-tua/performa-anak", label: "Performa Anak" },
	],
	tutor: [
		{ href: "/tutor/absensi", label: "Absensi" },
		{ href: "/tutor/jadwal-sesi", label: "Jadwal/Sesi" },
		{ href: "/tutor/ujian/baru", label: "Buat Ujian" },
		{ href: "/tutor/materi/baru", label: "Buat Materi" },
		{ href: "/tutor/soal/baru", label: "Buat Soal" },
		{ href: "/tutor/latsol/baru", label: "Buat Latsol" },
	],
	"admin-finance": [],
	"admin-academic": [
		{ href: "/admin-academic/jadwal", label: "Jadwal & Sesi" },
		{ href: "/admin-academic/kelompok/baru", label: "Kelompok Baru" },
		{ href: "/admin-academic/ujian/baru", label: "Buat Ujian" },
		{ href: "/admin-academic/materi/baru", label: "Buat Materi" },
		{ href: "/admin-academic/pendaftaran", label: "Pendaftaran" },
		{ href: "/admin-academic/absensi", label: "Absensi" },
	],
	owner: [
		{ href: "/owner/laporan", label: "Laporan" },
		{ href: "/owner/piutang", label: "Piutang" },
		{ href: "/owner/rab-vs-actual", label: "RAB vs Actual" },
		{ href: "/owner/audit", label: "Audit Log" },
	],
};

/** Baris daftar ujian untuk kartu dashboard — dipakai academic/owner/tutor. */
function ExamRows({ items }: { items: ExamBriefHome[] }) {
	return (
		<div className="flex flex-col gap-2 text-sm">
			{items.map((e) => (
				<div key={e.id} className="flex items-center justify-between gap-2">
					<span className="min-w-0 truncate">
						{e.title}
						<span className="text-muted-foreground">
							{" "}
							— {fmtDateTime(e.scheduledStartAt)}
						</span>
					</span>
					<span className="flex shrink-0 items-center gap-1.5">
						{e.live ? <Badge variant="warning">LIVE</Badge> : null}
						<Badge variant="outline">
							<span className="tabular-nums">
								{e.submitted}/{e.attempts} terkumpul
							</span>
						</Badge>
						<Badge variant={examVariant(e.status)}>{e.status}</Badge>
					</span>
				</div>
			))}
		</div>
	);
}

/**
 * Beranda tiap role — Fase 2: finance nyata (invoice, outstanding, kas/bank, RAB)
 * tampil di dashboard Admin Finance & Owner; Fase 1 tetap dipertahankan.
 * Fase 7c: tampilan KPI card berikon — data & logika tidak berubah.
 */
export function RoleHome({
	role,
	apiPath,
	title,
}: {
	role: RoleKey;
	apiPath: string;
	title: string;
}) {
	const { data, isLoading, isError } = useQuery({
		queryKey: ["dashboard", apiPath],
		queryFn: () => apiFetch<HomeData>(apiPath),
	});
	const authUser = useAuthStore((s) => s.user);

	const todaySessions = data?.todaySessions ?? [];
	const upcomingSessions = data?.upcomingSessions ?? [];
	// Siswa/orang tua: backend hanya mengirim upcomingSessions — judul generik.
	const upcomingTitle =
		data?.role === "SISWA" || data?.role === "ORANG_TUA"
			? "Jadwal Terdekat"
			: "Sesi 7 Hari ke Depan";
	const week = data?.weekAttendance;
	// Siswa luar (tanpa kelompok): hanya ujian yang relevan sebagai aksi cepat.
	const quickActions =
		role === "siswa" && authUser?.studentGroupless
			? QUICK_ACTIONS.siswa.filter((a) => a.href === "/siswa/ujian")
			: QUICK_ACTIONS[role];
	const counts = data?.counts ? Object.entries(data.counts) : [];
	const finance = data?.finance;
	const rabUsedPct =
		finance && finance.rabBudget > 0
			? Math.min(100, Math.round((finance.rabActual / finance.rabBudget) * 100))
			: 0;

	return (
		<div className="flex flex-col gap-5">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
					{data?.user ? (
						<p className="mt-0.5 text-sm text-muted-foreground">
							Halo, {data.user} — berikut ringkasan hari ini.
						</p>
					) : null}
				</div>
				<div className="flex items-center gap-1.5">
					{data?.role ? <Badge variant="secondary">{data.role}</Badge> : null}
					{typeof data?.unreadNotifications === "number" &&
					data.unreadNotifications > 0 ? (
						<Badge variant="warning">
							<Bell className="size-3" />
							<span className="tabular-nums">
								{data.unreadNotifications} notifikasi baru
							</span>
						</Badge>
					) : null}
				</div>
			</div>

			{/* Aksi cepat — pintasan pekerjaan paling sering per role. */}
			{quickActions.length > 0 ? (
				<div className="flex flex-wrap items-center gap-2">
					<span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
						<Zap className="size-3.5" />
						Aksi cepat:
					</span>
					{quickActions.map((a) => (
						<Link
							key={a.href}
							href={a.href}
							className={buttonVariants({ variant: "outline", size: "sm" })}
						>
							{a.label}
						</Link>
					))}
				</div>
			) : null}

			{/* Podium ranking — siswa langsung lihat top skor kelompok & GFS di atas. */}
			{data?.role === "SISWA" ? <SiswaPodium /> : null}

			{isLoading && <Skeleton className="h-24 w-full" />}
			{isError && (
				<Card>
					<CardContent className="py-10 text-center text-sm text-destructive">
						Gagal memuat — cek permission akun Anda.
					</CardContent>
				</Card>
			)}

			{data && (
				<>
					{counts.length > 0 ? (
						<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
							{counts.map(([key, value]) => {
								const meta = COUNT_META[key] ?? {
									label: key,
									icon: ChartColumn,
								};
								return (
									<KpiCard
										key={key}
										icon={meta.icon}
										label={meta.label}
										value={value}
									/>
								);
							})}
						</div>
					) : null}

					{/* Notifikasi penting butuh tindakan — ujian live, attempt
					    terkunci, antrean WA bermasalah. */}
					{((data.liveAttempts ?? 0) > 0 ||
						(data.lockedAttempts ?? 0) > 0 ||
						(data.waOutbox?.failed ?? 0) > 0 ||
						(data.waOutbox?.pending ?? 0) > 0) && (
						<div className="flex flex-wrap gap-2">
							{(data.liveAttempts ?? 0) > 0 ? (
								<Badge variant="warning" className="gap-1.5 py-1">
									<FileCheck2 className="size-3.5" />
									{data.liveAttempts} siswa sedang mengerjakan ujian
								</Badge>
							) : null}
							{(data.lockedAttempts ?? 0) > 0 ? (
								<Badge variant="destructive" className="gap-1.5 py-1">
									<Lock className="size-3.5" />
									{data.lockedAttempts} attempt terkunci — perlu unlock
								</Badge>
							) : null}
							{(data.waOutbox?.pending ?? 0) > 0 ? (
								<Badge variant="secondary" className="gap-1.5 py-1">
									<MessageSquareText className="size-3.5" />
									{data.waOutbox?.pending} pesan WA dalam antrean
								</Badge>
							) : null}
							{(data.waOutbox?.failed ?? 0) > 0 ? (
								<Badge variant="destructive" className="gap-1.5 py-1">
									<MessageSquareText className="size-3.5" />
									{data.waOutbox?.failed} pesan WA gagal — cek Antrean WA
								</Badge>
							) : null}
						</div>
					)}

					{/* KPI aktivitas belajar — siswa. */}
					{data.role === "SISWA" &&
					(data.points !== undefined ||
						data.examCount !== undefined ||
						data.latsolDone !== undefined) ? (
						<div className="grid gap-3 sm:grid-cols-3">
							<KpiCard
								icon={Star}
								label="Poin Saya"
								value={data.points ?? 0}
								tone="warning"
							/>
							<KpiCard
								icon={ClipboardCheck}
								label="Ujian Selesai"
								value={data.examCount ?? 0}
							/>
							<KpiCard
								icon={BookOpen}
								label="Latsol Dikerjakan"
								value={data.latsolDone ?? 0}
							/>
						</div>
					) : null}

					{/* KPI tutor: siswa diampu + sesi minggu ini. */}
					{data.role === "TUTOR" &&
					(data.studentsTotal !== undefined || data.sessionWeek) ? (
						<div className="grid gap-3 sm:grid-cols-3">
							<KpiCard
								icon={GraduationCap}
								label="Siswa Diampu"
								value={data.studentsTotal ?? 0}
							/>
							<KpiCard
								icon={CalendarClock}
								label="Sesi Minggu Ini"
								value={data.sessionWeek?.TOTAL ?? 0}
							/>
							<KpiCard
								icon={TriangleAlert}
								label="Absensi Pending"
								value={data.pendingAttendance?.length ?? 0}
								tone={
									(data.pendingAttendance?.length ?? 0) > 0
										? "warning"
										: "default"
								}
							/>
						</div>
					) : null}

					{finance ? (
						<section className="flex flex-col gap-3">
							<h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
								Keuangan — {finance.period}
							</h2>
							<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
								<KpiCard
									icon={Wallet}
									label="Outstanding"
									value={rupiah(finance.outstandingTotal)}
									hint={`${finance.issuedCount} invoice terbit`}
									tone="warning"
								/>
								<KpiCard
									icon={TriangleAlert}
									label="Invoice Overdue"
									value={finance.overdueCount}
									hint="lewat jatuh tempo"
									tone={finance.overdueCount > 0 ? "danger" : "default"}
								/>
								<KpiCard
									icon={Receipt}
									label="Bukti Pending"
									value={finance.pendingProofs}
									hint="menunggu verifikasi"
									tone={finance.pendingProofs > 0 ? "warning" : "default"}
								/>
								<KpiCard
									icon={Landmark}
									label="Saldo Kas/Bank"
									value={rupiah(finance.cashBalance)}
									hint={`${finance.accountCount} akun aktif`}
								/>
								<KpiCard
									icon={ArrowDownToLine}
									label="Kas Masuk"
									value={rupiah(finance.cashIn)}
									tone="success"
								/>
								<KpiCard
									icon={ArrowUpFromLine}
									label="Kas Keluar"
									value={rupiah(finance.cashOut)}
								/>
								<Card className="sm:col-span-2">
									<CardContent className="flex flex-col gap-2 py-4">
										<div className="flex items-center gap-3">
											<div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-blue-50 text-brand-blue-600">
												<ChartColumn size={20} />
											</div>
											<div className="min-w-0 flex-1">
												<p className="text-xs text-muted-foreground">
													RAB vs Actual
												</p>
												<p className="truncate text-xl font-semibold tabular-nums">
													{rupiah(finance.rabActual)}{" "}
													<span className="text-sm font-normal text-muted-foreground">
														/ {rupiah(finance.rabBudget)}
													</span>
												</p>
											</div>
										</div>
										<div
											className="h-1.5 overflow-hidden rounded-full bg-muted"
											role="progressbar"
											aria-valuenow={rabUsedPct}
											aria-valuemin={0}
											aria-valuemax={100}
										>
											<div
												className={cn(
													"h-full rounded-full transition-all",
													finance.rabRemaining < 0
														? "bg-destructive"
														: "bg-brand-blue-500",
												)}
												style={{ width: `${rabUsedPct}%` }}
											/>
										</div>
										<p
											className={cn(
												"text-xs tabular-nums",
												finance.rabRemaining < 0
													? "font-medium text-destructive"
													: "text-muted-foreground",
											)}
										>
											Sisa RAB: {rupiah(finance.rabRemaining)} ({rabUsedPct}%
											terpakai)
										</p>
									</CardContent>
								</Card>
							</div>
						</section>
					) : null}

					<div className="grid gap-3 lg:grid-cols-2">
						{data.attendanceSummary ? (
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center gap-2 text-base">
										<ClipboardCheck className="size-4.5 text-brand-blue-600" />
										Kehadiran Saya
									</CardTitle>
								</CardHeader>
								<CardContent className="flex flex-col gap-2">
									<p className="text-2xl font-semibold tabular-nums">
										{data.attendanceSummary.hadir}
										<span className="text-sm font-normal text-muted-foreground">
											{" "}
											dari {data.attendanceSummary.total} sesi
										</span>
									</p>
									<div className="h-1.5 overflow-hidden rounded-full bg-muted">
										<div
											className="h-full rounded-full bg-success-500"
											style={{
												width: `${data.attendanceSummary.total > 0 ? Math.round((data.attendanceSummary.hadir / data.attendanceSummary.total) * 100) : 0}%`,
											}}
										/>
									</div>
								</CardContent>
							</Card>
						) : null}

						{week && typeof week === "object" && "total" in week ? (
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center gap-2 text-base">
										<ClipboardCheck className="size-4.5 text-brand-blue-600" />
										Kehadiran Anak Minggu Ini
									</CardTitle>
								</CardHeader>
								<CardContent>
									<p className="text-2xl font-semibold tabular-nums">
										{(week as { hadir: number }).hadir}
										<span className="text-sm font-normal text-muted-foreground">
											{" "}
											dari {(week as { total: number }).total} catatan
										</span>
									</p>
								</CardContent>
							</Card>
						) : null}

						{week && typeof week === "object" && !("total" in week) ? (
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center gap-2 text-base">
										<ClipboardCheck className="size-4.5 text-brand-blue-600" />
										Kehadiran 7 Hari Terakhir
									</CardTitle>
								</CardHeader>
								<CardContent className="flex flex-wrap gap-1.5">
									{Object.keys(week).length === 0 ? (
										<span className="text-sm text-muted-foreground">
											Belum ada data.
										</span>
									) : null}
									{Object.entries(week).map(([k, v]) => (
										<Badge
											key={k}
											variant={ATTENDANCE_VARIANT[k] ?? "outline"}
										>
											{k}: <span className="tabular-nums">{v as number}</span>
										</Badge>
									))}
								</CardContent>
							</Card>
						) : null}

						{data.pendingAttendance && data.pendingAttendance.length > 0 ? (
							<Card className="border-warning-300">
								<CardHeader>
									<CardTitle className="flex items-center gap-2 text-base">
										<TriangleAlert className="size-4.5 text-warning-600" />
										Absensi Belum Diisi
									</CardTitle>
								</CardHeader>
								<CardContent className="flex flex-col gap-2 text-sm">
									{data.pendingAttendance.map((s) => (
										<div
											key={s.id}
											className="flex items-center justify-between gap-2"
										>
											<span className="truncate">
												{s.group.name} — {fmtDateTime(s.startsAt)}
											</span>
											<Badge variant="warning">Belum diisi</Badge>
										</div>
									))}
								</CardContent>
							</Card>
						) : null}

						{data.sessionMonth ? (
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center gap-2 text-base">
										<CalendarClock className="size-4.5 text-brand-blue-600" />
										Sesi Bulan Ini
									</CardTitle>
								</CardHeader>
								<CardContent className="flex flex-wrap gap-1.5">
									<Badge variant="secondary">
										Terjadwal:{" "}
										<span className="tabular-nums">
											{data.sessionMonth.SCHEDULED ?? 0}
										</span>
									</Badge>
									<Badge variant="success">
										Selesai:{" "}
										<span className="tabular-nums">
											{data.sessionMonth.COMPLETED ?? 0}
										</span>
									</Badge>
									<Badge variant="destructive">
										Batal:{" "}
										<span className="tabular-nums">
											{data.sessionMonth.CANCELLED ?? 0}
										</span>
									</Badge>
								</CardContent>
							</Card>
						) : null}

						{/* Grafik tren nilai — siswa. */}
						{(data.scoreTrend ?? []).length > 0 ? (
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center gap-2 text-base">
										<TrendingUp className="size-4.5 text-brand-blue-600" />
										Tren Nilai Ujian
									</CardTitle>
								</CardHeader>
								<CardContent>
									<MiniBars
										data={data.scoreTrend!}
										suffix="%"
										colorClass="bg-success-500"
									/>
								</CardContent>
							</Card>
						) : null}

						{/* Grafik arus kas 6 bulan — finance/owner. */}
						{(data.cashTrend ?? []).length > 0 ? (
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center gap-2 text-base">
										<Wallet className="size-4.5 text-brand-blue-600" />
										Arus Kas 6 Bulan
									</CardTitle>
								</CardHeader>
								<CardContent>
									<MiniBars
										data={data.cashTrend!.map((c) => ({
											label: c.label,
											value: c.in,
											value2: c.out,
											title: `${c.label}: masuk ${rupiah(c.in)} — keluar ${rupiah(c.out)}`,
										}))}
										formatValue={compactIDR}
										legend={["Masuk", "Keluar"]}
									/>
								</CardContent>
							</Card>
						) : null}

						{/* Grafik kehadiran 6 minggu — academic/owner. */}
						{(data.attendanceTrend ?? []).length > 0 ? (
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center gap-2 text-base">
										<ClipboardCheck className="size-4.5 text-brand-blue-600" />
										Kehadiran 6 Minggu
									</CardTitle>
								</CardHeader>
								<CardContent>
									<MiniBars
										data={data.attendanceTrend!.map((w) => ({
											label: w.label,
											value: w.value,
											title: `${w.label}: ${w.value}% hadir (${w.count} catatan)`,
										}))}
										suffix="%"
										colorClass="bg-brand-blue-500"
									/>
								</CardContent>
							</Card>
						) : null}

						{/* Ringkasan nilai per anak — ortu. */}
						{(data.childrenScores ?? []).length > 0 ? (
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center gap-2 text-base">
										<TrendingUp className="size-4.5 text-brand-blue-600" />
										Nilai Ujian Anak
									</CardTitle>
								</CardHeader>
								<CardContent className="flex flex-col gap-2 text-sm">
									{data.childrenScores!.map((c) => (
										<div
											key={c.studentId}
											className="flex items-center justify-between gap-2"
										>
											<span className="min-w-0 truncate">
												{c.name}
												{c.lastExam ? (
													<span className="text-muted-foreground">
														{" "}
														— terakhir: {c.lastExam}
													</span>
												) : null}
											</span>
											{c.avgPct !== null ? (
												<Badge variant="secondary">
													rata-rata{" "}
													<span className="tabular-nums">{c.avgPct}%</span>
													{c.lastPct !== null
														? ` · ${c.lastPct}% terakhir`
														: null}
												</Badge>
											) : (
												<Badge variant="outline">belum ada ujian</Badge>
											)}
										</div>
									))}
								</CardContent>
							</Card>
						) : null}

						{/* Funnel pendaftaran — academic/owner. */}
						{data.enrollmentStatus &&
						Object.keys(data.enrollmentStatus).length > 0 ? (
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center gap-2 text-base">
										<GraduationCap className="size-4.5 text-brand-blue-600" />
										Pendaftaran Siswa
										{typeof data.examsMonth === "number" ? (
											<span className="text-xs font-normal text-muted-foreground">
												· {data.examsMonth} ujian bulan ini
											</span>
										) : null}
									</CardTitle>
								</CardHeader>
								<CardContent className="flex flex-wrap gap-1.5">
									{Object.entries(data.enrollmentStatus).map(([k, v]) => (
										<Badge
											key={k}
											variant={
												k === "PLACED"
													? "success"
													: k === "REJECTED"
														? "destructive"
														: k === "PENDING_PAYMENT"
															? "warning"
															: "secondary"
											}
										>
											{ENROLLMENT_LABEL[k] ?? k}:{" "}
											<span className="tabular-nums">{v}</span>
										</Badge>
									))}
								</CardContent>
							</Card>
						) : null}

						{/* Status invoice — finance/owner. */}
						{data.invoiceStatus &&
						Object.keys(data.invoiceStatus).length > 0 ? (
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center gap-2 text-base">
										<Receipt className="size-4.5 text-brand-blue-600" />
										Status Invoice
									</CardTitle>
								</CardHeader>
								<CardContent className="flex flex-wrap gap-1.5">
									{Object.entries(data.invoiceStatus).map(([k, v]) => (
										<Badge
											key={k}
											variant={
												k === "PAID"
													? "success"
													: k === "CANCELLED"
														? "destructive"
														: k === "ISSUED" || k === "PARTIALLY_PAID"
															? "warning"
															: "outline"
											}
										>
											{INVOICE_LABEL[k] ?? k}:{" "}
											<span className="tabular-nums">{v}</span>
										</Badge>
									))}
								</CardContent>
							</Card>
						) : null}

						{/* Ranking siswa — tutor (semua waktu) / admin-academic &
						    owner (bulan ini). */}
						{["TUTOR", "ADMIN_ACADEMIC", "OWNER"].includes(data.role) &&
						(data.topStudents ?? []).length > 0 ? (
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center gap-2 text-base">
										<Star className="size-4.5 text-brand-blue-600" />
										{data.role === "TUTOR" ? "Ranking Siswa" : "Top Siswa — Bulan Ini"}
									</CardTitle>
								</CardHeader>
								<CardContent className="flex flex-col gap-2 text-sm">
									{data.topStudents!.map((s, i) => (
										<div
											key={s.studentId}
											className="flex items-center justify-between gap-2"
										>
											<span className="flex min-w-0 items-center gap-2">
												<span
													className={cn(
														"flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums",
														i === 0
															? "bg-brand-gold-100 text-brand-gold-700"
															: i < 3
																? "bg-brand-blue-50 text-brand-blue-600"
																: "bg-muted text-muted-foreground",
													)}
												>
													{i + 1}
												</span>
												<span className="min-w-0 truncate">{s.name}</span>
											</span>
											<Badge variant={s.avgPct >= 75 ? "success" : s.avgPct >= 50 ? "warning" : "destructive"}>
												<span className="tabular-nums">{s.avgPct}%</span>
												<span className="font-normal"> · {s.examCount} ujian</span>
											</Badge>
										</div>
									))}
								</CardContent>
							</Card>
						) : null}

						{/* Rata-rata nilai per kelompok — tutor (diampu) / admin
						    academic & owner (semua kelompok, bulan ini). */}
						{["TUTOR", "ADMIN_ACADEMIC", "OWNER"].includes(data.role) &&
						(data.groupAvgs ?? []).length > 0 ? (
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center gap-2 text-base">
										<ChartColumn className="size-4.5 text-brand-blue-600" />
										{data.role === "TUTOR"
											? "Rata-rata per Kelompok"
											: "Nilai per Kelompok — Bulan Ini"}
									</CardTitle>
								</CardHeader>
								<CardContent className="flex flex-col gap-2 text-sm">
									{data.groupAvgs!.map((g) => (
										<div
											key={g.groupId}
											className="flex items-center justify-between gap-2"
										>
											<span className="min-w-0 truncate">
												{g.name}
												<span className="text-muted-foreground">
													{" "}
													— {g.students} siswa
												</span>
											</span>
											<Badge variant={g.avgPct >= 75 ? "success" : g.avgPct >= 50 ? "warning" : "destructive"}>
												<span className="tabular-nums">{g.avgPct}%</span>
											</Badge>
										</div>
									))}
								</CardContent>
							</Card>
						) : null}

						{/* Attempt ujian terbaru siswa — tutor. */}
						{data.role === "TUTOR" && (data.recentAttempts ?? []).length > 0 ? (
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center gap-2 text-base">
										<TrendingUp className="size-4.5 text-brand-blue-600" />
										Ujian Terakhir Dikerjakan
									</CardTitle>
								</CardHeader>
								<CardContent className="flex flex-col gap-2 text-sm">
									{data.recentAttempts!.map((a) => (
										<div
											key={a.id}
											className="flex items-center justify-between gap-2"
										>
											<span className="min-w-0 truncate">
												{a.studentName}
												<span className="text-muted-foreground">
													{" "}
													— {a.examTitle}
												</span>
											</span>
											<Badge variant={a.pct >= 75 ? "success" : a.pct >= 50 ? "warning" : "destructive"}>
												<span className="tabular-nums">{a.pct}%</span>
											</Badge>
										</div>
									))}
								</CardContent>
							</Card>
						) : null}

						{/* Status sesi minggu ini — tutor. */}
						{data.role === "TUTOR" &&
						data.sessionWeek &&
						Object.keys(data.sessionWeek).length > 1 ? (
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center gap-2 text-base">
										<CalendarClock className="size-4.5 text-brand-blue-600" />
										Status Sesi Minggu Ini
									</CardTitle>
								</CardHeader>
								<CardContent className="flex flex-wrap gap-1.5">
									{Object.entries(data.sessionWeek)
										.filter(([k]) => k !== "TOTAL")
										.map(([k, v]) => (
											<Badge key={k} variant={sessionVariant(k)}>
												{k}: <span className="tabular-nums">{v}</span>
											</Badge>
										))}
								</CardContent>
							</Card>
						) : null}

						{(data.packageUsage ?? []).length > 0 ? (
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center gap-2 text-base">
										<Package className="size-4.5 text-brand-blue-600" />
										Pemakaian Paket
									</CardTitle>
								</CardHeader>
								<CardContent className="flex flex-col gap-3">
									{data.packageUsage!.map((p) => {
										const pct = Math.min(
											100,
											Math.round((p.used / Math.max(1, p.total)) * 100),
										);
										return (
											<div key={p.groupId} className="flex flex-col gap-1">
												<div className="flex items-center justify-between gap-2 text-sm">
													<span className="min-w-0 truncate">
														{p.groupName}
														<span className="text-muted-foreground">
															{" "}
															— {p.packageName}
														</span>
													</span>
													<span className="shrink-0 text-xs tabular-nums text-muted-foreground">
														{p.used}/{p.total} sesi
													</span>
												</div>
												<div className="h-1.5 overflow-hidden rounded-full bg-muted">
													<div
														className={cn(
															"h-full rounded-full",
															pct >= 100
																? "bg-destructive"
																: pct >= 80
																	? "bg-warning-500"
																	: "bg-brand-blue-500",
														)}
														style={{ width: `${pct}%` }}
													/>
												</div>
											</div>
										);
									})}
								</CardContent>
							</Card>
						) : null}

						{/* Ujian terbuka untuk dikerjakan — siswa. */}
						{data.role === "SISWA" && (data.availableExams ?? []).length > 0 ? (
							<Card className="border-brand-blue-200">
								<CardHeader>
									<CardTitle className="flex items-center gap-2 text-base">
										<FileCheck2 className="size-4.5 text-brand-blue-600" />
										Ujian Terbuka
									</CardTitle>
								</CardHeader>
								<CardContent className="flex flex-col gap-2 text-sm">
									{data.availableExams!.map((e) => (
										<div
											key={e.id}
											className="flex items-center justify-between gap-2"
										>
											<span className="min-w-0 truncate">
												{e.title}
												<span className="text-muted-foreground">
													{" "}
													— tutup {fmtDateTime(e.scheduledEndAt)}
												</span>
											</span>
											{e.myStatus === "IN_PROGRESS" ? (
												<Badge variant="warning">Sedang dikerjakan</Badge>
											) : e.myStatus === "LOCKED" ? (
												<Badge variant="destructive">Terkunci</Badge>
											) : e.myStatus === "SUBMITTED" ? (
												<Badge variant="success">Selesai</Badge>
											) : (
												<Badge variant="secondary">Belum dikerjakan</Badge>
											)}
										</div>
									))}
									<Link
										href="/siswa/ujian"
										className={cn(
											buttonVariants({ variant: "outline", size: "sm" }),
											"mt-1 w-fit",
										)}
									>
										Buka halaman Ujian
									</Link>
								</CardContent>
							</Card>
						) : null}

						{/* Attempt ujian anak sedang berjalan/terkunci — ortu. */}
						{(data.childExamAlerts ?? []).length > 0 ? (
							<Card className="border-warning-300">
								<CardHeader>
									<CardTitle className="flex items-center gap-2 text-base">
										<FileCheck2 className="size-4.5 text-warning-600" />
										Ujian Anak
									</CardTitle>
								</CardHeader>
								<CardContent className="flex flex-col gap-2 text-sm">
									{data.childExamAlerts!.map((a, i) => (
										<div
											key={i}
											className="flex items-center justify-between gap-2"
										>
											<span className="min-w-0 truncate">
												{a.studentName}
												<span className="text-muted-foreground">
													{" "}
													— {a.examTitle}
												</span>
											</span>
											<Badge
												variant={
													a.status === "LOCKED" ? "destructive" : "warning"
												}
											>
												{a.status === "LOCKED"
													? "Terkunci"
													: "Sedang dikerjakan"}
											</Badge>
										</div>
									))}
								</CardContent>
							</Card>
						) : null}

						{/* Ujian bulan ini — admin academic/owner. */}
						{(data.examsMonthList ?? []).length > 0 ? (
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center gap-2 text-base">
										<FileCheck2 className="size-4.5 text-brand-blue-600" />
										Ujian Bulan Ini
										{(data.liveAttempts ?? 0) > 0 ? (
											<Badge variant="warning" className="ml-auto">
												{data.liveAttempts} sedang mengerjakan
											</Badge>
										) : null}
									</CardTitle>
								</CardHeader>
								<CardContent>
									<ExamRows items={data.examsMonthList!} />
								</CardContent>
							</Card>
						) : null}

						{/* Ujian yang dibuat tutor — tutor. */}
						{data.role === "TUTOR" && (data.myExams ?? []).length > 0 ? (
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center gap-2 text-base">
										<FileCheck2 className="size-4.5 text-brand-blue-600" />
										Ujian Saya
									</CardTitle>
								</CardHeader>
								<CardContent>
									<ExamRows items={data.myExams!} />
								</CardContent>
							</Card>
						) : null}

						{todaySessions.length > 0 ? (
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center gap-2 text-base">
										<CalendarClock className="size-4.5 text-brand-blue-600" />
										Sesi Hari Ini
										<span className="text-xs font-normal text-muted-foreground">
											· {todaySessions.length} sesi
										</span>
									</CardTitle>
								</CardHeader>
								<CardContent className="flex flex-col gap-2">
									{todaySessions.map((s) => (
										<div
											key={s.id}
											className="flex items-center justify-between gap-2 text-sm"
										>
											<span className="min-w-0 truncate">
												{s.group.name} — {fmtDateTime(s.startsAt)}
												{s._count ? (
													<span className="text-muted-foreground">
														{" "}
														· {s._count.students} siswa
													</span>
												) : null}
											</span>
											<Badge variant={sessionVariant(s.status)}>
												{s.status}
											</Badge>
										</div>
									))}
								</CardContent>
							</Card>
						) : null}

						{upcomingSessions.length > 0 ? (
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center gap-2 text-base">
										<CalendarClock className="size-4.5 text-brand-blue-600" />
										{upcomingTitle}
									</CardTitle>
								</CardHeader>
								<CardContent className="flex flex-col gap-2">
									{upcomingSessions.map((s) => (
										<div
											key={s.id}
											className="flex items-center justify-between gap-2 text-sm"
										>
											<span className="min-w-0 truncate">
												{s.group.name} — {fmtDateTime(s.startsAt)}
												{(s.childNames ?? []).length > 0 ? (
													<span className="text-muted-foreground">
														{" "}
														· {s.childNames!.join(", ")}
													</span>
												) : null}
											</span>
											<Badge variant={sessionVariant(s.status)}>
												{s.status}
											</Badge>
										</div>
									))}
								</CardContent>
							</Card>
						) : null}

						{(data.groups ?? []).length > 0 ? (
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center gap-2 text-base">
										<Users className="size-4.5 text-brand-blue-600" />
										Kelompok
									</CardTitle>
								</CardHeader>
								<CardContent className="flex flex-wrap gap-1.5">
									{data.groups!.slice(0, 8).map((g) => (
										<Badge key={g.id} variant="outline">
											{g.name}
										</Badge>
									))}
								</CardContent>
							</Card>
						) : null}

						{(data.children ?? []).length > 0 ? (
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center gap-2 text-base">
										<GraduationCap className="size-4.5 text-brand-blue-600" />
										Anak
									</CardTitle>
								</CardHeader>
								<CardContent className="flex flex-wrap gap-1.5">
									{data.children!.map((c) => (
										<Badge key={c.id} variant="outline">
											{c.user.name}
										</Badge>
									))}
								</CardContent>
							</Card>
						) : null}
					</div>

					{counts.length === 0 &&
					!finance &&
					todaySessions.length === 0 &&
					upcomingSessions.length === 0 &&
					!data.attendanceSummary &&
					!week &&
					!data.sessionMonth &&
					!(data.packageUsage ?? []).length &&
					!(data.groups ?? []).length &&
					!(data.children ?? []).length &&
					!(data.pendingAttendance ?? []).length &&
					!(data.scoreTrend ?? []).length &&
					!(data.cashTrend ?? []).length &&
					!(data.attendanceTrend ?? []).length &&
					!(data.childrenScores ?? []).length &&
					!data.enrollmentStatus &&
					!data.invoiceStatus &&
					!data.sessionWeek &&
					!(data.examsMonthList ?? []).length &&
					!(data.myExams ?? []).length &&
					!(data.availableExams ?? []).length &&
					!(data.childExamAlerts ?? []).length &&
					!data.waOutbox &&
					data.points === undefined &&
					data.studentsTotal === undefined ? (
						<Card>
							<CardContent>
								<EmptyState
									icon={ChartColumn}
									title="Belum ada ringkasan"
									description="Data dashboard untuk akun Anda belum tersedia."
								/>
							</CardContent>
						</Card>
					) : null}
				</>
			)}
		</div>
	);
}
