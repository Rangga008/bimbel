"use client";

import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, GraduationCap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, ApiError } from "@/lib/api-client";
import type { ExamAttempt, ExamRow } from "@/lib/phase3c-types";

function err(e: unknown, fb: string) {
	return e instanceof ApiError ? e.message : fb;
}

function getStatusBadge(status: string) {
	switch (status) {
		case "PUBLISHED":
			return <Badge variant="secondary">Tersedia</Badge>;
		case "ENDED":
			return <Badge variant="outline">Berakhir</Badge>;
		default:
			return <Badge variant="outline">{status}</Badge>;
	}
}

/** Halaman mulai khusus satu ujian — dipakai deep-link dari materi
 *  supaya siswa mendarat di detail ujian (bukan langsung masuk attempt). */
export default function ExamStartPage() {
	const params = useParams();
	const router = useRouter();
	const examId = typeof params.examId === "string" ? params.examId : "";

	const examQ = useQuery({
		queryKey: ["exam-start", examId],
		queryFn: async () => {
			const exams = await apiFetch<ExamRow[]>("/exams-available");
			return exams.find((e) => e.id === examId) ?? null;
		},
		enabled: !!examId,
	});
	const attemptsQ = useQuery({
		queryKey: ["exam-my-attempts", examId],
		queryFn: () => apiFetch<ExamAttempt[]>(`/exams/${examId}/my-attempts`),
		enabled: !!examId,
	});

	const startM = useMutation({
		mutationFn: () =>
			apiFetch<{ id: string }>("/exam-attempts/start", {
				method: "POST",
				body: { examId },
			}),
		onSuccess: (data) => router.push(`/siswa/ujian/${data.id}`),
		onError: (e) => toast.error(err(e, "Gagal memulai ujian.")),
	});

	const exam = examQ.data;
	const attempt = attemptsQ.data?.[0];

	const now = Date.now();
	const status = (() => {
		if (!exam) return null;
		if (exam.status === "ENDED") return "ENDED";
		if (exam.status !== "PUBLISHED") return "DRAFT";
		const start = new Date(exam.scheduledStartAt).getTime();
		const end = new Date(exam.scheduledEndAt).getTime();
		if (now < start) return "NOT_STARTED";
		if (now > end) return "EXPIRED";
		return "ACTIVE";
	})();

	return (
		<div className="min-h-screen bg-background">
			<header className="sticky top-0 z-30 flex items-center gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur">
				<Button variant="ghost" size="sm" onClick={() => router.back()}>
					<ArrowLeft className="mr-1.5 size-4" />
					Kembali
				</Button>
				{exam ? (
					<p className="truncate text-sm font-semibold">{exam.title}</p>
				) : null}
			</header>

			<main className="mx-auto w-full max-w-3xl p-4 sm:p-6">
				{examQ.isLoading || attemptsQ.isLoading ? (
					<Skeleton className="h-56 w-full" />
				) : !exam ? (
					<p className="text-sm text-destructive">
						Ujian tidak ditemukan atau tidak tersedia untuk Anda.
					</p>
				) : (
					<div className="flex flex-col gap-4">
						<div className="flex items-start gap-3">
							<div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-blue-50 text-primary">
								<GraduationCap className="size-5" />
							</div>
							<div className="min-w-0 flex-1">
								<h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
									{exam.title} {getStatusBadge(exam.status)}
								</h1>
								{exam.description && (
									<p className="mt-1 text-sm text-muted-foreground">{exam.description}</p>
								)}
							</div>
						</div>

						<Card>
							<CardHeader>
								<CardTitle>Detail Ujian</CardTitle>
							</CardHeader>
							<CardContent className="flex flex-col gap-4">
								<div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-3">
									<div>
										<div className="text-muted-foreground">Mulai</div>
										<div>{new Date(exam.scheduledStartAt).toLocaleString("id-ID")}</div>
									</div>
									<div>
										<div className="text-muted-foreground">Selesai</div>
										<div>{new Date(exam.scheduledEndAt).toLocaleString("id-ID")}</div>
									</div>
									<div>
										<div className="text-muted-foreground">
											{exam.items.length} soal
											{exam.durationMinutes ? ` · ${exam.durationMinutes} menit` : ""}
										</div>
										<div>Nilai maks {exam.maxScore}</div>
									</div>
								</div>

								{/* Daftar subtes — ujian multi-subtes dikerjakan berurutan. */}
								{(exam.subtes?.length ?? 0) > 0 && (
									<div className="flex flex-col gap-1.5 rounded-md border p-3">
										<p className="text-xs font-medium text-muted-foreground">
											Ujian ini terdiri dari {exam.subtes!.length} subtes — dikerjakan
											berurutan dengan durasi masing-masing:
										</p>
										{exam.subtes!.map((s, i) => (
											<div key={s.id} className="flex items-center gap-2 text-sm">
												<span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-bold">
													{i + 1}
												</span>
												<span className="min-w-0 flex-1 truncate">
													{s.name}
													{s.subject?.name ? ` · ${s.subject.name}` : ""}
												</span>
												<span className="text-xs text-muted-foreground">
													{s.durationMinutes} mnt
												</span>
											</div>
										))}
									</div>
								)}

								<div className="flex flex-wrap gap-2">
									{status === "NOT_STARTED" && <Button disabled>Belum Dimulai</Button>}
									{(status === "ENDED" || status === "EXPIRED") && !attempt && (
										<Button disabled>Waktu Ujian Berakhir</Button>
									)}
									{attempt?.status === "IN_PROGRESS" ? (
										<Button onClick={() => router.push(`/siswa/ujian/${attempt.id}`)}>
											Lanjutkan Ujian
										</Button>
									) : attempt?.status === "LOCKED" ? (
										<Button variant="destructive" onClick={() => router.push(`/siswa/ujian/${attempt.id}`)}>
											Dikunci — Lihat Status
										</Button>
									) : attempt?.status === "SUBMITTED" ? (
										<Button
											variant="outline"
											disabled={!attempt.resultReleased}
											onClick={() => router.push(`/siswa/ujian/${attempt.id}`)}
										>
											{attempt.resultReleased ? "Hasil & Pembahasan" : "Hasil Belum Dirilis"}
										</Button>
									) : status === "ACTIVE" ? (
										<Button onClick={() => startM.mutate()} disabled={startM.isPending}>
											{startM.isPending ? "Memulai..." : "Mulai Ujian"}
										</Button>
									) : null}
								</div>
							</CardContent>
						</Card>
					</div>
				)}
			</main>
		</div>
	);
}
