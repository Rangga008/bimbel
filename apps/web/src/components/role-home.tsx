"use client";

import { useQuery } from "@tanstack/react-query";
import {
	ArrowDownToLine,
	ArrowUpFromLine,
	Bell,
	BookOpen,
	CalendarClock,
	ChartColumn,
	ClipboardCheck,
	GraduationCap,
	Landmark,
	Package,
	Presentation,
	Receipt,
	Star,
	TrendingUp,
	TriangleAlert,
	Users,
	Wallet,
	type LucideIcon,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { KpiCard } from "@/components/shared/kpi-card";
import { MiniBars } from "@/components/shared/mini-bars";
import { EmptyState } from "@/components/shared/empty-state";
import type { RoleKey } from "@/config/role-nav";
import { fmtDateTime } from "@/lib/phase1c-types";
import type { HomeData } from "@/lib/home-types";
import { rupiah } from "@/components/phase2a/invoices-manager";

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

/**
 * Beranda tiap role — Fase 2: finance nyata (invoice, outstanding, kas/bank, RAB)
 * tampil di dashboard Admin Finance & Owner; Fase 1 tetap dipertahankan.
 * Fase 7c: tampilan KPI card berikon — data & logika tidak berubah.
 */
export function RoleHome({
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

	const sessions = data?.upcomingSessions ?? data?.todaySessions ?? [];
	const week = data?.weekAttendance;
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

						{sessions.length > 0 ? (
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center gap-2 text-base">
										<CalendarClock className="size-4.5 text-brand-blue-600" />
										{data.todaySessions ? "Sesi Hari Ini" : "Jadwal Terdekat"}
									</CardTitle>
								</CardHeader>
								<CardContent className="flex flex-col gap-2">
									{sessions.map((s) => (
										<div
											key={s.id}
											className="flex items-center justify-between gap-2 text-sm"
										>
											<span className="min-w-0 truncate">
												{s.group.name} — {fmtDateTime(s.startsAt)}
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
					sessions.length === 0 &&
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
