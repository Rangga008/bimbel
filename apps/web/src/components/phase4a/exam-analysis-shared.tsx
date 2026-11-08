"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

export function ScoreRecapTable({ data }: { data: ScoreRecapData }) {
	return (
		<Card className="overflow-hidden">
			<CardHeader>
				<CardTitle className="text-base">Rekap Nilai — {data.exam.title}</CardTitle>
				<CardDescription>
					{data.exam.programName ?? '-'} · {data.exam.levelName ?? '-'} · {data.exam.subjectName ?? '-'} · {data.participantCount} peserta
				</CardDescription>
			</CardHeader>
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
						{data.rows.map((r, i) => (
							<tr key={r.studentId} className="border-b last:border-0 hover:bg-muted/50">
								<td className="px-3 py-2">{i + 1}</td>
								<td className="px-3 py-2 font-medium">{r.name}</td>
								<td className="px-3 py-2">{r.school}</td>
								{r.cells.map((c, j) => (
									<td key={j} className="px-3 py-2 tabular-nums">{score100(c.score, c.maxScore)}/100</td>
								))}
								<td className="px-3 py-2 tabular-nums">{r.totalCorrect}</td>
								<td className="px-3 py-2 tabular-nums font-semibold">{r.totalScore}/{r.maxScore}</td>
								<td className="px-3 py-2 tabular-nums">{r.percentage}%</td>
							</tr>
						))}
						{data.rows.length === 0 ? (
							<tr><td colSpan={4 + data.columns.length} className="px-3 py-6 text-center text-muted-foreground">Belum ada attempt.</td></tr>
						) : null}
					</tbody>
				</table>
			</CardContent>
		</Card>
	);
}

export function AnswerRecapTable({ data }: { data: AnswerRecapData }) {
	return (
		<Card className="overflow-hidden">
			<CardHeader>
				<CardTitle className="text-base">Rekap Jawaban — {data.exam.title}</CardTitle>
				<CardDescription>{data.exam.levelName ?? '-'} · {data.exam.subjectName ?? '-'} · {data.participantCount} peserta</CardDescription>
			</CardHeader>
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
						{data.rows.map((r, i) => (
							<tr key={r.studentId} className="border-b last:border-0 hover:bg-muted/50">
								<td className="px-3 py-2 sticky left-0 bg-background">{i + 1}</td>
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
						{data.rows.length === 0 ? (
							<tr><td colSpan={2 + data.questions.length} className="px-3 py-6 text-center text-muted-foreground">Belum ada attempt.</td></tr>
						) : null}
					</tbody>
				</table>
			</CardContent>
		</Card>
	);
}
