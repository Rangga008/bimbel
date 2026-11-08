"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChartLine, FileCheck2, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import {
	AnswerRecapTable,
	QuestionAnalysisPanel,
	ScoreRecapTable,
	type AnswerRecapData,
	type QuestionAnalytics,
	type ScoreRecapData,
} from "@/components/phase4a/exam-analysis-shared";
import { apiFetch, ApiError } from "@/lib/api-client";

type Tab = "score" | "answer" | "analysis";

const TABS: Array<{ key: Tab; label: string; icon: typeof Table2 }> = [
	{ key: "score", label: "Rekap Nilai", icon: Table2 },
	{ key: "answer", label: "Rekap Jawaban", icon: FileCheck2 },
	{ key: "analysis", label: "Analisis Soal", icon: ChartLine },
];

/**
 * Detail analisis satu ujian untuk tutor — rekap nilai, rekap jawaban per
 * nomor, dan analisis soal (akurasi per butir). Kelompok diambil dari query
 * `?groupId=` supaya rekap hanya memuat siswa kelompok yang diampu.
 */
export function TutorExamAnalysis({ examId }: { examId: string }) {
	const router = useRouter();
	const params = useSearchParams();
	const groupId = params.get("groupId") ?? "";
	const [tab, setTab] = useState<Tab>("score");
	const qs = groupId ? `?groupId=${groupId}` : "";

	const scoreQ = useQuery({
		queryKey: ["tutor-exam-score-recap", examId, groupId],
		queryFn: () => apiFetch<ScoreRecapData>(`/analytics/exam/${examId}/score-recap${qs}`),
	});
	const answerQ = useQuery({
		queryKey: ["tutor-exam-answer-recap", examId, groupId],
		queryFn: () => apiFetch<AnswerRecapData>(`/analytics/exam/${examId}/answer-recap${qs}`),
		enabled: tab === "answer",
	});
	const analysisQ = useQuery({
		queryKey: ["tutor-exam-questions", examId],
		queryFn: () =>
			apiFetch<{ examId: string; questionAnalytics: QuestionAnalytics[] }>(
				`/analytics/exam/${examId}/questions`,
			),
		enabled: tab === "analysis",
	});

	const title = scoreQ.data?.exam.title ?? "Analisis Ujian";

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-center gap-3">
				<Button variant="outline" size="sm" onClick={() => router.back()}>
					<ArrowLeft className="size-4" /> Kembali
				</Button>
				<div className="min-w-0">
					<h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
					<p className="text-xs text-muted-foreground">
						{scoreQ.data
							? `${scoreQ.data.exam.programName ?? "-"} · ${scoreQ.data.exam.levelName ?? "-"} · ${scoreQ.data.exam.subjectName ?? "-"}`
							: "Memuat info ujian..."}
					</p>
				</div>
			</div>

			<div className="flex flex-wrap gap-2">
				{TABS.map((t) => (
					<Button
						key={t.key}
						size="sm"
						variant={tab === t.key ? "default" : "outline"}
						onClick={() => setTab(t.key)}
					>
						<t.icon className="size-4" /> {t.label}
					</Button>
				))}
			</div>

			{tab === "score" ? (
				scoreQ.isLoading ? (
					<Skeleton className="h-72 w-full" />
				) : scoreQ.isError ? (
					<Card>
						<CardContent className="py-10">
							<EmptyState
								icon={FileCheck2}
								title="Gagal memuat rekap"
								description={
									scoreQ.error instanceof ApiError
										? scoreQ.error.message
										: "Anda mungkin tidak punya akses ke ujian ini."
								}
							/>
						</CardContent>
					</Card>
				) : scoreQ.data ? (
					<ScoreRecapTable data={scoreQ.data} />
				) : null
			) : null}

			{tab === "answer" ? (
				answerQ.isLoading ? (
					<Skeleton className="h-72 w-full" />
				) : answerQ.isError ? (
					<Card>
						<CardContent className="py-10 text-center text-sm text-destructive">
							Gagal memuat rekap jawaban.
						</CardContent>
					</Card>
				) : answerQ.data ? (
					<AnswerRecapTable data={answerQ.data} />
				) : null
			) : null}

			{tab === "analysis" ? (
				analysisQ.isLoading ? (
					<Skeleton className="h-72 w-full" />
				) : analysisQ.isError ? (
					<Card>
						<CardContent className="py-10 text-center text-sm text-destructive">
							Gagal memuat analisis soal.
						</CardContent>
					</Card>
				) : (
					<Card>
						<CardContent className="pt-5">
							<QuestionAnalysisPanel
								items={analysisQ.data?.questionAnalytics ?? []}
							/>
						</CardContent>
					</Card>
				)
			) : null}
		</div>
	);
}
