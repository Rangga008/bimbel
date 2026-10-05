"use client";
// Kalender bulanan sesi — dipakai admin/tutor/siswa/ortu. Klik tanggal
// menampilkan sesi hari itu (kelompok/mapel, jam, tutor, ruangan, status).
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, ChevronLeft, ChevronRight, DoorOpen, Flag, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiErrorState } from "@/components/shared/api-error-state";
import { DaySessionEditor } from "@/components/shared/day-session-editor";
import { apiFetch } from "@/lib/api-client";
import type { DayNoteItem, SessionItem } from "@/lib/phase1c-types";
import { cn } from "@/lib/utils";

const DAY_NAMES = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const MONTH_NAMES = [
	"Januari", "Februari", "Maret", "April", "Mei", "Juni",
	"Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function dayKey(d: Date) {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtTime(iso: string) {
	return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

const STATUS_BADGE: Record<string, "secondary" | "outline" | "destructive"> = {
	SCHEDULED: "secondary",
	COMPLETED: "outline",
	CANCELLED: "destructive",
};

export function SessionCalendar({
	endpoint,
	onSessionClick,
	selectedSessionId,
	editable,
}: {
	/** Endpoint list sesi — mendukung query from/to ISO. */
	endpoint: string;
	/** Opsional: klik kartu sesi di detail harian (mis. override admin). */
	onSessionClick?: (sessionId: string) => void;
	selectedSessionId?: string | null;
	/** Mode kelola: klik tanggal membuka editor sesi (tugas tutor/buat sesi). */
	editable?: boolean;
}) {
	const qc = useQueryClient();
	const today = new Date();
	const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
	const [selectedDay, setSelectedDay] = useState<string | null>(null);

	// Rentang fetch: seluruh bulan + margin minggu (grid 6 minggu).
	const from = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1).toISOString();
	const to = new Date(cursor.getFullYear(), cursor.getMonth() + 2, 0, 23, 59, 59).toISOString();
	const sep = endpoint.includes("?") ? "&" : "?";
	const q = useQuery({
		queryKey: ["session-calendar", endpoint, cursor.getFullYear(), cursor.getMonth()],
		queryFn: () => apiFetch<SessionItem[]>(`${endpoint}${sep}from=${from}&to=${to}&take=500`),
	});
	// Catatan tanggal (libur/rapat/darurat) sebulan — tampil di sel & dialog hari.
	const notesQ = useQuery({
		queryKey: ["day-notes", "calendar", cursor.getFullYear(), cursor.getMonth()],
		queryFn: () => apiFetch<DayNoteItem[]>(`/day-notes?from=${from}&to=${to}`),
	});
	const notesByDay = useMemo(() => {
		const map = new Map<string, DayNoteItem[]>();
		for (const n of notesQ.data ?? []) {
			const key = dayKey(new Date(n.date));
			map.set(key, [...(map.get(key) ?? []), n]);
		}
		return map;
	}, [notesQ.data]);

	const byDay = useMemo(() => {
		const map = new Map<string, SessionItem[]>();
		for (const s of q.data ?? []) {
			const key = dayKey(new Date(s.startsAt));
			const arr = map.get(key) ?? [];
			arr.push(s);
			map.set(key, arr);
		}
		for (const arr of map.values()) {
			arr.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
		}
		return map;
	}, [q.data]);

	// Grid 6 minggu mulai Senin.
	const cells = useMemo(() => {
		const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
		// getDay(): 0=Minggu..6=Sabtu -> offset Senin=0
		const offset = (first.getDay() + 6) % 7;
		const start = new Date(first);
		start.setDate(first.getDate() - offset);
		return Array.from({ length: 42 }, (_, i) => {
			const d = new Date(start);
			d.setDate(start.getDate() + i);
			return d;
		});
	}, [cursor]);

	const todayKey = dayKey(today);
	const daySessions = selectedDay ? byDay.get(selectedDay) ?? [] : [];

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center justify-between gap-2">
				<Button
					variant="outline" size="icon" className="size-8"
					onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
					aria-label="Bulan sebelumnya"
				>
					<ChevronLeft className="size-4" />
				</Button>
				<p className="text-sm font-semibold">
					{MONTH_NAMES[cursor.getMonth()]} {cursor.getFullYear()}
				</p>
				<div className="flex items-center gap-1">
					<Button
						variant="ghost" size="sm" className="h-8"
						onClick={() => { setCursor(new Date(today.getFullYear(), today.getMonth(), 1)); setSelectedDay(todayKey); }}
					>
						Hari ini
					</Button>
					<Button
						variant="outline" size="icon" className="size-8"
						onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
						aria-label="Bulan berikutnya"
					>
						<ChevronRight className="size-4" />
					</Button>
				</div>
			</div>

			{q.isLoading ? <Skeleton className="h-72 w-full" /> : null}
			{q.isError ? <ApiErrorState error={q.error} onRetry={() => q.refetch()} /> : null}

			{q.data ? (
				<Card>
					<CardContent className="p-2 sm:p-3">
						<div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border text-center text-[11px] font-medium text-muted-foreground">
							{DAY_NAMES.map((d) => (
								<div key={d} className="bg-muted px-1 py-1.5">{d}</div>
							))}
							{cells.map((d) => {
								const key = dayKey(d);
								const items = byDay.get(key) ?? [];
								const inMonth = d.getMonth() === cursor.getMonth();
								const isToday = key === todayKey;
								const hasNote = (notesByDay.get(key) ?? []).length > 0;
								return (
									<button
										key={key}
										type="button"
										onClick={() => setSelectedDay(key)}
										className={cn(
											"flex min-h-14 flex-col items-stretch gap-0.5 bg-background p-1 text-left transition-colors hover:bg-accent sm:min-h-20 sm:p-1.5",
											!inMonth && "opacity-40",
											hasNote && "bg-amber-50 dark:bg-amber-500/10",
											selectedDay === key && "bg-brand-blue-50 ring-1 ring-inset ring-brand-blue-500",
										)}
									>
										<span
											className={cn(
												"flex items-center gap-1 self-start rounded-full px-1 text-[11px] tabular-nums",
												isToday && "bg-primary font-semibold text-primary-foreground",
											)}
										>
											{d.getDate()}
											{hasNote ? <Flag className="size-2.5 text-amber-600" /> : null}
										</span>
										{items.slice(0, 2).map((s) => (
											<span
												key={s.id}
												className={cn(
													"truncate rounded px-1 py-0.5 text-[10px] leading-tight",
													s.status === "CANCELLED"
														? "bg-destructive/10 text-destructive line-through"
														: "bg-brand-blue-100 text-brand-blue-800 dark:bg-brand-blue-500/20 dark:text-brand-blue-200",
												)}
											>
												{fmtTime(s.startsAt)} {s.childNames?.length ? s.childNames.join("/") : s.group.name}
											</span>
										))}
										{items.length > 2 ? (
											<span className="px-1 text-[10px] text-muted-foreground">+{items.length - 2} lagi</span>
										) : null}
									</button>
								);
							})}
						</div>
					</CardContent>
				</Card>
			) : null}

			<Dialog open={selectedDay !== null} onOpenChange={(o) => { if (!o) setSelectedDay(null); }}>
				<DialogContent className={cn("max-h-[80vh] overflow-y-auto", editable ? "sm:max-w-2xl" : "sm:max-w-lg")}>
					<DialogHeader>
						<DialogTitle>
							{selectedDay
								? new Date(`${selectedDay}T12:00:00`).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
								: ""}
						</DialogTitle>
						<DialogDescription>
							{editable
								? `${daySessions.length} sesi — ganti pengajar atau buat sesi baru.`
								: daySessions.length > 0
									? `${daySessions.length} sesi pada tanggal ini.`
									: "Tidak ada sesi pada tanggal ini."}
						</DialogDescription>
					</DialogHeader>
					{(selectedDay ? notesByDay.get(selectedDay) ?? [] : []).map((n) => (
						<p key={n.id} className="flex items-start gap-1.5 rounded-md border border-amber-300/60 bg-amber-50/60 px-2.5 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
							<Flag className="mt-0.5 size-3 shrink-0" />
							<span>
								<Badge variant="outline" className="mr-1.5">{n.type}</Badge>
								<span className="font-medium">{n.title}</span>
								{n.note ? ` — ${n.note}` : ""}
							</span>
						</p>
					))}
					{editable && selectedDay ? (
						<DaySessionEditor
							dateKey={selectedDay}
							sessions={daySessions}
							onChanged={() => {
								qc.invalidateQueries({ queryKey: ["session-calendar"] });
								qc.invalidateQueries({ queryKey: ["day-notes"] });
							}}
							onSessionClick={onSessionClick}
							selectedSessionId={selectedSessionId}
						/>
					) : null}
					{editable ? null : (
					<div className="flex flex-col gap-2">
						{daySessions.map((s) => (
							<button
								key={s.id}
								type="button"
								disabled={!onSessionClick}
								onClick={() => {
									onSessionClick?.(s.id);
									// Pilih sesi menutup dialog tanggal — alur absensi lanjut di luar.
									if (onSessionClick) setSelectedDay(null);
								}}
								className={cn(
									"flex items-center gap-3 rounded-lg border p-2.5 text-left transition-colors",
									onSessionClick && "hover:border-brand-blue-500 hover:bg-accent",
									selectedSessionId === s.id && "border-brand-blue-500 bg-brand-blue-50",
								)}
							>
								<div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
									<CalendarClock className="size-4" />
								</div>
								<div className="min-w-0 flex-1">
									<p className="truncate text-sm font-medium">
										{s.group.name}
										{/* Mapel efektif: mapel sesi → mapel jadwal → mapel level → mapel program. */}
										{(s.subject ?? s.schedule?.subject ?? s.group.level?.subject ?? s.group.program?.subject) ? (
											<span className="ml-1.5 text-xs font-normal text-muted-foreground">
												{(s.subject ?? s.schedule?.subject ?? s.group.level?.subject ?? s.group.program?.subject)!.code} — {(s.subject ?? s.schedule?.subject ?? s.group.level?.subject ?? s.group.program?.subject)!.name}
												{s.group.level ? ` · ${s.group.level.name}` : ""}
											</span>
										) : s.group.program ? (
											<span className="ml-1.5 text-xs font-normal text-muted-foreground">
												{s.group.program.name}{s.group.level ? ` · ${s.group.level.name}` : ""}
											</span>
										) : null}
									</p>
									<p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
										{fmtTime(s.startsAt)}–{fmtTime(s.endsAt)}
										<User className="ml-1 size-3.5 shrink-0" /> {s.tutor ? `${s.tutor.user.name}${s.tutor.user.phone ? ` · ${s.tutor.user.phone}` : ""}` : "Tutor menyusul"}
										<DoorOpen className="ml-1 size-3.5 shrink-0" /> {s.room ? s.room.name : "Ruang menyusul"}
									</p>
									{s.childNames?.length ? (
										<p className="mt-0.5 flex flex-wrap gap-1">
											{s.childNames.map((n) => (
												<Badge key={n} variant="secondary" className="text-[10px]">{n}</Badge>
											))}
										</p>
									) : null}
									{s.tutorAbsenceNote ? (
										<p className="mt-0.5 flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
											<Flag className="size-3 shrink-0" /> Tutor berhalangan: {s.tutorAbsenceNote}
										</p>
									) : null}
								</div>
								<Badge variant={STATUS_BADGE[s.status] ?? "outline"}>{s.status}</Badge>
							</button>
						))}
					</div>
					)}
				</DialogContent>
			</Dialog>
		</div>
	);
}
