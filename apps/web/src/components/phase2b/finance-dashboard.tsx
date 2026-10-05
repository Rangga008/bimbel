"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
	ArrowDownToLine,
	ArrowUpFromLine,
	Bell,
	ChartColumn,
	ClipboardList,
	GraduationCap,
	Landmark,
	Printer,
	Receipt,
	TriangleAlert,
	Users,
	Wallet,
	type LucideIcon,
} from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/shared/kpi-card";
import { fmtDateTime } from "@/lib/phase1c-types";
import type { HomeData } from "@/lib/home-types";
import { rupiah } from "@/components/phase2a/invoices-manager";

interface Cmp {
	current: number;
	previous: number;
	pct: number | null;
}
interface Analytics {
	comparison: {
		revenue: Cmp;
		billed: Cmp;
		newStudents: Cmp;
		sessionsCompleted: Cmp;
		expenses: Cmp;
		attendanceRate: { current: number | null; previous: number | null; points: number | null };
	};
	yearly: Record<string, Cmp | unknown>;
	monthly: Array<{
		month: string;
		label: string;
		revenue: number;
		expenses: number;
		newStudents: number;
		sessionsCompleted: number;
		attendanceRate: number | null;
	}>;
}

interface CompanyInfo {
	name?: string;
	address?: string;
	phone?: string;
	email?: string;
	logoUrl?: string;
}

function esc(s: string) {
	return String(s)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function deltaBadge(pct: number | null) {
	if (pct === null || pct === undefined) return null;
	const up = pct >= 0;
	return (
		<span className={cn("text-xs font-medium", up ? "text-emerald-600" : "text-destructive")}>
			{up ? "+" : ""}{pct}% vs bln lalu
		</span>
	);
}

/** Resume HTML siap print-to-PDF — KPI, bulanan, piutang, RAB. */
function buildResumeHtml(data: HomeData, a: Analytics | null, company: CompanyInfo | null): string {
	const f = data.finance;
	const cmp = a?.comparison;
	const monthRows = (a?.monthly ?? [])
		.map(
			(m) =>
				`<tr><td>${esc(m.label)}</td><td style="text-align:right">${rupiah(m.revenue)}</td><td style="text-align:right">${rupiah(m.expenses)}</td><td style="text-align:right">${rupiah(m.revenue - m.expenses)}</td><td style="text-align:right">${m.newStudents}</td><td style="text-align:right">${m.sessionsCompleted}</td></tr>`,
		)
		.join("");
	const kpiRow = (label: string, value: string, delta?: number | null) =>
		`<tr><td>${esc(label)}</td><td style="text-align:right"><b>${esc(value)}</b></td><td style="text-align:right">${
			delta === null || delta === undefined ? "—" : `${delta >= 0 ? "+" : ""}${delta}%`
		}</td></tr>`;
	return `<!doctype html><html><head><meta charset="utf-8"><title>Resume Keuangan</title><style>
body{font-family:Arial,sans-serif;margin:28px;color:#111;font-size:12px}
h1{font-size:18px;margin:0}h2{font-size:14px;margin:18px 0 6px}
.meta{font-size:11px;color:#555;margin:4px 0 14px}
table{border-collapse:collapse;width:100%;font-size:11px;margin-top:4px}
th,td{border:1px solid #999;padding:4px 6px;text-align:left}
th{background:#eee}
.hdr{display:flex;align-items:center;gap:12px;border-bottom:2px solid #111;padding-bottom:10px}
.hdr img{height:44px}
.neg{color:#b91c1c}
</style></head><body>
<div class="hdr">
${company?.logoUrl ? `<img src="${esc(company.logoUrl)}" alt="logo"/>` : ""}
<div><h1>${esc(company?.name ?? "Bimbel")}</h1>
<div class="meta">${esc(company?.address ?? "")}${company?.phone ? ` · ${esc(company.phone)}` : ""}${company?.email ? ` · ${esc(company.email)}` : ""}</div></div>
</div>
<h2>Resume Kinerja Keuangan &amp; Pendaftaran</h2>
<p class="meta">Digenerate: ${new Date().toLocaleString("id-ID")} · Periode berjalan: ${esc(f?.period ?? "-")}</p>
<h2>KPI Bulan Ini</h2>
<table><thead><tr><th>Metrik</th><th>Nilai</th><th>vs Bulan Lalu</th></tr></thead><tbody>
${kpiRow("Pendapatan terverifikasi", rupiah(cmp?.revenue.current ?? 0), cmp?.revenue.pct)}
${kpiRow("Tagihan diterbitkan (billed)", rupiah(cmp?.billed.current ?? 0), cmp?.billed.pct)}
${kpiRow("Pengeluaran", rupiah(cmp?.expenses.current ?? 0), cmp?.expenses.pct)}
${kpiRow("Pendaftaran siswa baru", String(cmp?.newStudents.current ?? 0), cmp?.newStudents.pct)}
${kpiRow("Sesi selesai", String(cmp?.sessionsCompleted.current ?? 0), cmp?.sessionsCompleted.pct)}
${kpiRow("Outstanding piutang", rupiah(f?.outstandingTotal ?? 0))}
${kpiRow("Invoice overdue", String(f?.overdueCount ?? 0))}
${kpiRow("Bukti menunggu verifikasi", String(f?.pendingProofs ?? 0))}
${kpiRow("Saldo kas/bank", rupiah(f?.cashBalance ?? 0))}
${kpiRow("RAB terpakai", `${rupiah(f?.rabActual ?? 0)} / ${rupiah(f?.rabBudget ?? 0)}`)}
</tbody></table>
<h2>12 Bulan Terakhir</h2>
<table><thead><tr><th>Bulan</th><th>Pendapatan</th><th>Pengeluaran</th><th>Selisih</th><th>Siswa Baru</th><th>Sesi Selesai</th></tr></thead><tbody>
${monthRows || `<tr><td colspan="6" style="text-align:center;color:#666">Belum ada data</td></tr>`}
</tbody></table>
<p class="meta" style="margin-top:16px">Dokumen ini digenerate otomatis dari sistem — data per tanggal cetak.</p>
</body></html>`;
}

/** Bar chart CSS sederhana — revenue vs expenses per bulan (12 bulan). */
function MonthlyBars({ monthly }: { monthly: Analytics["monthly"] }) {
	const max = Math.max(1, ...monthly.map((m) => Math.max(m.revenue, m.expenses)));
	return (
		<div className="flex items-end gap-2 overflow-x-auto pb-1">
			{monthly.map((m) => (
				<div key={m.month} className="flex min-w-10 flex-1 flex-col items-center gap-1">
					<div className="flex h-32 w-full items-end justify-center gap-1">
						<div
							className="w-3.5 rounded-t bg-emerald-500"
							style={{ height: `${Math.max(2, (m.revenue / max) * 100)}%` }}
							title={`Masuk ${rupiah(m.revenue)}`}
						/>
						<div
							className="w-3.5 rounded-t bg-rose-400"
							style={{ height: `${Math.max(2, (m.expenses / max) * 100)}%` }}
							title={`Keluar ${rupiah(m.expenses)}`}
						/>
					</div>
					<span className="text-[10px] text-muted-foreground">{m.label}</span>
				</div>
			))}
		</div>
	);
}

/** Bar berpasangan bulan ini vs bulan lalu untuk satu metrik. */
function CmpBar({ label, current, previous, money }: { label: string; current: number; previous: number; money: boolean }) {
	const max = Math.max(1, current, previous);
	const fmt = (v: number) => (money ? rupiah(v) : String(v));
	return (
		<div className="flex flex-col gap-1">
			<div className="flex items-center justify-between text-xs">
				<span className="text-muted-foreground">{label}</span>
				<span className="tabular-nums">
					<b>{fmt(current)}</b>
					<span className="text-muted-foreground"> vs {fmt(previous)}</span>
				</span>
			</div>
			<div className="flex flex-col gap-0.5">
				<div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
					<div className="h-full rounded-full bg-brand-blue-500" style={{ width: `${Math.max(1, (current / max) * 100)}%` }} />
				</div>
				<div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
					<div className="h-full rounded-full bg-muted-foreground/40" style={{ width: `${Math.max(1, (previous / max) * 100)}%` }} />
				</div>
			</div>
		</div>
	);
}

/** Dashboard Admin Finance — KPI, grafik performa perusahaan, resume PDF. */
export function FinanceDashboard() {
	const [busyPrint, setBusyPrint] = useState(false);
	const { data, isLoading, isError } = useQuery({
		queryKey: ["dashboard", "/dashboard/admin-finance"],
		queryFn: () => apiFetch<HomeData>("/dashboard/admin-finance"),
	});
	const analyticsQ = useQuery({
		queryKey: ["dashboard", "/dashboard/admin-finance/analytics"],
		queryFn: () => apiFetch<Analytics>("/dashboard/admin-finance/analytics"),
	});

	const finance = data?.finance;
	const cmp = analyticsQ.data?.comparison;
	const monthly = analyticsQ.data?.monthly ?? [];
	const counts = data?.counts ?? {};
	const sessions = data?.upcomingSessions ?? [];

	async function downloadResume() {
		const win = window.open("", "_blank", "width=920,height=700");
		if (!win) {
			toast.error("Popup diblokir browser — izinkan popup untuk mengunduh resume.");
			return;
		}
		setBusyPrint(true);
		try {
			const company = await apiFetch<CompanyInfo>("/company-info").catch(() => null);
			win.document.open();
			win.document.write(buildResumeHtml(data ?? ({} as HomeData), analyticsQ.data ?? null, company));
			win.document.close();
			win.focus();
			setTimeout(() => win.print(), 300);
		} catch (e) {
			toast.error(e instanceof ApiError ? e.message : "Gagal menyiapkan resume.");
			win.close();
		} finally {
			setBusyPrint(false);
		}
	}

	return (
		<div className="flex flex-col gap-5">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h1 className="text-2xl font-semibold tracking-tight">Dashboard Finance</h1>
					{data?.user ? (
						<p className="mt-0.5 text-sm text-muted-foreground">
							Halo, {data.user} — ringkasan kinerja keuangan &amp; pendaftaran.
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
					<Button variant="outline" size="sm" onClick={downloadResume} disabled={busyPrint || !data}>
						<Printer className="size-4" />
						{busyPrint ? "Menyiapkan..." : "Download Resume (PDF)"}
					</Button>
				</div>
			</div>

			{isLoading ? <Skeleton className="h-24 w-full" /> : null}
			{isError ? (
				<Card>
					<CardContent className="py-10 text-center text-sm text-destructive">
						Gagal memuat dashboard — cek permission akun Anda.
					</CardContent>
				</Card>
			) : null}

			{data ? (
				<>
					{/* KPI bisnis */}
					<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
						<KpiCard icon={ArrowDownToLine} label="Pendapatan Bulan Ini" value={rupiah(cmp?.revenue.current ?? 0)} tone="success" />
						<KpiCard icon={ArrowUpFromLine} label="Pengeluaran Bulan Ini" value={rupiah(cmp?.expenses.current ?? 0)} />
						<KpiCard icon={GraduationCap} label="Pendaftaran Baru" value={cmp?.newStudents.current ?? 0} hint="siswa bulan ini" />
						<KpiCard icon={ClipboardList} label="Sesi Selesai" value={cmp?.sessionsCompleted.current ?? 0} hint="bulan ini" />
						<KpiCard icon={Wallet} label="Outstanding" value={rupiah(finance?.outstandingTotal ?? 0)} hint={`${finance?.issuedCount ?? 0} invoice terbit`} tone="warning" />
						<KpiCard icon={TriangleAlert} label="Invoice Overdue" value={finance?.overdueCount ?? 0} hint="lewat jatuh tempo" tone={finance && finance.overdueCount > 0 ? "danger" : "default"} />
						<KpiCard icon={Receipt} label="Bukti Pending" value={finance?.pendingProofs ?? 0} hint="menunggu verifikasi" tone={finance && finance.pendingProofs > 0 ? "warning" : "default"} />
						<KpiCard icon={Landmark} label="Saldo Kas/Bank" value={rupiah(finance?.cashBalance ?? 0)} hint={`${finance?.accountCount ?? 0} akun aktif`} />
					</div>

					{/* Grafik */}
					<div className="grid gap-3 lg:grid-cols-2">
						<Card>
							<CardHeader className="pb-2">
								<CardTitle className="flex items-center gap-2 text-base">
									<ChartColumn className="size-4.5 text-brand-blue-600" />
									Arus Kas — 12 Bulan
								</CardTitle>
							</CardHeader>
							<CardContent className="flex flex-col gap-2">
								{analyticsQ.isLoading ? <Skeleton className="h-32 w-full" /> : <MonthlyBars monthly={monthly} />}
								<div className="flex items-center gap-4 text-xs text-muted-foreground">
									<span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-emerald-500" /> Pendapatan</span>
									<span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-rose-400" /> Pengeluaran</span>
								</div>
							</CardContent>
						</Card>
						<Card>
							<CardHeader className="pb-2">
								<CardTitle className="flex items-center gap-2 text-base">
									<Users className="size-4.5 text-brand-blue-600" />
									Pendaftaran Siswa Baru — 12 Bulan
								</CardTitle>
							</CardHeader>
							<CardContent className="flex flex-col gap-2">
								{analyticsQ.isLoading ? (
									<Skeleton className="h-32 w-full" />
								) : (
									<div className="flex items-end gap-2 overflow-x-auto pb-1">
										{monthly.map((m) => {
											const maxS = Math.max(1, ...monthly.map((x) => x.newStudents));
											return (
												<div key={m.month} className="flex min-w-10 flex-1 flex-col items-center gap-1">
													<span className="text-[10px] font-medium tabular-nums">{m.newStudents}</span>
													<div className="flex h-24 w-full items-end justify-center">
														<div
															className="w-5 rounded-t bg-brand-blue-500"
															style={{ height: `${Math.max(2, (m.newStudents / maxS) * 100)}%` }}
														/>
													</div>
													<span className="text-[10px] text-muted-foreground">{m.label}</span>
												</div>
											);
										})}
									</div>
								)}
							</CardContent>
						</Card>
					</div>

					{/* Perbandingan bulan lalu + RAB */}
					<div className="grid gap-3 lg:grid-cols-2">
						<Card>
							<CardHeader className="pb-2">
								<CardTitle className="text-base">Perbandingan vs Bulan Lalu</CardTitle>
							</CardHeader>
							<CardContent className="flex flex-col gap-3 text-sm">
								{[
									{ label: "Pendapatan", cur: cmp?.revenue.current ?? 0, prev: cmp?.revenue.previous ?? 0, pct: cmp?.revenue.pct ?? null, money: true },
									{ label: "Tagihan diterbitkan", cur: cmp?.billed.current ?? 0, prev: cmp?.billed.previous ?? 0, pct: cmp?.billed.pct ?? null, money: true },
									{ label: "Pengeluaran", cur: cmp?.expenses.current ?? 0, prev: cmp?.expenses.previous ?? 0, pct: cmp?.expenses.pct ?? null, money: true },
									{ label: "Pendaftaran baru", cur: cmp?.newStudents.current ?? 0, prev: cmp?.newStudents.previous ?? 0, pct: cmp?.newStudents.pct ?? null, money: false },
									{ label: "Sesi selesai", cur: cmp?.sessionsCompleted.current ?? 0, prev: cmp?.sessionsCompleted.previous ?? 0, pct: cmp?.sessionsCompleted.pct ?? null, money: false },
								].map((r) => (
									<div key={r.label} className="flex flex-col gap-1">
										<CmpBar label={r.label} current={r.cur} previous={r.prev} money={r.money} />
										<span className="self-end">{deltaBadge(r.pct)}</span>
									</div>
								))}
								<div className="flex items-center gap-4 border-t pt-2 text-xs text-muted-foreground">
									<span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-brand-blue-500" /> Bulan ini</span>
									<span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-muted-foreground/40" /> Bulan lalu</span>
								</div>
							</CardContent>
						</Card>
						<Card>
							<CardHeader className="pb-2">
								<CardTitle className="text-base">RAB vs Actual — {finance?.period}</CardTitle>
							</CardHeader>
							<CardContent className="flex flex-col gap-2">
								<p className="text-xl font-semibold tabular-nums">
									{rupiah(finance?.rabActual ?? 0)}{" "}
									<span className="text-sm font-normal text-muted-foreground">/ {rupiah(finance?.rabBudget ?? 0)}</span>
								</p>
								<div className="h-1.5 overflow-hidden rounded-full bg-muted">
									<div
										className={cn("h-full rounded-full", (finance?.rabRemaining ?? 0) < 0 ? "bg-destructive" : "bg-brand-blue-500")}
										style={{ width: `${Math.min(100, finance && finance.rabBudget > 0 ? (finance.rabActual / finance.rabBudget) * 100 : 0)}%` }}
									/>
								</div>
								<p className={cn("text-xs tabular-nums", (finance?.rabRemaining ?? 0) < 0 ? "font-medium text-destructive" : "text-muted-foreground")}>
									Sisa RAB: {rupiah(finance?.rabRemaining ?? 0)}
								</p>
							</CardContent>
						</Card>
					</div>

					{/* Sesi terdekat */}
					{sessions.length > 0 ? (
						<Card>
							<CardHeader className="pb-2">
								<CardTitle className="text-base">Sesi Terdekat (7 hari)</CardTitle>
							</CardHeader>
							<CardContent className="flex flex-col gap-2 text-sm">
								{sessions.slice(0, 6).map((s) => (
									<div key={s.id} className="flex items-center justify-between gap-2">
										<span className="truncate">{s.group.name} — {fmtDateTime(s.startsAt)}</span>
										<Badge variant={s.status === "CANCELLED" ? "destructive" : "secondary"}>{s.status}</Badge>
									</div>
								))}
							</CardContent>
						</Card>
					) : null}
				</>
			) : null}
		</div>
	);
}
