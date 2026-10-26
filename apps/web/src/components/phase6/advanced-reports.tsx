"use client";
// Fase 6 — Laporan lanjutan lintas modul: picker jenis laporan, filter,
// render tabel generik (ReportDoc), export Excel/PDF, snapshot arsip beku.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, apiFetchBlob } from "@/lib/api-client";
import { toast } from "sonner";
import { FileDown } from "lucide-react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Phase1aSelectField } from "@/components/phase1a/phase1a-form-dialog";
import { useAuthStore } from "@/stores/auth-store";
import { LearningReportPage } from "@/components/shared/learning-report-page";
import type {
	ReportDoc,
	ReportKind,
	ReportKindMeta,
	ReportSnapshotDetail,
	ReportSnapshotItem,
} from "@/lib/phase6-types";

interface ProgramOpt {
	id: string;
	name: string;
	code: string | null;
	levels: Array<{ id: string; name: string }>;
}
interface GroupOpt {
	id: string;
	name: string;
	code: string | null;
	programId: string;
	levelId: string | null;
}
interface PersonOpt {
	id: string;
	user: { name: string; avatarUrl?: string | null };
}

// Status dipisah per domain — finance hanya status invoice/pembayaran,
// academic/operasional hanya status absensi & sesi (tidak ada CASH/dkk).
const FINANCE_STATUS_OPTIONS = [
	{ value: "PAID", label: "Invoice: PAID" },
	{ value: "PARTIAL", label: "Invoice: PARTIAL" },
	{ value: "UNPAID", label: "Invoice: UNPAID" },
	{ value: "ISSUED", label: "Invoice: ISSUED" },
	{ value: "VOID", label: "Invoice: VOID" },
	{ value: "VERIFIED", label: "Pembayaran: VERIFIED" },
	{ value: "PENDING", label: "Pembayaran: PENDING" },
	{ value: "REJECTED", label: "Pembayaran: REJECTED" },
];

const ACADEMIC_STATUS_OPTIONS = [
	{ value: "HADIR", label: "Absensi: HADIR" },
	{ value: "TERLAMBAT", label: "Absensi: TERLAMBAT" },
	{ value: "IZIN", label: "Absensi: IZIN" },
	{ value: "SAKIT", label: "Absensi: SAKIT" },
	{ value: "ALFA", label: "Absensi: ALFA" },
	{ value: "COMPLETED", label: "Sesi: COMPLETED" },
	{ value: "SCHEDULED", label: "Sesi: SCHEDULED" },
	{ value: "CANCELLED", label: "Sesi: CANCELLED" },
];

const CHANNEL_OPTIONS = [
	{ value: "CASH", label: "CASH (tunai)" },
	{ value: "MANUAL", label: "MANUAL (transfer)" },
	{ value: "GATEWAY", label: "GATEWAY (Midtrans)" },
];

const API_BASE_URL =
	process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api";

const DOMAIN_ORDER = ["Keuangan", "Operasional", "Akademik"];

interface ActiveFilters {
	period: string;
	from: string;
	to: string;
	programId: string;
	levelId: string;
	groupId: string;
	studentId: string;
	tutorId: string;
	status: string;
	channel: string;
	search: string;
}

function filterQuery(f: ActiveFilters) {
	const params = new URLSearchParams();
	if (f.period) params.set("period", f.period);
	if (f.from) params.set("from", f.from);
	if (f.to) params.set("to", f.to);
	if (f.programId) params.set("programId", f.programId);
	if (f.levelId) params.set("levelId", f.levelId);
	if (f.groupId) params.set("groupId", f.groupId);
	if (f.studentId) params.set("studentId", f.studentId);
	if (f.tutorId) params.set("tutorId", f.tutorId);
	if (f.status) params.set("status", f.status);
	if (f.channel) params.set("channel", f.channel);
	if (f.search) params.set("search", f.search);
	return params.toString();
}


const CHART_PALETTE = [
	"#0f4c81", "#e8a020", "#2e8b57", "#b03a48", "#6b5b95",
	"#3a9ab2", "#c9711b", "#5b7f3c", "#8c4a7f", "#777777",
];

type ChartItem = { label: string; value: number; color?: string };

/** Pie/donut SVG murni (tanpa lib) — samakan warna dengan export Excel/PDF. */
function PieChart({ items, size = 150 }: { items: ChartItem[]; size?: number }) {
	const list = items.filter((i) => i.value > 0);
	const total = list.reduce((s, i) => s + i.value, 0);
	if (!list.length || total <= 0) {
		return <p className="text-xs text-muted-foreground">Tidak ada data.</p>;
	}
	const r = size / 2;
	const inner = r * 0.55;
	let angle = -Math.PI / 2;
	const wedges = list.map((it, idx) => {
		const frac = it.value / total;
		const a0 = angle;
		const a1 = angle + frac * Math.PI * 2;
		angle = a1;
		const large = a1 - a0 > Math.PI ? 1 : 0;
		const pt = (a: number, rad: number) =>
			`${(r + rad * Math.cos(a)).toFixed(2)} ${(r + rad * Math.sin(a)).toFixed(2)}`;
		return {
			d: `M ${pt(a0, r)} A ${r} ${r} 0 ${large} 1 ${pt(a1, r)} L ${pt(a1, inner)} A ${inner} ${inner} 0 ${large} 0 ${pt(a0, inner)} Z`,
			color: it.color ?? CHART_PALETTE[idx % CHART_PALETTE.length],
			it,
		};
	});
	return (
		<div className="flex flex-wrap items-center gap-4">
			<svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
				{wedges.map((w, i) => (
					<path key={i} d={w.d} fill={w.color} stroke="#fff" strokeWidth={1} />
				))}
			</svg>
			<ul className="flex flex-col gap-1 text-xs">
				{wedges.map((w, i) => (
					<li key={i} className="flex items-center gap-2">
						<span className="inline-block size-2.5 rounded-sm" style={{ background: w.color }} />
						<span className="min-w-28">{w.it.label}</span>
						<span className="tabular-nums text-muted-foreground">
							{Math.round((w.it.value / total) * 1000) / 10}%
						</span>
					</li>
				))}
			</ul>
		</div>
	);
}

/** Bar horizontal sederhana untuk chart bertipe 'bar'. */
function BarChart({ items, maxValue }: { items: { label: string; value: number; color?: string }[]; maxValue?: number }) {
	const list = items.filter((i) => i.value > 0);
	const max = maxValue ?? Math.max(...list.map((i) => i.value), 1);
	return (
		<div className="flex flex-col gap-1.5">
			{list.map((it, i) => (
				<div key={i} className="flex items-center gap-2 text-xs">
					<span className="w-36 truncate" title={it.label}>{it.label}</span>
					<div className="h-3.5 flex-1 rounded bg-muted">
						<div
							className="h-full rounded"
							style={{
								width: `${Math.max(2, (it.value / max) * 100)}%`,
								background: it.color ?? CHART_PALETTE[i % CHART_PALETTE.length],
							}}
						/>
					</div>
					<span className="w-14 text-right tabular-nums">{it.value}</span>
				</div>
			))}
		</div>
	);
}

function ReportDataTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
	return (
		<div className="overflow-x-auto rounded-xl border">
			<table className="w-full text-left text-xs">
				<thead>
					<tr className="border-b bg-muted">
						{headers.map((h) => (
							<th key={h} className="px-3 py-2 font-medium whitespace-nowrap">
								{h}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{rows.length === 0 ? (
						<tr>
							<td
								colSpan={headers.length}
								className="px-2 py-6 text-center text-muted-foreground"
							>
								Belum ada data untuk filter ini.
							</td>
						</tr>
					) : (
						rows.map((row, i) => (
							<tr key={i} className="border-b transition-colors last:border-0 hover:bg-muted/50">
								{row.map((cell, j) => (
									<td key={j} className="px-3 py-2 whitespace-pre-line tabular-nums align-top">
										{cell}
									</td>
								))}
							</tr>
						))
					)}
				</tbody>
			</table>
		</div>
	);
}

/** Render ReportDoc generik — aman untuk dataset kosong. */
function ReportTable({ doc }: { doc: ReportDoc }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-sm font-medium">
					{doc.title} — {doc.periodLabel}
				</CardTitle>
				<p className="text-xs text-muted-foreground">
					{doc.filterText} · Digenerate {new Date(doc.generatedAt).toLocaleString("id-ID")}
				</p>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				{doc.description ? (
					<p className="rounded-lg border bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
						{doc.description}
					</p>
				) : null}
				{doc.charts?.map((c) => (
					<div key={c.title} className="flex flex-col gap-2">
						<p className="text-xs font-semibold">{c.title}</p>
						{c.type === "pie" ? (
							<PieChart items={c.items} />
						) : (
							<BarChart items={c.items} />
						)}
					</div>
				))}
				{doc.sections?.length ? (
					<div className="flex flex-col gap-4">
						{doc.sections.map((sec, i) => (
							<div key={i} className="flex flex-col gap-1.5">
								<div>
									<p className="text-sm font-semibold text-brand-blue-800">{sec.title}</p>
									{sec.note ? (
										<p className="text-xs text-muted-foreground">{sec.note}</p>
									) : null}
								</div>
								<ReportDataTable headers={sec.headers} rows={sec.rows} />
							</div>
						))}
					</div>
				) : (
					<ReportDataTable headers={doc.headers} rows={doc.rows} />
				)}
				{doc.summaryLines.length > 0 ? (
					<div className="flex flex-wrap gap-2">
						{doc.summaryLines.map((s) => (
							<Badge key={s} variant="secondary" className="font-normal">
								{s}
							</Badge>
						))}
					</div>
				) : null}
			</CardContent>
		</Card>
	);
}

export function AdvancedReportsManager() {
	const queryClient = useQueryClient();
	const [kind, setKind] = useState<ReportKind | null>(null);
	const [filters, setFilters] = useState<ActiveFilters>({
		period: new Date().toISOString().slice(0, 7),
		from: "",
		to: "",
		programId: "",
		levelId: "",
		groupId: "",
		studentId: "",
		tutorId: "",
		status: "",
		channel: "",
		search: "",
	});
	// Rentang bulan (mis. tahun ajaran Jul 2025–Jun 2026, 1–2 semester) —
	// diterjemahkan ke filters.from/to (tanggal 1 s.d. akhir bulan).
	const [monthFrom, setMonthFrom] = useState("");
	const [monthTo, setMonthTo] = useState("");
	const applyMonthRange = (from: string, to: string) => {
		setMonthFrom(from);
		setMonthTo(to);
		setFilters((f) => {
			const next = { ...f, period: "" };
			if (from) next.from = `${from}-01`;
			if (to) {
				const [y, m] = to.split("-").map((s) => parseInt(s, 10));
				const lastDay = new Date(y, m, 0).getDate();
				next.to = `${to}-${String(lastDay).padStart(2, "0")}`;
			}
			if (!from && !to) {
				next.from = "";
				next.to = "";
			}
			return next;
		});
	};
	const [snapshotTitle, setSnapshotTitle] = useState("");
	const [snapshotToDelete, setSnapshotToDelete] =
		useState<ReportSnapshotItem | null>(null);
	const [viewSnapshot, setViewSnapshot] = useState<ReportSnapshotDetail | null>(
		null,
	);

	const kindsQ = useQuery({
		queryKey: ["report-kinds"],
		queryFn: () => apiFetch<ReportKindMeta[]>("/reports/kinds"),
	});

	// Opsi dropdown filter — semua read-only list yang sudah ada.
	const stale = { staleTime: 5 * 60 * 1000, retry: 1 };
	const programsQ = useQuery({
		queryKey: ["report-opt-programs"],
		queryFn: () => apiFetch<ProgramOpt[]>("/programs/options"),
		...stale,
	});
	const groupsQ = useQuery({
		queryKey: ["report-opt-groups"],
		queryFn: () => apiFetch<GroupOpt[]>("/groups"),
		...stale,
	});
	const studentsQ = useQuery({
		queryKey: ["report-opt-students"],
		queryFn: () => apiFetch<PersonOpt[]>("/students"),
		...stale,
	});
	const tutorsQ = useQuery({
		queryKey: ["report-opt-tutors"],
		queryFn: () => apiFetch<PersonOpt[]>("/tutors"),
		...stale,
	});

	// Default = laporan pertama dalam cakupan role user (bukan hardcode
	// "invoice" — role non-finance akan 403 kalau dipaksa ke domain lain).
	const activeKind = kind ?? kindsQ.data?.[0]?.kind;
	const activeDomain =
		kindsQ.data?.find((k) => k.kind === activeKind)?.domain ?? null;
	const isFinanceDomain = activeDomain === "Keuangan";
	const statusOptions = isFinanceDomain
		? FINANCE_STATUS_OPTIONS
		: ACADEMIC_STATUS_OPTIONS;

	const docQ = useQuery({
		queryKey: ["report-doc", activeKind, filters],
		queryFn: () =>
			apiFetch<ReportDoc>(`/reports/${activeKind}?${filterQuery(filters)}`),
		enabled: Boolean(activeKind),
	});

	const snapshotsQ = useQuery({
		queryKey: ["report-snapshots"],
		queryFn: () =>
			apiFetch<{ total: number; data: ReportSnapshotItem[] }>(
				"/reports/snapshots",
			),
	});

	const snapshotMut = useMutation({
		mutationFn: () =>
			apiFetch<ReportSnapshotItem>("/reports/snapshots", {
				method: "POST",
				body: {
					kind: activeKind,
					title: snapshotTitle || undefined,
					...filters,
				},
			}),
		onSuccess: () => {
			setSnapshotTitle("");
			queryClient.invalidateQueries({ queryKey: ["report-snapshots"] });
		},
	});

	const deleteSnapshotMut = useMutation({
		mutationFn: (id: string) =>
			apiFetch(`/reports/snapshots/${id}`, { method: "DELETE" }),
		onSuccess: () => {
			setSnapshotToDelete(null);
			queryClient.invalidateQueries({ queryKey: ["report-snapshots"] });
		},
	});

	const openSnapshot = async (id: string) => {
		const snap = await apiFetch<ReportSnapshotDetail>(
			`/reports/snapshots/${id}`,
		);
		setViewSnapshot(snap);
	};

	const levelOptions =
		(filters.programId
			? programsQ.data?.find((p) => p.id === filters.programId)?.levels
			: programsQ.data?.flatMap((p) => p.levels)) ?? [];

	// Export mengikuti filter aktif — Excel/CSV terunduh, "PDF" berupa HTML
	// siap-print yang dibuka di tab baru (auto window.print → Save as PDF).
	const exportReport = async (ext: "xlsx" | "csv" | "pdf") => {
		if (!activeKind) return;
		// Buka tab SEKARANG (masih dalam gesture klik) — kalau ditunggu sampai
		// fetch selesai, window.open kerap diblokir popup blocker browser.
		const pdfTab =
			ext === "pdf" ? window.open("", "_blank", "noopener") : null;
		if (ext === "pdf" && !pdfTab) {
			toast.error(
				"Tab baru diblokir browser — izinkan popup untuk mencetak/menyimpan PDF.",
			);
			return;
		}
		if (pdfTab) {
			pdfTab.document.title = "Menyiapkan laporan…";
			pdfTab.document.body.innerHTML =
				'<p style="font-family:sans-serif;color:#555;padding:24px">Menyiapkan dokumen laporan…</p>';
		}
		try {
			const qs = filterQuery(filters);
			const blob = await apiFetchBlob(
				`/reports/${activeKind}/export.${ext}${qs ? `?${qs}` : ""}`,
			);
			const url = URL.createObjectURL(blob);
			if (ext === "pdf") {
				pdfTab!.location.href = url;
				return;
			}
			const a = document.createElement("a");
			a.href = url;
			a.download = `${docQ.data?.fileBase ?? `laporan-${activeKind}`}.${ext}`;
			a.click();
			URL.revokeObjectURL(url);
		} catch (e) {
			pdfTab?.close();
			toast.error(e instanceof Error ? e.message : "Gagal export laporan.");
		}
	};
	const groupOptions = (groupsQ.data ?? []).filter(
		(g) =>
			(!filters.programId || g.programId === filters.programId) &&
			(!filters.levelId || g.levelId === filters.levelId),
	);

	const groupedKinds = DOMAIN_ORDER.map((domain) => ({
		domain,
		kinds: (kindsQ.data ?? []).filter((k) => k.domain === domain),
	})).filter((g) => g.kinds.length > 0);

	const inputCls = "h-9 rounded-md border border-input bg-background px-2 text-sm";
	const canStudentReport =
		useAuthStore((s) =>
			s.user?.permissions.includes("analytics_student_performance.view"),
		) ?? false;

	return (
		<div className="flex flex-col gap-4">
			<div>
				<h1 className="text-2xl font-semibold tracking-tight">
					Laporan Lanjutan
				</h1>
				<p className="text-sm text-muted-foreground">
					Laporan lintas modul (keuangan, operasional, akademik) ditampilkan langsung.
				</p>
			</div>

			{canStudentReport ? <LearningReportPage audience="staff" /> : null}

			<Card>
				<CardContent className="flex flex-col gap-3 py-4">
					<div className="flex flex-wrap gap-4">
						{groupedKinds.map((g) => (
							<div key={g.domain} className="flex flex-col gap-1">
								<span className="text-xs font-medium text-muted-foreground">
									{g.domain}
								</span>
								<div className="flex flex-wrap gap-1">
									{g.kinds.map((k) => (
										<Button
											key={k.kind}
											variant={activeKind === k.kind ? "default" : "outline"}
											size="sm"
											onClick={() => {
												setKind(k.kind);
												// Status/channel bersifat per-domain — reset saat
												// pindah jenis laporan agar tak terkirim keliru.
												setFilters((prev) => ({
													...prev,
													status: "",
													channel: "",
												}));
											}}
										>
											{k.title.replace(/^Laporan /, "")}
										</Button>
									))}
								</div>
							</div>
						))}
					</div>
					<div className="flex flex-wrap items-end gap-2">
						<label className="flex flex-col gap-1 text-xs">
							Periode (1 bulan)
							<input
								type="month"
								className={inputCls}
								value={filters.period}
								onChange={(e) => {
									if (e.target.value) {
										setMonthFrom("");
										setMonthTo("");
									}
									setFilters({
										...filters,
										period: e.target.value,
										// Period menang atas from/to di backend.
										...(e.target.value ? { from: "", to: "" } : {}),
									});
								}}
							/>
						</label>
						<label className="flex flex-col gap-1 text-xs">
							Dari bulan
							<input
								type="month"
								className={inputCls}
								value={monthFrom}
								onChange={(e) => applyMonthRange(e.target.value, monthTo)}
							/>
						</label>
						<label className="flex flex-col gap-1 text-xs">
							Sampai bulan
							<input
								type="month"
								className={inputCls}
								value={monthTo}
								onChange={(e) => applyMonthRange(monthFrom, e.target.value)}
							/>
						</label>
						<label className="flex flex-col gap-1 text-xs">
							Dari tanggal
							<input
								type="date"
								className={inputCls}
								value={filters.from}
								onChange={(e) => {
									if (e.target.value) {
										setMonthFrom("");
										setMonthTo("");
									}
									setFilters({
										...filters,
										from: e.target.value,
										...(e.target.value ? { period: "" } : {}),
									});
								}}
							/>
						</label>
						<label className="flex flex-col gap-1 text-xs">
							Sampai tanggal
							<input
								type="date"
								className={inputCls}
								value={filters.to}
								onChange={(e) => {
									if (e.target.value) {
										setMonthFrom("");
										setMonthTo("");
									}
									setFilters({
										...filters,
										to: e.target.value,
										...(e.target.value ? { period: "" } : {}),
									});
								}}
							/>
						</label>
						<div className="w-52">
							<Phase1aSelectField
								id="rf-program"
								label="Program"
							value={filters.programId}
							onChange={(v) =>
								setFilters({
									...filters,
									programId: v,
									levelId: "",
									groupId: "",
								})
							}
							options={(programsQ.data ?? []).map((p) => ({
								value: p.id,
								label: p.code ? `${p.code} — ${p.name}` : p.name,
							}))}
							placeholder="Semua program"
							/>
						</div>
						<div className="w-44">
							<Phase1aSelectField
								id="rf-level"
								label="Level"
							value={filters.levelId}
							onChange={(v) =>
								setFilters({ ...filters, levelId: v, groupId: "" })
							}
							options={levelOptions.map((l) => ({
								value: l.id,
								label: l.name,
							}))}
							placeholder="Semua level"
							/>
						</div>
						<div className="w-48">
							<Phase1aSelectField
								id="rf-group"
								label="Kelompok"
							value={filters.groupId}
							onChange={(v) => setFilters({ ...filters, groupId: v })}
							options={groupOptions.map((g) => ({
								value: g.id,
								label: g.code ? `${g.code} — ${g.name}` : g.name,
							}))}
							placeholder="Semua kelompok"
							/>
						</div>
						<div className="w-48">
							<Phase1aSelectField
								id="rf-student"
								label="Siswa"
							value={filters.studentId}
							onChange={(v) => setFilters({ ...filters, studentId: v })}
							options={(studentsQ.data ?? []).map((s) => ({
								value: s.id,
								label: s.user.name,
								imageUrl: s.user.avatarUrl,
							}))}
							placeholder="Semua siswa"
							/>
						</div>
						<div className="w-48">
							<Phase1aSelectField
								id="rf-tutor"
								label="Tutor"
							value={filters.tutorId}
							onChange={(v) => setFilters({ ...filters, tutorId: v })}
							options={(tutorsQ.data ?? []).map((t) => ({
								value: t.id,
								label: t.user.name,
								imageUrl: t.user.avatarUrl,
							}))}
							placeholder="Semua tutor"
							/>
						</div>
						<div className="w-52">
							<Phase1aSelectField
								id="rf-status"
								label="Status"
							value={filters.status}
							onChange={(v) => setFilters({ ...filters, status: v })}
							options={statusOptions}
							placeholder="Semua status"
							/>
						</div>
						{isFinanceDomain ? (
							<div className="w-44">
								<Phase1aSelectField
									id="rf-channel"
									label="Channel"
								value={filters.channel}
								onChange={(v) => setFilters({ ...filters, channel: v })}
								options={CHANNEL_OPTIONS}
								placeholder="Semua channel"
								/>
							</div>
						) : null}
						<label className="flex flex-col gap-1 text-xs">
							Pencarian
							<input
								className={inputCls}
								placeholder="opsional"
								value={filters.search}
								onChange={(e) =>
									setFilters({ ...filters, search: e.target.value })
								}
							/>
						</label>
						<div className="ml-auto flex items-end gap-1.5">
							<Button
								size="sm"
								variant="outline"
								className="gap-1.5"
								disabled={!docQ.data || docQ.isLoading}
								onClick={() => exportReport("xlsx")}
							>
								<FileDown className="size-3.5" />
								Excel
							</Button>
							<Button
								size="sm"
								variant="outline"
								className="gap-1.5"
								disabled={!docQ.data || docQ.isLoading}
								onClick={() => exportReport("pdf")}
							>
								<FileDown className="size-3.5" />
								PDF
							</Button>
							<Button
								size="sm"
								variant="ghost"
								className="gap-1.5"
								disabled={!docQ.data || docQ.isLoading}
								onClick={() => exportReport("csv")}
							>
								CSV
							</Button>
						</div>
					</div>
				</CardContent>
			</Card>

			{docQ.isLoading ? <Skeleton className="h-40 w-full" /> : null}
			{docQ.isError ? (
				<p className="text-sm text-destructive">
					Gagal memuat laporan. Pastikan filter valid.
				</p>
			) : null}
			{docQ.data ? <ReportTable doc={docQ.data} /> : null}

			<Card>
				<CardHeader>
					<CardTitle className="text-sm font-medium">
						Snapshot Arsip (data beku)
					</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col gap-3">
					<div className="flex flex-wrap gap-2">
						<input
							className={inputCls}
							placeholder="Judul snapshot (opsional)"
							value={snapshotTitle}
							onChange={(e) => setSnapshotTitle(e.target.value)}
						/>
						<Button
							size="sm"
							disabled={snapshotMut.isPending || !docQ.data}
							onClick={() => snapshotMut.mutate()}
						>
							Simpan Snapshot Laporan Ini
						</Button>
						{snapshotMut.isError ? (
							<span className="text-xs text-destructive">
								Gagal menyimpan snapshot.
							</span>
						) : null}
					</div>
					{snapshotsQ.isLoading ? (
						<Skeleton className="h-16 w-full" />
					) : null}
					{snapshotsQ.data?.data.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							Belum ada snapshot tersimpan.
						</p>
					) : null}
					{snapshotsQ.data?.data.map((s) => (
						<div
							key={s.id}
							className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm"
						>
							<Badge variant="outline">{s.reportKind}</Badge>
							<span className="font-medium">{s.title}</span>
							<span className="text-xs text-muted-foreground">
								{s.period ?? "-"} · {new Date(s.createdAt).toLocaleString("id-ID")} ·
								oleh {s.createdBy?.name ?? "-"}
							</span>
							<div className="ml-auto flex gap-1">
								<Button
									size="sm"
									variant="ghost"
									onClick={() => openSnapshot(s.id)}
								>
									Lihat
								</Button>
								<Button
									size="sm"
									variant="ghost"
									className="text-destructive"
									onClick={() => setSnapshotToDelete(s)}
								>
									Hapus
								</Button>
							</div>
						</div>
					))}
				</CardContent>
			</Card>

			{viewSnapshot ? (
				<div className="flex flex-col gap-2">
					<div className="flex items-center justify-between">
						<p className="text-sm font-medium">
							Snapshot: {viewSnapshot.title}{" "}
							<span className="text-muted-foreground">
								(dibekukan {new Date(viewSnapshot.createdAt).toLocaleString("id-ID")})
							</span>
						</p>
						<Button
							size="sm"
							variant="outline"
							onClick={() => setViewSnapshot(null)}
						>
							Tutup
						</Button>
					</div>
					<ReportTable doc={viewSnapshot.payload} />
				</div>
			) : null}

			<ConfirmDialog
				open={snapshotToDelete !== null}
				onOpenChange={(o) => {
					if (!o) setSnapshotToDelete(null);
				}}
				title="Hapus snapshot laporan?"
				description={`Snapshot "${snapshotToDelete?.title ?? ''}" akan dihapus permanen.`}
				confirmLabel="Ya, hapus"
				pending={deleteSnapshotMut.isPending}
				onConfirm={() =>
					snapshotToDelete && deleteSnapshotMut.mutate(snapshotToDelete.id)
				}
			/>
		</div>
	);
}
