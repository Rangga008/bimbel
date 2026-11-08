"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarRange, Search, Users } from "lucide-react";
import { score100 } from '@/lib/score';
import { apiFetch, ApiError } from "@/lib/api-client";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { ComboboxField } from "@/components/shared/combobox-field";

interface GroupLite {
	id: string;
	name: string;
	program: { name: string };
	level: { name: string } | null;
	_count: { members: number };
}

interface ExamHistoryItem {
	examId: string;
	examTitle: string;
	examDate: string;
	score: number;
	maxScore: number;
	percentage: number;
}

interface OverallStats {
	totalExams: number;
	totalQuestionsAttempted: number;
	overallAccuracy: number;
	avgScore: number;
	avgPercentage: number;
	bestExam: ExamHistoryItem | null;
	worstExam: ExamHistoryItem | null;
}

interface StudentPerformance {
	studentId: string;
	studentName: string;
	examHistory: ExamHistoryItem[];
	overallStats: OverallStats;
}

interface GroupAnalytics {
	groupId: string;
	studentCount: number;
	studentPerformances: StudentPerformance[];
}

interface MonthRecap {
	month: string; // YYYY-MM
	count: number;
	avgPercentage: number;
	best: number;
	worst: number;
}

function err(e: unknown, fb: string) {
	return e instanceof ApiError ? e.message : fb;
}

function monthLabel(ym: string) {
	const [y, m] = ym.split("-").map(Number);
	return new Date(y, m - 1, 1).toLocaleDateString("id-ID", {
		month: "long",
		year: "numeric",
	});
}

/** Rekap skor per bulan dari riwayat ujian — terurut terbaru → terlama. */
function monthlyRecap(history: ExamHistoryItem[]): MonthRecap[] {
	const map = new Map<string, { count: number; sum: number; best: number; worst: number }>();
	for (const h of history) {
		const ym = h.examDate.slice(0, 7);
		const cur = map.get(ym) ?? { count: 0, sum: 0, best: 0, worst: 100 };
		cur.count += 1;
		cur.sum += h.percentage;
		cur.best = Math.max(cur.best, h.percentage);
		cur.worst = Math.min(cur.worst, h.percentage);
		map.set(ym, cur);
	}
	return [...map.entries()]
		.map(([month, v]) => ({
			month,
			count: v.count,
			avgPercentage: v.sum / v.count,
			best: v.best,
			worst: v.worst,
		}))
		.sort((a, b) => (a.month < b.month ? 1 : -1));
}

function scoreVariant(pct: number) {
	if (pct >= 75) return "success" as const;
	if (pct >= 50) return "warning" as const;
	return "destructive" as const;
}

/**
 * Halaman "Nilai" (Tutor): pilih kelompok → cari siswa / filter bulan →
 * klik siswa untuk rekap per bulan + riwayat ujian yang tertaut ke detail
 * analisis ujian.
 */
export function TutorGroupGrades() {
	const groupsQ = useQuery({
		queryKey: ["groups-mine"],
		queryFn: () => apiFetch<GroupLite[]>("/groups/mine"),
	});
	const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
	const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
	const [search, setSearch] = useState("");
	const [month, setMonth] = useState("");
	const groupId = selectedGroupId ?? groupsQ.data?.[0]?.id ?? null;

	const analyticsQ = useQuery({
		queryKey: ["tutor-group-analytics", groupId],
		queryFn: () =>
			apiFetch<GroupAnalytics>(`/analytics/tutor/group/${groupId}/analytics`),
		enabled: !!groupId,
	});

	const perfs = analyticsQ.data?.studentPerformances ?? [];

	// Semua bulan unik dari riwayat — untuk opsi filter periode.
	const monthOptions = [
		...new Set(
			perfs.flatMap((p) => p.examHistory.map((h) => h.examDate.slice(0, 7))),
		),
	]
		.sort()
		.reverse();

	// Filter riwayat per bulan + hitung ulang stat tampilan.
	const filtered = perfs
		.map((p) => {
			const history = month
				? p.examHistory.filter((h) => h.examDate.startsWith(month))
				: p.examHistory;
			const avg = history.length
				? history.reduce((s, h) => s + h.percentage, 0) / history.length
				: null;
			return { ...p, history, filteredAvg: avg };
		})
		.filter((p) =>
			search
				? p.studentName.toLowerCase().includes(search.trim().toLowerCase())
				: true,
		)
		.sort((a, b) =>
			(b.filteredAvg ?? -1) !== (a.filteredAvg ?? -1)
				? (b.filteredAvg ?? -1) - (a.filteredAvg ?? -1)
				: a.studentName.localeCompare(b.studentName),
		);

	const selected = selectedStudentId
		? filtered.find((p) => p.studentId === selectedStudentId) ?? null
		: null;

	if (groupsQ.isLoading) return <Skeleton className="h-32 w-full" />;

	if (groupsQ.isError) {
		return (
			<Card>
				<CardContent className="py-10 text-center text-sm text-destructive">
					{err(groupsQ.error, "Gagal memuat kelompok Anda.")}
				</CardContent>
			</Card>
		);
	}

	const groups = groupsQ.data ?? [];
	if (groups.length === 0) {
		return (
			<Card>
				<CardContent className="py-10 text-center text-sm text-muted-foreground">
					Anda belum mengampu kelompok mana pun.
				</CardContent>
			</Card>
		);
	}

	return (
		<div className="flex flex-col gap-5">
			<div>
				<h1 className="text-2xl font-semibold tracking-tight">Nilai</h1>
				<p className="text-sm text-muted-foreground">
					Rekap nilai ujian siswa per kelompok — bisa difilter per bulan.
				</p>
			</div>

			{/* Filter bar */}
			<Card>
				<CardContent className="grid gap-3 pt-5 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr]">
					<div className="flex flex-col gap-1.5">
						<p className="text-xs font-medium text-muted-foreground">Kelompok</p>
						<ComboboxField
							id="grades-group"
							value={groupId ?? ""}
							onChange={(v) => {
								setSelectedGroupId(v || null);
								setSelectedStudentId(null);
							}}
							options={groups.map((g) => ({
								value: g.id,
								label: `${g.name} · ${g._count.members} siswa`,
							}))}
							placeholder="Pilih kelompok"
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<p className="text-xs font-medium text-muted-foreground">Periode bulan</p>
						<ComboboxField
							id="grades-month"
							value={month}
							onChange={setMonth}
							options={monthOptions.map((m) => ({
								value: m,
								label: monthLabel(m),
							}))}
							placeholder="Semua bulan"
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<p className="text-xs font-medium text-muted-foreground">Cari siswa</p>
						<div className="relative">
							<Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								value={search}
								onChange={(e) => setSearch(e.target.value)}
								placeholder="Nama siswa..."
								className="pl-9"
							/>
						</div>
					</div>
				</CardContent>
			</Card>

			{analyticsQ.isLoading ? <Skeleton className="h-40 w-full" /> : null}
			{analyticsQ.isError ? (
				<Card>
					<CardContent className="py-10 text-center text-sm text-destructive">
						{err(analyticsQ.error, "Gagal memuat data nilai.")}
					</CardContent>
				</Card>
			) : null}

			{/* Daftar siswa */}
			{analyticsQ.data && !selected ? (
				filtered.length === 0 ? (
					<Card>
						<CardContent className="py-10">
							<EmptyState
								icon={Users}
								title="Tidak ada siswa cocok"
								description="Coba longgarkan pencarian atau ganti periode bulan."
							/>
						</CardContent>
					</Card>
				) : (
					<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
						{filtered.map((student) => (
							<button
								key={student.studentId}
								type="button"
								onClick={() => setSelectedStudentId(student.studentId)}
								className="rounded-xl border bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/60 hover:shadow"
							>
								<p className="font-medium">{student.studentName}</p>
								<div className="mt-2 flex items-center justify-between gap-2">
									<p className="text-xs text-muted-foreground">
										{student.history.length} ujian
										{month ? ` · ${monthLabel(month)}` : ""}
									</p>
									{student.filteredAvg !== null ? (
										<Badge variant={scoreVariant(student.filteredAvg)}>
											{student.filteredAvg.toFixed(1)}%
										</Badge>
									) : (
										<Badge variant="outline">—</Badge>
									)}
								</div>
							</button>
						))}
					</div>
				)
			) : null}

			{/* Detail siswa: rekap per bulan + riwayat ujian */}
			{selected ? (
				<>
					<Button
						variant="outline"
						size="sm"
						className="w-fit"
						onClick={() => setSelectedStudentId(null)}
					>
						<ArrowLeft className="size-4" /> Semua siswa
					</Button>
					<Card>
						<CardHeader>
							<div className="flex flex-wrap items-center justify-between gap-2">
								<div>
									<CardTitle>{selected.studentName}</CardTitle>
									<CardDescription>
										{selected.history.length} ujian
										{month ? ` pada ${monthLabel(month)}` : " keseluruhan"}
									</CardDescription>
								</div>
								<div className="flex gap-2">
									{selected.filteredAvg !== null ? (
										<Badge variant={scoreVariant(selected.filteredAvg)}>
											Rata-rata {selected.filteredAvg.toFixed(1)}%
										</Badge>
									) : null}
									<Badge variant="outline">
										Akurasi {selected.overallStats.overallAccuracy.toFixed(1)}%
									</Badge>
								</div>
							</div>
						</CardHeader>
						<CardContent className="flex flex-col gap-5">
							{/* Rekap nilai per bulan */}
							<div>
								<p className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
									<CalendarRange className="size-3.5" /> Rekap per Bulan
								</p>
								{monthlyRecap(selected.history).length === 0 ? (
									<p className="text-sm text-muted-foreground">
										Belum ada ujian pada periode ini.
									</p>
								) : (
									<div className="overflow-x-auto rounded-md border">
										<table className="w-full text-left text-xs">
											<thead>
												<tr className="border-b bg-muted/50 text-muted-foreground">
													<th className="px-3 py-2 font-medium">Bulan</th>
													<th className="px-3 py-2 font-medium">Ujian</th>
													<th className="px-3 py-2 font-medium">Rata-rata</th>
													<th className="px-3 py-2 font-medium">Tertinggi</th>
													<th className="px-3 py-2 font-medium">Terendah</th>
												</tr>
											</thead>
											<tbody>
												{monthlyRecap(selected.history).map((m) => (
													<tr key={m.month} className="border-b last:border-0">
														<td className="px-3 py-2 font-medium whitespace-nowrap">
															{monthLabel(m.month)}
														</td>
														<td className="px-3 py-2 tabular-nums">{m.count}</td>
														<td className="px-3 py-2">
															<Badge variant={scoreVariant(m.avgPercentage)}>
																{m.avgPercentage.toFixed(1)}%
															</Badge>
														</td>
														<td className="px-3 py-2 tabular-nums text-success-700">
															{m.best.toFixed(1)}%
														</td>
														<td className="px-3 py-2 tabular-nums text-destructive">
															{m.worst.toFixed(1)}%
														</td>
													</tr>
												))}
											</tbody>
										</table>
									</div>
								)}
							</div>

							{/* Riwayat ujian → link detail analisis */}
							<div>
								<p className="mb-2 text-xs font-semibold">Riwayat Ujian</p>
								{selected.history.length === 0 ? (
									<p className="text-sm text-muted-foreground">
										Belum ada riwayat ujian.
									</p>
								) : (
									<div className="flex flex-col gap-2">
										{selected.history.map((exam) => (
											<Link
												key={`${selected.studentId}-${exam.examId}`}
												href={`/tutor/analisis/${exam.examId}?groupId=${groupId}`}
												className="group flex items-center justify-between rounded-lg border px-3 py-2 transition-colors hover:bg-muted/50"
											>
												<div className="min-w-0">
													<p className="truncate text-sm font-medium group-hover:text-primary">
														{exam.examTitle}
													</p>
													<p className="text-xs text-muted-foreground">
														{new Date(exam.examDate).toLocaleDateString("id-ID", {
															day: "numeric",
															month: "short",
															year: "numeric",
														})}
													</p>
												</div>
												<div className="shrink-0 text-right">
													<p className="font-semibold tabular-nums">
														{exam.percentage.toFixed(1)}%
													</p>
													<p className="text-xs text-muted-foreground tabular-nums">
														{score100(exam.score, exam.maxScore)} / 100
													</p>
												</div>
											</Link>
										))}
									</div>
								)}
							</div>
						</CardContent>
					</Card>
				</>
			) : null}
		</div>
	);
}
