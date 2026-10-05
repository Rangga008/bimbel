"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/shared/empty-state";
import { MessageSquareText } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api-client";

interface SubjectRef {
	id: string;
	code: string;
	name: string;
}
interface FeedbackContext {
	authorRole: "SISWA" | "ORANG_TUA";
	students: Array<{
		id: string;
		name: string;
		groups: Array<{
			id: string;
			name: string;
			code: string | null;
			subjects: SubjectRef[];
		}>;
	}>;
}
interface MyFeedback {
	weekStart: string;
	entries: Array<{
		id: string;
		groupId: string;
		studentId: string;
		subjectId: string;
		content: string;
		authorRole: "SISWA" | "ORANG_TUA";
		author: { name: string };
		updatedAt: string;
	}>;
}

function mondayOf(d: Date): Date {
	const day = d.getDay();
	const diff = (day + 6) % 7;
	return new Date(d.getFullYear(), d.getMonth(), d.getDate() - diff);
}
function fmtDay(d: Date) {
	return new Intl.DateTimeFormat("id-ID", {
		weekday: "long",
		day: "numeric",
		month: "long",
		year: "numeric",
	}).format(d);
}

/**
 * Form feedback mingguan untuk ortu & siswa — 1 textarea per mapel per
 * kelompok per minggu. Simpan = upsert per mapel.
 */
export function FeedbackForm() {
	const qc = useQueryClient();
	const [weekStart, setWeekStart] = useState<Date>(() => mondayOf(new Date()));
	const [drafts, setDrafts] = useState<Record<string, string>>({});
	// Ortu dengan >1 anak wajib pilih anak dulu — feedback tidak dicampur.
	const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
	const weekIso = weekStart.toISOString();
	const weekEnd = new Date(weekStart.getTime() + 6 * 86400000);

	const contextQ = useQuery({
		queryKey: ["feedback-context"],
		queryFn: () => apiFetch<FeedbackContext>("/me/feedback/context"),
	});
	const mineQ = useQuery({
		queryKey: ["my-feedback", weekIso],
		queryFn: () =>
			apiFetch<MyFeedback>(`/me/feedback?week=${encodeURIComponent(weekIso)}`),
	});

	const existing = useMemo(() => {
		const map = new Map<string, { content: string; authorName: string; authorRole: string }>();
		for (const e of mineQ.data?.entries ?? []) {
			map.set(`${e.studentId}:${e.groupId}:${e.subjectId}`, {
				content: e.content,
				authorName: e.author.name,
				authorRole: e.authorRole,
			});
		}
		return map;
	}, [mineQ.data]);

	const saveM = useMutation({
		mutationFn: async (
			items: Array<{ studentId: string; groupId: string; subjectId: string; content: string }>,
		) => {
			for (const it of items) {
				await apiFetch("/me/feedback", {
					method: "POST",
					body: { ...it, weekStart: weekIso },
				});
			}
		},
		onSuccess: () => {
			toast.success("Feedback tersimpan — terima kasih!");
			setDrafts({});
			qc.invalidateQueries({ queryKey: ["my-feedback"] });
		},
		onError: (e) =>
			toast.error(e instanceof ApiError ? e.message : "Gagal menyimpan feedback."),
	});

	const allStudents = contextQ.data?.students ?? [];
	// Siswa tunggal otomatis terpilih; multi-anak harus pilih eksplisit.
	const activeStudentId =
		allStudents.length === 1 ? allStudents[0].id : selectedStudentId;
	const students = allStudents.filter((s) => s.id === activeStudentId);
	const key = (studentId: string, groupId: string, subjectId: string) =>
		`${studentId}:${groupId}:${subjectId}`;

	function saveStudentGroup(
		studentId: string,
		groupId: string,
		subjects: SubjectRef[],
	) {
		const items = subjects
			.map((s) => {
				const k = key(studentId, groupId, s.id);
				const val = (drafts[k] ?? existing.get(k)?.content ?? "").trim();
				return val
					? { studentId, groupId, subjectId: s.id, content: val }
					: null;
			})
			.filter((x): x is NonNullable<typeof x> => x !== null);
		if (!items.length) {
			toast.error("Isi minimal satu feedback mapel dulu.");
			return;
		}
		saveM.mutate(items);
	}

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-1">
				<h1 className="text-2xl font-semibold tracking-tight">Feedback Mingguan</h1>
				<p className="text-sm text-muted-foreground">
					Ceritakan materi yang dipelajari di sekolah minggu ini — membantu tutor menyesuaikan materi bimbel.
				</p>
			</div>

			{/* Langkah 1 — pilih anak (wajib kalau lebih dari satu) */}
			{allStudents.length > 1 ? (
				<div className="flex flex-col gap-2">
					<p className="text-sm font-medium">Pilih anak dulu:</p>
					<div className="flex flex-wrap gap-2">
						{allStudents.map((st) => (
							<button
								key={st.id}
								type="button"
								onClick={() => {
									setSelectedStudentId(st.id);
									setDrafts({});
								}}
								className={`rounded-lg border px-4 py-2 text-left text-sm transition-colors ${
									activeStudentId === st.id
										? "border-primary bg-primary/5 font-medium ring-1 ring-primary"
										: "hover:border-primary/50"
								}`}
							>
								{st.name}
								<span className="block text-xs text-muted-foreground">
									{st.groups.length} kelompok
								</span>
							</button>
						))}
					</div>
				</div>
			) : null}
			{allStudents.length > 1 && !activeStudentId ? (
				<Card>
					<CardContent className="py-8 text-center text-sm text-muted-foreground">
						Pilih salah satu anak di atas untuk melihat &amp; mengisi feedback mingguannya.
					</CardContent>
				</Card>
			) : null}

			{/* Langkah 2 — pilih minggu (hanya setelah anak dipilih) */}
			{activeStudentId ? (
				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						size="icon"
						onClick={() => setWeekStart(new Date(weekStart.getTime() - 7 * 86400000))}
					>
						<ChevronLeft className="size-4" />
					</Button>
					<p className="min-w-0 flex-1 text-center text-sm font-medium">
						{fmtDay(weekStart)} — {fmtDay(weekEnd)}
					</p>
					<Button
						variant="outline"
						size="icon"
						onClick={() => setWeekStart(new Date(weekStart.getTime() + 7 * 86400000))}
					>
						<ChevronRight className="size-4" />
					</Button>
				</div>
			) : null}

			{contextQ.isLoading || mineQ.isLoading ? (
				<Skeleton className="h-40 w-full" />
			) : null}
			{contextQ.isError ? (
				<Card>
					<CardContent className="py-10 text-center text-sm text-destructive">
						Gagal memuat data feedback.
					</CardContent>
				</Card>
			) : null}

			{contextQ.data && activeStudentId && !students.some((s) => s.groups.length > 0) ? (
				<EmptyState
					icon={MessageSquareText}
					title="Belum ada kelompok"
					description="Anak Anda belum ditempatkan di kelompok — feedback bisa diisi setelah masuk kelompok."
				/>
			) : null}

			{students.map((st) =>
				st.groups.map((g) => (
					<Card key={`${st.id}:${g.id}`}>
						<CardHeader className="pb-2">
							<CardTitle className="text-base">
								{st.name} — {g.name}
								{g.code ? <span className="ml-1 font-mono text-xs text-muted-foreground">({g.code})</span> : null}
							</CardTitle>
						</CardHeader>
						<CardContent className="flex flex-col gap-4">
							{g.subjects.length === 0 ? (
								<p className="text-sm text-muted-foreground">
									Kelompok ini belum punya mapel yang dikonfigurasi.
								</p>
							) : null}
							{g.subjects.map((sub) => {
								const k = key(st.id, g.id, sub.id);
								const prev = existing.get(k);
								return (
									<div key={k} className="flex flex-col gap-1.5">
										<label className="text-sm font-medium">
											{sub.name}
											<span className="ml-1 font-mono text-xs text-muted-foreground">({sub.code})</span>
										</label>
										<Textarea
											rows={2}
											placeholder={`Apa yang dipelajari ${st.name} di mapel ${sub.name} minggu ini?`}
											value={drafts[k] ?? prev?.content ?? ""}
											onChange={(e) =>
												setDrafts((d) => ({ ...d, [k]: e.target.value }))
											}
										/>
										{prev ? (
											<p className="text-xs text-muted-foreground">
												Terakhir diisi oleh {prev.authorName}
												{prev.authorRole === "ORANG_TUA" ? " (ortu)" : " (siswa)"}
											</p>
										) : null}
									</div>
								);
							})}
							{g.subjects.length > 0 ? (
								<div>
									<Button
										size="sm"
										disabled={saveM.isPending}
										onClick={() => saveStudentGroup(st.id, g.id, g.subjects)}
									>
										{saveM.isPending ? "Menyimpan..." : "Simpan Feedback"}
									</Button>
								</div>
							) : null}
						</CardContent>
					</Card>
				)),
			)}
		</div>
	);
}
