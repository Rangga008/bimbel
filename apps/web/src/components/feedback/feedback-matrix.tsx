"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
	ChevronLeft,
	ChevronRight,
	Download,
	MessageSquareText,
	Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { apiFetch, apiFetchBlob, ApiError } from "@/lib/api-client";

interface MatrixCell {
	content: string;
	authorRole: "SISWA" | "ORANG_TUA";
	author: { name: string };
	updatedAt: string;
}
interface FeedbackMatrix {
	group: {
		id: string;
		name: string;
		code: string | null;
		programName: string | null;
		levelName: string | null;
	};
	weekStart: string;
	weekEnd: string;
	subjects: Array<{ id: string; code: string; name: string }>;
	students: Array<{
		studentId: string;
		name: string;
		cells: Record<string, MatrixCell>;
	}>;
}
interface GroupOption {
	id: string;
	name: string;
	code: string | null;
}

function mondayOf(d: Date): Date {
	const day = d.getDay();
	const diff = (day + 6) % 7;
	return new Date(d.getFullYear(), d.getMonth(), d.getDate() - diff);
}
function fmtDay(d: Date) {
	return new Intl.DateTimeFormat("id-ID", {
		weekday: "short",
		day: "numeric",
		month: "short",
	}).format(d);
}

/**
 * Tabel feedback mingguan sebuah kelompok — baris siswa, kolom mapel.
 * Dipakai tutor (semua tutor anggota kelompok) & staff; + export Excel.
 */
export function FeedbackMatrix({
	groupId: fixedGroupId,
	showGroupPicker = false,
	title = "Feedback Mingguan",
}: {
	groupId?: string;
	showGroupPicker?: boolean;
	title?: string;
}) {
	const [groupId, setGroupId] = useState(fixedGroupId ?? "");
	const [weekStart, setWeekStart] = useState<Date>(() => mondayOf(new Date()));
	const [cellView, setCellView] = useState<{
		student: string;
		subject: string;
		cell: MatrixCell;
	} | null>(null);
	const [exporting, setExporting] = useState(false);
	const weekIso = weekStart.toISOString();
	const weekEnd = new Date(weekStart.getTime() + 6 * 86400000);

	const groupsQ = useQuery({
		queryKey: ["groups", "feedback-picker"],
		queryFn: () => apiFetch<GroupOption[]>("/groups"),
		enabled: showGroupPicker && !fixedGroupId,
	});
	const effectiveGroupId = fixedGroupId ?? groupId;

	const matrixQ = useQuery({
		queryKey: ["feedback-matrix", effectiveGroupId, weekIso],
		queryFn: () =>
			apiFetch<FeedbackMatrix>(
				`/groups/${effectiveGroupId}/feedback?week=${encodeURIComponent(weekIso)}`,
			),
		enabled: !!effectiveGroupId,
	});
	const m = matrixQ.data;

	async function exportExcel() {
		setExporting(true);
		try {
			const blob = await apiFetchBlob(
				`/groups/${effectiveGroupId}/feedback/export?week=${encodeURIComponent(weekIso)}`,
			);
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `feedback-${m?.group.code ?? "kelompok"}-${weekIso.slice(0, 10)}.xlsx`;
			a.click();
			URL.revokeObjectURL(url);
		} catch (e) {
			toast.error(
				e instanceof ApiError ? e.message : "Gagal mengekspor feedback.",
			);
		} finally {
			setExporting(false);
		}
	}

	return (
		<Card>
			<CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between">
				<div className="min-w-0">
					<CardTitle className="text-base">{title}</CardTitle>
					{m ? (
						<p className="mt-0.5 truncate text-xs text-muted-foreground">
							{m.group.name}
							{m.group.levelName ? ` — ${m.group.levelName}` : ""}
						</p>
					) : null}
				</div>
				<div className="flex flex-wrap items-center gap-2">
					{showGroupPicker && !fixedGroupId ? (
						<select
							className="h-9 max-w-56 rounded-md border px-2 text-sm"
							value={groupId}
							onChange={(e) => setGroupId(e.target.value)}
						>
							<option value="">— Pilih kelompok —</option>
							{(groupsQ.data ?? []).map((g) => (
								<option key={g.id} value={g.id}>
									{g.name}
								</option>
							))}
						</select>
					) : null}
					<div className="flex items-center gap-1">
						<Button
							variant="outline"
							size="icon"
							className="size-8"
							onClick={() =>
								setWeekStart(new Date(weekStart.getTime() - 7 * 86400000))
							}
						>
							<ChevronLeft className="size-4" />
						</Button>
						<span className="whitespace-nowrap px-1 text-xs font-medium">
							{fmtDay(weekStart)} – {fmtDay(weekEnd)}
						</span>
						<Button
							variant="outline"
							size="icon"
							className="size-8"
							onClick={() =>
								setWeekStart(new Date(weekStart.getTime() + 7 * 86400000))
							}
						>
							<ChevronRight className="size-4" />
						</Button>
					</div>
					<Button
						variant="outline"
						size="sm"
						disabled={!effectiveGroupId || exporting}
						onClick={exportExcel}
					>
						<Download className="size-4" />
						{exporting ? "Mengekspor..." : "Excel"}
					</Button>
				</div>
			</CardHeader>
			<CardContent>
				{!effectiveGroupId ? (
					<EmptyState
						icon={Users}
						title="Pilih kelompok"
						description="Pilih kelompok untuk melihat tabel feedback mingguan."
					/>
				) : matrixQ.isLoading ? (
					<Skeleton className="h-40 w-full" />
				) : matrixQ.isError ? (
					<p className="py-6 text-center text-sm text-destructive">
						Gagal memuat feedback — Anda mungkin tidak punya akses ke kelompok ini.
					</p>
				) : m && m.subjects.length === 0 ? (
					<EmptyState
						icon={MessageSquareText}
						title="Belum ada mapel"
						description="Kelompok ini belum punya mapel yang dikonfigurasi di jenjangnya."
					/>
				) : m ? (
					<div className="overflow-x-auto rounded-md border">
						<table className="w-full min-w-[560px] text-sm">
							<thead>
								<tr className="border-b bg-muted/50">
									<th className="px-3 py-2 text-left font-medium whitespace-nowrap">
										Nama
									</th>
									{m.subjects.map((s) => (
										<th
											key={s.id}
											className="px-3 py-2 text-left font-medium whitespace-nowrap"
										>
											{s.name}
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{m.students.map((st) => (
									<tr key={st.studentId} className="border-b last:border-0">
										<td className="px-3 py-2 align-top font-medium whitespace-nowrap">
											{st.name}
										</td>
										{m.subjects.map((s) => {
											const cell = st.cells[s.id];
											return (
												<td key={s.id} className="max-w-64 px-3 py-2 align-top">
													{cell ? (
														<button
															type="button"
															className="w-full cursor-pointer text-left"
															onClick={() =>
																setCellView({
																	student: st.name,
																	subject: s.name,
																	cell,
																})
															}
														>
															<span className="line-clamp-3 text-xs leading-relaxed whitespace-pre-wrap">
																{cell.content}
															</span>
															<span className="mt-1 block text-[10px] text-muted-foreground">
																{cell.author.name}
																{cell.authorRole === "ORANG_TUA"
																	? " (ortu)"
																	: " (siswa)"}
															</span>
														</button>
													) : (
														<Badge
															variant="outline"
															className="text-muted-foreground"
														>
															Belum diisi
														</Badge>
													)}
												</td>
											);
										})}
									</tr>
								))}
								{m.students.length === 0 ? (
									<tr>
										<td
											colSpan={m.subjects.length + 1}
											className="px-3 py-8 text-center text-sm text-muted-foreground"
										>
											Belum ada siswa di kelompok ini.
										</td>
									</tr>
								) : null}
							</tbody>
						</table>
					</div>
				) : null}
			</CardContent>

			<Dialog open={cellView !== null} onOpenChange={(o) => !o && setCellView(null)}>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>
							{cellView?.student} — {cellView?.subject}
						</DialogTitle>
					</DialogHeader>
					<p className="text-sm leading-relaxed whitespace-pre-wrap">
						{cellView?.cell.content}
					</p>
					<p className="text-xs text-muted-foreground">
						Diisi oleh {cellView?.cell.author.name}
						{cellView?.cell.authorRole === "ORANG_TUA" ? " (ortu)" : " (siswa)"}
						{cellView?.cell.updatedAt
							? ` — ${new Date(cellView.cell.updatedAt).toLocaleString("id-ID")}`
							: ""}
					</p>
				</DialogContent>
			</Dialog>
		</Card>
	);
}
