"use client";

// Papan penugasan tutor per minggu — admin memilih tanggal, lalu menugaskan
// tutor ke sesi (kelompok/mapel/jam/ruangan). Tutor per sesi boleh beda-beda
// dan boleh mengajar >1 kelompok dalam 1 hari selama jam tidak bentrok.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { DaySessionEditor } from "@/components/shared/day-session-editor";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { SessionItem } from "@/lib/phase1c-types";

const DAY_NAMES = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const MONTH_NAMES = [
	"Januari", "Februari", "Maret", "April", "Mei", "Juni",
	"Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function mondayOf(d: Date) {
	const day = d.getDay();
	const diff = (day + 6) % 7;
	return new Date(d.getFullYear(), d.getMonth(), d.getDate() - diff);
}
function addDays(d: Date, n: number) {
	return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
function dayKey(d: Date) {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmtTime(iso: string) {
	return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}
function fmtDateLong(d: Date) {
	return d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
function subjectOf(s: SessionItem) {
	return s.subject ?? s.schedule?.subject ?? s.group.level?.subject ?? s.group.program?.subject ?? null;
}

/** Grid mingguan penugasan tutor — alur utama penjadwalan baru (per tanggal). */
export function TutorPlanner({
	onSessionClick,
	selectedSessionId,
}: {
	/** Opsional: buka detail sesi (absensi/override) dari editor tanggal. */
	onSessionClick?: (sessionId: string) => void;
	selectedSessionId?: string | null;
}) {
	const qc = useQueryClient();
	const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
	const [tutorFilter, setTutorFilter] = useState("");
	const [dayOpen, setDayOpen] = useState<string | null>(null);
	const [tutors, setTutors] = useState<Array<{ id: string; user: { name: string } }>>([]);

	const from = weekStart.toISOString();
	const to = new Date(addDays(weekStart, 6).setHours(23, 59, 59, 999)).toISOString();

	const sessionsQ = useQuery({
		queryKey: ["tutor-planner", from],
		queryFn: () =>
			apiFetch<SessionItem[]>(`/sessions?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&take=500`),
	});
	useQuery({
		queryKey: ["tutors", "planner"],
		queryFn: async () => {
			const list = await apiFetch<Array<{ id: string; user: { name: string }; isActive: boolean }>>("/tutors");
			setTutors(list.filter((t) => t.isActive));
			return list;
		},
	});

	const byDay = useMemo(() => {
		const map = new Map<string, SessionItem[]>();
		for (const s of sessionsQ.data ?? []) {
			if (tutorFilter && s.tutorId !== tutorFilter) continue;
			const key = dayKey(new Date(s.startsAt));
			const arr = map.get(key) ?? [];
			arr.push(s);
			map.set(key, arr);
		}
		for (const arr of map.values()) arr.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
		return map;
	}, [sessionsQ.data, tutorFilter]);

	const weekDays = useMemo(
		() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
		[weekStart],
	);
	const daySessions = dayOpen ? byDay.get(dayOpen) ?? [] : [];

	function invalidate() {
		qc.invalidateQueries({ queryKey: ["tutor-planner"] });
	}

	const todayKey = dayKey(new Date());
	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<h2 className="text-xl font-semibold tracking-tight">Penugasan Tutor</h2>
					<p className="text-sm text-muted-foreground">
						Pilih tanggal, lalu tentukan tutor mengajar di kelompok/mapel/jam/ruangan apa — tiap minggu bisa berbeda.
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<select
						className="h-9 rounded-md border px-2 text-sm"
						value={tutorFilter}
						onChange={(e) => setTutorFilter(e.target.value)}
						aria-label="Filter tutor"
					>
						<option value="">Semua tutor</option>
						{tutors.map((t) => (
							<option key={t.id} value={t.id}>{t.user.name}</option>
						))}
					</select>
					<div className="flex items-center gap-1">
						<Button variant="outline" size="icon" className="size-8" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Minggu sebelumnya">
							<ChevronLeft className="size-4" />
						</Button>
						<Button variant="ghost" size="sm" className="h-8" onClick={() => setWeekStart(mondayOf(new Date()))}>
							Minggu ini
						</Button>
						<Button variant="outline" size="icon" className="size-8" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Minggu berikutnya">
							<ChevronRight className="size-4" />
						</Button>
					</div>
				</div>
			</div>
			<p className="text-sm font-medium">
				{weekDays[0].getDate()} {MONTH_NAMES[weekDays[0].getMonth()]} — {weekDays[6].getDate()} {MONTH_NAMES[weekDays[6].getMonth()]} {weekDays[6].getFullYear()}
			</p>

			{sessionsQ.isLoading ? <Skeleton className="h-56 w-full" /> : null}
			{sessionsQ.isError ? (
				<Card><CardContent className="py-8 text-center text-sm text-destructive">Gagal memuat sesi minggu ini.</CardContent></Card>
			) : null}

			{sessionsQ.data ? (
				<div className="overflow-x-auto">
					<div className="grid min-w-[840px] grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border">
						{weekDays.map((d, i) => {
							const key = dayKey(d);
							const items = byDay.get(key) ?? [];
							return (
								<button
									key={key}
									type="button"
									onClick={() => setDayOpen(key)}
									className={cn(
										"flex min-h-28 flex-col items-stretch gap-1 bg-background p-1.5 text-left transition-colors hover:bg-accent",
										key === todayKey && "bg-brand-blue-50/60",
									)}
								>
									<span className={cn(
										"flex items-center gap-1 text-[11px] font-semibold",
										key === todayKey ? "text-brand-blue-700" : "text-muted-foreground",
									)}>
										{DAY_NAMES[i]} {d.getDate()}
										{key === todayKey ? <span className="rounded bg-brand-blue-600 px-1 text-[9px] text-white">hari ini</span> : null}
									</span>
									{items.map((s) => (
										<span
											key={s.id}
											className={cn(
												"rounded border-l-2 px-1 py-0.5 text-[10px] leading-tight",
												s.status === "CANCELLED"
													? "border-destructive/50 bg-destructive/5 text-destructive line-through"
													: s.tutorId
														? "border-brand-blue-400 bg-brand-blue-50 text-brand-blue-800"
														: "border-warning-400 bg-warning-50 text-warning-800",
											)}
										>
											<span className="block truncate font-medium">{fmtTime(s.startsAt)} {s.group.name}</span>
											<span className="block truncate">
												{s.tutor?.user.name ?? "Belum ada tutor"}
												{subjectOf(s) ? ` · ${subjectOf(s)!.code}` : ""}
											</span>
										</span>
									))}
									{items.length === 0 ? (
										<span className="mt-1 px-1 text-[10px] text-muted-foreground/60">—</span>
									) : null}
								</button>
							);
						})}
					</div>
				</div>
			) : null}

			<Dialog open={dayOpen !== null} onOpenChange={(o) => { if (!o) setDayOpen(null); }}>
				<DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
					<DialogHeader>
						<DialogTitle>{dayOpen ? fmtDateLong(new Date(`${dayOpen}T12:00:00`)) : ""}</DialogTitle>
						<DialogDescription>
							{daySessions.length} sesi hari ini — ganti pengajar lewat dropdown atau buat sesi baru.
						</DialogDescription>
					</DialogHeader>
					{dayOpen ? (
						<DaySessionEditor
							dateKey={dayOpen}
							sessions={daySessions}
							onChanged={invalidate}
							onSessionClick={onSessionClick}
							selectedSessionId={selectedSessionId}
							defaultTutorId={tutorFilter}
						/>
					) : null}
				</DialogContent>
			</Dialog>
		</div>
	);
}
