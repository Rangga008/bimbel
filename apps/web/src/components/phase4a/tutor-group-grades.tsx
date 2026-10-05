"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { Skeleton } from "@/components/ui/skeleton";

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

function err(e: unknown, fb: string) {
	return e instanceof ApiError ? e.message : fb;
}

/**
 * Halaman "Nilai" (Tutor): pilih kelompok yang diampu, tampilkan ringkasan
 * nilai ujian per siswa dari analytics Fase 4a.
 */
export function TutorGroupGrades() {
	const groupsQ = useQuery({
		queryKey: ["groups-mine"],
		queryFn: () => apiFetch<GroupLite[]>("/groups/mine"),
	});
	const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
	const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
	const groupId = selectedGroupId ?? groupsQ.data?.[0]?.id ?? null;

	const analyticsQ = useQuery({
		queryKey: ["tutor-group-analytics", groupId],
		queryFn: () =>
			apiFetch<GroupAnalytics>(`/analytics/tutor/group/${groupId}/analytics`),
		enabled: !!groupId,
	});

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
		<div className="flex flex-col gap-6">
			<div>
				<h1 className="text-2xl font-semibold tracking-tight">Nilai</h1>
				<p className="text-sm text-muted-foreground">
					Rekap nilai ujian siswa per kelompok yang Anda ampu.
				</p>
			</div>

			{groups.length > 1 ? (
				<div className="flex flex-wrap gap-2">
					{groups.map((g) => (
						<Button
							key={g.id}
							variant={groupId === g.id ? "default" : "outline"}
							size="sm"
							onClick={() => { setSelectedGroupId(g.id); setSelectedStudentId(null); }}
						>
							{g.name}
						</Button>
					))}
				</div>
			) : (
				<p className="text-sm font-medium">
					{groups[0].name} · {groups[0]._count.members} siswa
				</p>
			)}

			{analyticsQ.isLoading ? <Skeleton className="h-40 w-full" /> : null}
			{analyticsQ.isError ? (
				<Card>
					<CardContent className="py-10 text-center text-sm text-destructive">
						{err(analyticsQ.error, "Gagal memuat data nilai.")}
					</CardContent>
				</Card>
			) : null}

			{analyticsQ.data?.studentPerformances.length === 0 ? (
				<Card>
					<CardContent className="py-10 text-center text-sm text-muted-foreground">
						Belum ada siswa di kelompok ini.
					</CardContent>
				</Card>
			) : null}

			{analyticsQ.data && analyticsQ.data.studentPerformances.length > 0 && !selectedStudentId ? (
				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{analyticsQ.data.studentPerformances.map((student) => (
						<button
							key={student.studentId}
							type="button"
							onClick={() => setSelectedStudentId(student.studentId)}
							className="rounded-lg border bg-card p-4 text-left transition-colors hover:bg-muted/50"
						>
							<p className="font-medium">{student.studentName}</p>
							<p className="mt-1 text-xs text-muted-foreground">
								{student.overallStats.totalExams} ujian · rata-rata {student.overallStats.avgPercentage.toFixed(1)}%
							</p>
						</button>
					))}
				</div>
			) : null}

			{selectedStudentId ? (
				<Button variant="outline" size="sm" className="w-fit" onClick={() => setSelectedStudentId(null)}>
					← Semua siswa
				</Button>
			) : null}

			{selectedStudentId && analyticsQ.data?.studentPerformances
				.filter((student) => student.studentId === selectedStudentId)
				.map((student) => (
				<Card key={student.studentId}>
					<CardHeader>
						<div className="flex flex-wrap items-center justify-between gap-2">
							<div>
								<CardTitle>{student.studentName}</CardTitle>
								<CardDescription>
									{student.overallStats.totalExams} ujian diselesaikan
								</CardDescription>
							</div>
							<div className="flex gap-2">
								<Badge variant="outline">
									Rata-rata {student.overallStats.avgPercentage.toFixed(1)}%
								</Badge>
								<Badge variant="outline">
									Akurasi {student.overallStats.overallAccuracy.toFixed(1)}%
								</Badge>
							</div>
						</div>
					</CardHeader>
					<CardContent>
						{student.examHistory.length === 0 ? (
							<p className="text-sm text-muted-foreground">
								Belum ada riwayat ujian.
							</p>
						) : (
							<div className="flex flex-col gap-2">
								{student.examHistory.map((exam) => (
									<div
										key={`${student.studentId}-${exam.examId}`}
										className="flex items-center justify-between rounded-lg border px-3 py-2"
									>
										<div>
											<p className="text-sm font-medium">{exam.examTitle}</p>
											<p className="text-xs text-muted-foreground">
												{new Date(exam.examDate).toLocaleDateString("id-ID")}
											</p>
										</div>
										<div className="text-right">
											<p className="font-semibold">
												{exam.percentage.toFixed(1)}%
											</p>
											<p className="text-xs text-muted-foreground">
												{exam.score} / {exam.maxScore}
											</p>
										</div>
									</div>
								))}
							</div>
						)}
					</CardContent>
				</Card>
			))}
		</div>
	);
}
