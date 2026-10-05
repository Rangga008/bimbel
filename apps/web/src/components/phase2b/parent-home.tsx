"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
	Bell,
	CalendarClock,
	ChartColumn,
	ClipboardCheck,
	GraduationCap,
	Receipt,
	TriangleAlert,
	Wallet,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiCard } from "@/components/shared/kpi-card";
import { EmptyState } from "@/components/shared/empty-state";
import { fmtDateTime } from "@/lib/phase1c-types";
import type { HomeData } from "@/lib/home-types";
import { rupiah } from "@/components/phase2a/invoices-manager";

function sessionVariant(status: string) {
	if (status === "CANCELLED") return "destructive" as const;
	if (status === "DONE" || status === "COMPLETED") return "success" as const;
	return "secondary" as const;
}

/**
 * Beranda Orang Tua — tagihan & jatuh tempo, sesi anak minggu ini,
 * dan performa kehadiran per anak.
 */
export function ParentHome() {
	const { data, isLoading, isError } = useQuery({
		queryKey: ["dashboard", "/dashboard/orang-tua"],
		queryFn: () => apiFetch<HomeData>("/dashboard/orang-tua"),
	});

	const invoices = data?.dueInvoices ?? [];
	const sessions = data?.upcomingSessions ?? [];
	const perf = data?.childPerformance ?? [];
	const week = data?.weekAttendance;
	const now = new Date(new Date().toDateString());
	const overdue = invoices.filter((i) => i.dueDate && new Date(i.dueDate) < now);
	const totalSisa = invoices.reduce((a, i) => a + i.sisa, 0);
	const weekPct =
		week && "total" in week && week.total > 0
			? Math.round((week.hadir / week.total) * 100)
			: null;

	return (
		<div className="flex flex-col gap-5">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h1 className="text-2xl font-semibold tracking-tight">Beranda</h1>
					{data?.user ? (
						<p className="mt-0.5 text-sm text-muted-foreground">
							Halo, {data.user} — ringkasan anak Anda minggu ini.
						</p>
					) : null}
				</div>
				<div className="flex items-center gap-1.5">
					{data?.role ? <Badge variant="secondary">{data.role}</Badge> : null}
					{typeof data?.unreadNotifications === "number" && data.unreadNotifications > 0 ? (
						<Badge variant="warning">
							<Bell className="size-3" />
							<span className="tabular-nums">{data.unreadNotifications} notifikasi baru</span>
						</Badge>
					) : null}
				</div>
			</div>

			{isLoading ? <Skeleton className="h-24 w-full" /> : null}
			{isError ? (
				<Card>
					<CardContent className="py-10 text-center text-sm text-destructive">
						Gagal memuat beranda — cek koneksi Anda.
					</CardContent>
				</Card>
			) : null}

			{data ? (
				<>
					{/* KPI ringkas */}
					<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
						<KpiCard
							icon={Wallet}
							label="Sisa Tagihan"
							value={rupiah(totalSisa)}
							hint={`${invoices.length} invoice belum lunas`}
							tone={totalSisa > 0 ? "warning" : "default"}
						/>
						<KpiCard
							icon={TriangleAlert}
							label="Jatuh Tempo"
							value={overdue.length}
							hint="invoice lewat tempo"
							tone={overdue.length > 0 ? "danger" : "default"}
						/>
						<KpiCard
							icon={CalendarClock}
							label="Sesi Minggu Ini"
							value={sessions.length}
							hint="semua anak"
						/>
						<KpiCard
							icon={ClipboardCheck}
							label="Kehadiran Minggu Ini"
							value={weekPct !== null ? `${weekPct}%` : "—"}
							hint={week && "total" in week ? `${week.hadir}/${week.total} catatan` : "belum ada catatan"}
							tone={weekPct !== null && weekPct >= 80 ? "success" : "default"}
						/>
					</div>

					{/* Tagihan & jatuh tempo */}
					{invoices.length > 0 ? (
						<Card>
							<CardHeader className="flex-row items-center justify-between space-y-0">
								<CardTitle className="flex items-center gap-2 text-base">
									<Receipt className="size-4.5 text-brand-blue-600" />
									Tagihan &amp; Jatuh Tempo
								</CardTitle>
								<Link href="/orang-tua/pembayaran">
									<Button size="sm">Bayar Sekarang</Button>
								</Link>
							</CardHeader>
							<CardContent className="flex flex-col gap-2">
								{invoices.map((i) => {
									const late = i.dueDate ? new Date(i.dueDate) < now : false;
									return (
										<div key={i.id} className="flex items-center justify-between gap-2 text-sm">
											<span className="min-w-0 truncate">
												<span className="font-medium">{i.number}</span>
												<span className="text-muted-foreground">
													{" "}
													— {i.studentName}
													{i.program ? ` · ${i.program}` : ""}
												</span>
											</span>
											<span className="flex shrink-0 items-center gap-2">
												<span className="text-xs text-muted-foreground whitespace-nowrap">
													{i.dueDate ? `tempo ${new Date(i.dueDate).toLocaleDateString("id-ID")}` : "tanpa tempo"}
												</span>
												{late ? <Badge variant="destructive">Lewat tempo</Badge> : null}
												<span className="font-medium tabular-nums">{rupiah(i.sisa)}</span>
											</span>
										</div>
									);
								})}
							</CardContent>
						</Card>
					) : null}

					<div className="grid gap-3 lg:grid-cols-2">
						{/* Sesi anak minggu ini */}
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2 text-base">
									<CalendarClock className="size-4.5 text-brand-blue-600" />
									Sesi Anak Minggu Ini
								</CardTitle>
							</CardHeader>
							<CardContent className="flex flex-col gap-2">
								{sessions.length === 0 ? (
									<p className="text-sm text-muted-foreground">Tidak ada sesi minggu ini.</p>
								) : null}
								{sessions.map((s) => (
									<div key={s.id} className="flex items-center justify-between gap-2 text-sm">
										<span className="min-w-0">
											<span className="block truncate font-medium">
												{s.childNames?.length ? s.childNames.join(", ") : s.group.name}
												<span className="font-normal text-muted-foreground"> — {s.group.name}</span>
											</span>
											<span className="block truncate text-xs text-muted-foreground">
												{fmtDateTime(s.startsAt)}
												{s.tutor ? ` · ${s.tutor.user.name}` : ""}
												{s.room ? ` · ${s.room.name}` : ""}
											</span>
										</span>
										<Badge variant={sessionVariant(s.status)}>{s.status}</Badge>
									</div>
								))}
								<Link href="/orang-tua/jadwal" className="mt-1 text-xs font-medium text-primary hover:underline">
									Lihat kalender lengkap →
								</Link>
							</CardContent>
						</Card>

						{/* Performa anak minggu ini */}
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2 text-base">
									<ChartColumn className="size-4.5 text-brand-blue-600" />
									Performa Anak Minggu Ini
								</CardTitle>
							</CardHeader>
							<CardContent className="flex flex-col gap-3">
								{perf.length === 0 ? (
									<p className="text-sm text-muted-foreground">Belum ada data anak.</p>
								) : null}
								{perf.map((c) => (
									<div key={c.studentId} className="flex flex-col gap-1">
										<div className="flex items-center justify-between gap-2 text-sm">
											<span className="flex min-w-0 items-center gap-1.5 truncate">
												<GraduationCap className="size-3.5 shrink-0 text-muted-foreground" />
												{c.name}
											</span>
											<span className="shrink-0 text-xs tabular-nums text-muted-foreground">
												{c.pct !== null ? `${c.pct}% hadir (${c.hadir}/${c.total})` : "belum ada sesi"}
											</span>
										</div>
										<div className="h-1.5 overflow-hidden rounded-full bg-muted">
											<div
												className={cn(
													"h-full rounded-full",
													c.pct === null
														? "bg-muted"
														: c.pct >= 80
															? "bg-success-500"
															: c.pct >= 50
																? "bg-warning-500"
																: "bg-destructive",
												)}
												style={{ width: `${c.pct ?? 0}%` }}
											/>
										</div>
									</div>
								))}
								<Link href="/orang-tua/performa-anak" className="mt-1 text-xs font-medium text-primary hover:underline">
									Detail performa &amp; ranking →
								</Link>
							</CardContent>
						</Card>
					</div>

					{sessions.length === 0 && invoices.length === 0 && perf.length === 0 ? (
						<Card>
							<CardContent>
								<EmptyState
									icon={ChartColumn}
									title="Belum ada ringkasan"
									description="Data anak Anda akan muncul setelah terdaftar di kelompok."
								/>
							</CardContent>
						</Card>
					) : null}
				</>
			) : null}
		</div>
	);
}
