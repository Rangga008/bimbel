"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { score100 } from '@/lib/score';

export interface QuestionAnalytics {
	questionId: string;
	questionContent: string;
	questionType: string;
	totalAttempts: number;
	correctAttempts: number;
	accuracy: number;
	optionDistribution: Array<{
		optionId: string;
		optionContent: string;
		isCorrect: boolean;
		selectedCount: number;
		selectionRate: number;
	}>;
	avgResponseTimeMs?: number;
}

export interface ScoreRecapColumn {
	key: string;
	label: string;
	maxScore: number;
}
export interface ScoreRecapRow {
	studentId: string;
	name: string;
	school: string;
	groups: string[];
	cells: Array<{ key: string; correct: number; total: number; score: number; maxScore: number }>;
	totalScore: number;
	maxScore: number;
	totalCorrect: number;
	percentage: number;
	submittedAt: string | null;
}
export interface ScoreRecapData {
	exam: { title: string; programName: string | null; levelName: string | null; subjectName: string | null };
	columns: ScoreRecapColumn[];
	rows: ScoreRecapRow[];
	participantCount: number;
}

export interface AnswerRecapQuestion {
	no: number;
	questionId: string;
	type: string;
	key: string;
	points: number;
}
export interface AnswerRecapRow {
	studentId: string;
	name: string;
	school: string;
	answers: Array<{ display: string; isCorrect: boolean | null }>;
}
export interface AnswerRecapData {
	exam: { title: string; levelName: string | null; subjectName: string | null };
	questions: AnswerRecapQuestion[];
	rows: AnswerRecapRow[];
	participantCount: number;
}

export function accuracyVariant(accuracy: number) {
	if (accuracy >= 70) return "default" as const;
	if (accuracy >= 50) return "secondary" as const;
	return "destructive" as const;
}

export function stripHtml(s: string) {
	return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** Tab "Analisis": grafik % benar per soal + daftar soal termudah/tersulit. */
export function QuestionAnalysisPanel({ items }: { items: QuestionAnalytics[] }) {
	if (!items.length) {
		return <p className="px-1 py-4 text-sm text-muted-foreground">Belum ada jawaban untuk dianalisis.</p>;
	}
	const byAcc = [...items].sort((a, b) => a.accuracy - b.accuracy);
	const hardest = byAcc.slice(0, 5);
	const easiest = [...items].sort((a, b) => b.accuracy - a.accuracy).slice(0, 5);
	const barColor = (acc: number) =>
		acc >= 70 ? "#2e8b57" : acc >= 50 ? "#e8a020" : "#b03a48";

	const miniTable = (title: string, list: QuestionAnalytics[]) => (
		<div className="flex flex-col gap-1.5">
			<p className="text-xs font-semibold">{title}</p>
			<div className="overflow-x-auto rounded-lg border">
				<table className="w-full text-left text-xs">
					<thead>
						<tr className="border-b bg-muted/60 text-muted-foreground">
							<th className="w-10 px-2 py-1.5 font-medium">No</th>
							<th className="px-2 py-1.5 font-medium">Soal</th>
							<th className="px-2 py-1.5 font-medium whitespace-nowrap">Benar/Total</th>
							<th className="px-2 py-1.5 font-medium">Akurasi</th>
						</tr>
					</thead>
					<tbody>
						{list.map((q) => (
							<tr key={q.questionId} className="border-b last:border-0">
								<td className="px-2 py-1.5 tabular-nums">{items.indexOf(q) + 1}</td>
								<td className="max-w-xs truncate px-2 py-1.5" title={stripHtml(q.questionContent)}>
									{stripHtml(q.questionContent) || "—"}
								</td>
								<td className="px-2 py-1.5 tabular-nums">{q.correctAttempts}/{q.totalAttempts}</td>
								<td className="px-2 py-1.5">
									<Badge variant={accuracyVariant(q.accuracy)}>{q.accuracy.toFixed(1)}%</Badge>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-1.5">
				<p className="text-xs font-semibold">% Benar per Soal — hijau ≥70%, kuning 50–70%, merah &lt;50%</p>
				<div className="flex flex-col gap-1">
					{items.map((q, i) => (
						<div key={q.questionId} className="flex items-center gap-2 text-xs">
							<span className="w-14 shrink-0 tabular-nums">Soal {i + 1}</span>
							<div className="h-3.5 min-w-0 flex-1 rounded bg-muted">
								<div
									className="h-full rounded"
									style={{ width: `${Math.max(2, q.accuracy)}%`, background: barColor(q.accuracy) }}
								/>
							</div>
							<span className="w-24 shrink-0 text-right tabular-nums">
								{q.accuracy.toFixed(1)}% · {q.correctAttempts}/{q.totalAttempts}
							</span>
						</div>
					))}
				</div>
			</div>
			<div className="grid gap-4 md:grid-cols-2">
				{miniTable("Soal paling sulit (akurasi terendah)", hardest)}
				{miniTable("Soal paling bisa (akurasi tertinggi)", easiest)}
			</div>
		</div>
	);
}

const RECAP_SCORE_BUCKETS = [
	{ value: "", label: "Semua nilai" },
	{ value: "high", label: "Tinggi (≥70%)" },
	{ value: "mid", label: "Sedang (50–69%)" },
	{ value: "low", label: "Rendah (<50%)" },
	{ value: "unsubmitted", label: "Belum mengumpulkan" },
];

const RECAP_SORTS = [
	{ value: "default", label: "Urutan awal" },
	{ value: "desc", label: "Nilai tertinggi" },
	{ value: "asc", label: "Nilai terendah" },
	{ value: "name", label: "Nama A–Z" },
];

const PAGE_SIZES = [10, 20, 50, 100, 0]; // 0 = semua

const selectCls =
	"h-9 rounded-md border border-input bg-background px-2 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Toolbar filter + paginasi — dipakai rekap nilai & rekap jawaban. */
function usePagedRows<T>(rows: T[], deps: unknown[]) {
	const [pageSize, setPageSize] = useState(20);
	const [page, setPage] = useState(0);
	const pageCount = pageSize > 0 ? Math.max(1, Math.ceil(rows.length / pageSize)) : 1;
	const safePage = Math.min(page, pageCount - 1);
	const paged = pageSize > 0 ? rows.slice(safePage * pageSize, (safePage + 1) * pageSize) : rows;
	// Filter/urutan berubah → kembali ke halaman pertama.
	// eslint-disable-next-line react-hooks/exhaustive-deps
	useEffect(() => setPage(0), deps);
	const pager = rows.length > 0 ? (
		<div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
			<span className="tabular-nums">
				{pageSize > 0
					? `${safePage * pageSize + 1}–${Math.min(rows.length, (safePage + 1) * pageSize)} dari ${rows.length} peserta`
					: `${rows.length} peserta`}
			</span>
			<div className="flex items-center gap-2">
				<select
					className={selectCls}
					value={pageSize}
					onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
					aria-label="Baris per halaman"
				>
					{PAGE_SIZES.map((n) => (
						<option key={n} value={n}>{n === 0 ? "Semua" : `${n} / hal`}</option>
					))}
				</select>
				{pageSize > 0 && pageCount > 1 ? (
					<div className="flex items-center gap-1">
						<button
							type="button"
							className="rounded border px-2 py-1 disabled:opacity-40"
							disabled={safePage === 0}
							onClick={() => setPage(safePage - 1)}
						>
							‹
						</button>
						<span className="px-1 tabular-nums">{safePage + 1}/{pageCount}</span>
						<button
							type="button"
							className="rounded border px-2 py-1 disabled:opacity-40"
							disabled={safePage >= pageCount - 1}
							onClick={() => setPage(safePage + 1)}
						>
							›
						</button>
					</div>
				) : null}
			</div>
		</div>
	) : null;
	return { paged, pager };
}

export function ScoreRecapTable({ data }: { data: ScoreRecapData }) {
	const [q, setQ] = useState("");
	const [bucket, setBucket] = useState("");
	const [sort, setSort] = useState("default");

	const rows = useMemo(() => {
		const needle = q.trim().toLowerCase();
		const filtered = data.rows.filter((r) => {
			if (
				needle &&
				!`${r.name} ${r.school} ${r.groups.join(" ")}`.toLowerCase().includes(needle)
			)
				return false;
			if (bucket === "high" && r.percentage < 70) return false;
			if (bucket === "mid" && (r.percentage < 50 || r.percentage >= 70)) return false;
			if (bucket === "low" && (r.percentage >= 50 || !r.submittedAt)) return false;
			if (bucket === "unsubmitted" && r.submittedAt) return false;
			return true;
		});
		if (sort === "desc") return [...filtered].sort((a, b) => b.percentage - a.percentage);
		if (sort === "asc") return [...filtered].sort((a, b) => a.percentage - b.percentage);
		if (sort === "name") return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
		return filtered;
	}, [data.rows, q, bucket, sort]);

	const { paged, pager } = usePagedRows(rows, [q, bucket, sort]);

	// Statistik dari semua baris (bukan hasil filter) supaya konteks tetap utuh.
	const stats = useMemo(() => {
		const submitted = data.rows.filter((r) => r.submittedAt);
		const pct = submitted.map((r) => r.percentage);
		return {
			avg: pct.length ? Math.round(pct.reduce((a, b) => a + b, 0) / pct.length) : null,
			max: pct.length ? Math.max(...pct) : null,
			min: pct.length ? Math.min(...pct) : null,
			submitted: submitted.length,
			total: data.rows.length,
		};
	}, [data.rows]);

	return (
		<Card className="overflow-hidden">
			<CardHeader className="gap-2">
				<div className="flex flex-wrap items-start justify-between gap-2">
					<div>
						<CardTitle className="text-base">Rekap Nilai — {data.exam.title}</CardTitle>
						<CardDescription>
							{data.exam.programName ?? '-'} · {data.exam.levelName ?? '-'} · {data.exam.subjectName ?? '-'} · {data.participantCount} peserta
						</CardDescription>
					</div>
					{stats.avg !== null ? (
						<div className="flex flex-wrap gap-1.5 text-xs">
							<Badge variant="secondary">Rata-rata {stats.avg}%</Badge>
							<Badge variant="default">Tertinggi {stats.max}%</Badge>
							<Badge variant="destructive">Terendah {stats.min}%</Badge>
							<Badge variant="outline">Terkumpul {stats.submitted}/{stats.total}</Badge>
						</div>
					) : null}
				</div>
			</CardHeader>
			<div className="flex flex-wrap items-center gap-2 border-t px-3 py-2.5">
				<div className="relative min-w-52 flex-1">
					<Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
					<Input
						value={q}
						onChange={(e) => setQ(e.target.value)}
						placeholder="Cari nama / sekolah / kelompok…"
						className="h-9 pl-8 text-xs"
					/>
				</div>
				<select
					className={selectCls}
					value={bucket}
					onChange={(e) => setBucket(e.target.value)}
					aria-label="Filter nilai"
				>
					{RECAP_SCORE_BUCKETS.map((b) => (
						<option key={b.value} value={b.value}>{b.label}</option>
					))}
				</select>
				<select
					className={selectCls}
					value={sort}
					onChange={(e) => setSort(e.target.value)}
					aria-label="Urutkan"
				>
					{RECAP_SORTS.map((s) => (
						<option key={s.value} value={s.value}>{s.label}</option>
					))}
				</select>
			</div>
			<CardContent className="overflow-x-auto p-0">
				<table className="w-full text-left text-xs">
					<thead>
						<tr className="border-b bg-muted">
							<th className="px-3 py-2">No</th>
							<th className="px-3 py-2">Nama</th>
							<th className="px-3 py-2">Sekolah</th>
							{data.columns.map((c) => (
								<th key={c.key} className="px-3 py-2">{c.label}</th>
							))}
							<th className="px-3 py-2">Benar</th>
							<th className="px-3 py-2">Skor</th>
							<th className="px-3 py-2">%</th>
						</tr>
					</thead>
					<tbody>
						{paged.map((r, i) => (
							<tr key={r.studentId} className="border-b last:border-0 hover:bg-muted/50">
								<td className="px-3 py-2">{data.rows.indexOf(r) + 1}</td>
								<td className="px-3 py-2 font-medium">{r.name}</td>
								<td className="px-3 py-2">{r.school}</td>
								{r.cells.map((c, j) => (
									<td key={j} className="px-3 py-2 tabular-nums">{score100(c.score, c.maxScore)}/100</td>
								))}
								<td className="px-3 py-2 tabular-nums">{r.totalCorrect}</td>
								<td className="px-3 py-2 tabular-nums font-semibold">{r.totalScore}/{r.maxScore}</td>
								<td className="px-3 py-2 tabular-nums">
									<Badge variant={accuracyVariant(r.percentage)}>{r.percentage}%</Badge>
								</td>
							</tr>
						))}
						{rows.length === 0 ? (
							<tr>
								<td colSpan={4 + data.columns.length} className="px-3 py-6 text-center text-muted-foreground">
									{data.rows.length === 0 ? 'Belum ada attempt.' : 'Tidak ada peserta yang cocok dengan filter.'}
								</td>
							</tr>
						) : null}
					</tbody>
				</table>
				{pager}
			</CardContent>
		</Card>
	);
}

export function AnswerRecapTable({ data }: { data: AnswerRecapData }) {
	const [q, setQ] = useState("");

	const rows = useMemo(() => {
		const needle = q.trim().toLowerCase();
		if (!needle) return data.rows;
		return data.rows.filter((r) =>
			`${r.name} ${r.school}`.toLowerCase().includes(needle),
		);
	}, [data.rows, q]);

	const { paged, pager } = usePagedRows(rows, [q]);

	return (
		<Card className="overflow-hidden">
			<CardHeader>
				<CardTitle className="text-base">Rekap Jawaban — {data.exam.title}</CardTitle>
				<CardDescription>{data.exam.levelName ?? '-'} · {data.exam.subjectName ?? '-'} · {data.participantCount} peserta</CardDescription>
			</CardHeader>
			<div className="flex flex-wrap items-center gap-2 border-t px-3 py-2.5">
				<div className="relative min-w-52 flex-1">
					<Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
					<Input
						value={q}
						onChange={(e) => setQ(e.target.value)}
						placeholder="Cari nama / sekolah…"
						className="h-9 pl-8 text-xs"
					/>
				</div>
			</div>
			<CardContent className="overflow-x-auto p-0">
				<table className="w-full text-left text-xs">
					<thead>
						<tr className="border-b bg-muted">
							<th className="px-3 py-2 sticky left-0 bg-muted">No</th>
							<th className="px-3 py-2 sticky left-0 bg-muted min-w-[140px]">Nama</th>
							{data.questions.map((q) => (
								<th key={q.questionId} className="px-3 py-2 text-center">{q.no}<br /><span className="text-[10px] text-muted-foreground">({q.key})</span></th>
							))}
						</tr>
					</thead>
					<tbody>
						{paged.map((r, i) => (
							<tr key={r.studentId} className="border-b last:border-0 hover:bg-muted/50">
								<td className="px-3 py-2 sticky left-0 bg-background">{data.rows.indexOf(r) + 1}</td>
								<td className="px-3 py-2 sticky left-0 bg-background font-medium min-w-[140px]">{r.name}</td>
								{r.answers.map((a, j) => (
									<td
										key={j}
										className={`px-2 py-2 text-center tabular-nums ${
											a.isCorrect === true ? 'bg-green-50 text-green-700' : a.isCorrect === false ? 'bg-red-50 text-red-700' : ''
										}`}
									>
										{a.display}
									</td>
								))}
							</tr>
						))}
						{rows.length === 0 ? (
							<tr>
								<td colSpan={2 + data.questions.length} className="px-3 py-6 text-center text-muted-foreground">
									{data.rows.length === 0 ? 'Belum ada attempt.' : 'Tidak ada peserta yang cocok dengan pencarian.'}
								</td>
							</tr>
						) : null}
					</tbody>
				</table>
				{pager}
			</CardContent>
		</Card>
	);
}
