"use client";

// Editor sesi per tanggal (dipakai papan tutor mingguan & kalender bulanan):
// daftar sesi hari itu dengan dropdown pengajar + form tugaskan tutor ke sesi
// baru (tutor → kelompok → mapel → ruangan → jam). Absensi otomatis mengikuti
// tutor sesi yang tersimpan.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, DoorOpen, Flag, ListChecks, Pencil, Plus, Trash2, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, ApiError } from "@/lib/api-client";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { cn } from "@/lib/utils";
import type { TutorItem } from "@/lib/phase1a-types";
import type { DayNoteItem, RoomItem, SessionItem } from "@/lib/phase1c-types";
import type { GroupDetail } from "@/lib/phase1b-types";

interface CreateForm {
	tutorId: string;
	groupId: string;
	subjectId: string;
	roomId: string;
	start: string;
	end: string;
}

const EMPTY: CreateForm = { tutorId: "", groupId: "", subjectId: "", roomId: "", start: "", end: "" };

function fmtTime(iso: string) {
	return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}
function subjectOf(s: SessionItem) {
	return s.subject ?? s.schedule?.subject ?? s.group.level?.subject ?? s.group.program?.subject ?? null;
}

export function DaySessionEditor({
	dateKey,
	sessions,
	onChanged,
	onSessionClick,
	selectedSessionId,
	defaultTutorId = "",
}: {
	/** Tanggal terpilih, format YYYY-MM-DD. */
	dateKey: string;
	sessions: SessionItem[];
	/** Dipanggil setelah sesi berubah (buat/ganti tutor) agar parent me-refetch. */
	onChanged: () => void;
	/** Opsional: buka detail sesi (absensi/override/hapus). */
	onSessionClick?: (sessionId: string) => void;
	selectedSessionId?: string | null;
	/** Tutor bawaan untuk form buat (mis. filter tutor aktif). */
	defaultTutorId?: string;
}) {
	const qc = useQueryClient();
	const [form, setForm] = useState<CreateForm>({ ...EMPTY, tutorId: defaultTutorId });
	const [editingId, setEditingId] = useState<string | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<SessionItem | null>(null);
	const [editForm, setEditForm] = useState({ start: "", end: "", subjectId: "", roomId: "", status: "" });
	const [noteForm, setNoteForm] = useState({ type: "LIBUR", title: "", note: "" });
	const [noteOpen, setNoteOpen] = useState(false);

	// Catatan tanggal (libur/rapat/darurat) untuk hari yang sedang dibuka.
	const dayNotesQ = useQuery({
		queryKey: ["day-notes", dateKey],
		queryFn: () => apiFetch<DayNoteItem[]>(`/day-notes?from=${dateKey}&to=${dateKey}`),
	});
	const createNoteM = useMutation({
		mutationFn: () =>
			apiFetch("/day-notes", {
				method: "POST",
				body: { date: dateKey, type: noteForm.type, title: noteForm.title.trim(), note: noteForm.note.trim() || undefined },
			}),
		onSuccess: () => {
			toast.success("Catatan tanggal disimpan — ikut tampil di jadwal & reminder mingguan.");
			setNoteForm({ type: "LIBUR", title: "", note: "" });
			setNoteOpen(false);
			qc.invalidateQueries({ queryKey: ["day-notes"] });
		},
		onError: (e) => toast.error(e instanceof ApiError ? e.message : "Gagal menyimpan catatan."),
	});
	const deleteNoteM = useMutation({
		mutationFn: (id: string) => apiFetch(`/day-notes/${id}`, { method: "DELETE" }),
		onSuccess: () => {
			toast.success("Catatan dihapus.");
			qc.invalidateQueries({ queryKey: ["day-notes"] });
		},
		onError: (e) => toast.error(e instanceof ApiError ? e.message : "Gagal menghapus catatan."),
	});

	const tutorsQ = useQuery({
		queryKey: ["tutors", "planner"],
		queryFn: () => apiFetch<TutorItem[]>("/tutors"),
	});
	const roomsQ = useQuery({
		queryKey: ["rooms", "planner"],
		queryFn: () => apiFetch<RoomItem[]>("/rooms"),
	});
	// Key "group-detail" (bukan ["groups", id]) agar tidak tabrakan dengan cache
	// daftar kelompok ["groups", ""] yang berisi array — penyebab crash .subject.
	const groupDetailQ = useQuery({
		queryKey: ["group-detail", form.groupId],
		queryFn: () => apiFetch<GroupDetail>(`/groups/${form.groupId}`),
		enabled: !!form.groupId,
	});
	// Detail kelompok dari sesi yang sedang diedit (untuk pilihan mapelnya).
	const editingSession = sessions.find((s) => s.id === editingId);
	const editGroupQ = useQuery({
		queryKey: ["group-detail", editingSession?.groupId ?? ""],
		queryFn: () => apiFetch<GroupDetail>(`/groups/${editingSession!.groupId}`),
		enabled: !!editingSession,
	});
	const editSubjects = useMemo(() => {
		const gd = editGroupQ.data;
		if (!gd || Array.isArray(gd) || !gd.program) return [] as Array<{ id: string; code: string; name: string }>;
		const map = new Map<string, { id: string; code: string; name: string }>();
		for (const ls of gd.level?.levelSubjects ?? []) map.set(ls.subject.id, ls.subject);
		if (gd.level?.subject) map.set(gd.level.subject.id, gd.level.subject);
		if (gd.program.subject) map.set(gd.program.subject.id, gd.program.subject);
		return [...map.values()];
	}, [editGroupQ.data]);

	const tutors = tutorsQ.data ?? [];
	const activeTutors = tutors.filter((t) => t.isActive);
	const selectedTutor = tutors.find((t) => t.id === form.tutorId);
	const tutorGroups = (selectedTutor?.groupTutors ?? [])
		.map((gt) => gt.group)
		.filter((g) => g.isActive);
	const groupSubjects = useMemo(() => {
		const gd = groupDetailQ.data;
		if (!gd || Array.isArray(gd) || !gd.program) return [] as Array<{ id: string; code: string; name: string }>;
		const map = new Map<string, { id: string; code: string; name: string }>();
		for (const ls of gd.level?.levelSubjects ?? []) map.set(ls.subject.id, ls.subject);
		if (gd.level?.subject) map.set(gd.level.subject.id, gd.level.subject);
		if (gd.program.subject) map.set(gd.program.subject.id, gd.program.subject);
		return [...map.values()];
	}, [groupDetailQ.data]);

	const assignM = useMutation({
		mutationFn: ({ sessionId, tutorId }: { sessionId: string; tutorId: string | null }) =>
			apiFetch(`/sessions/${sessionId}`, { method: "PATCH", body: { tutorId } }),
		onSuccess: () => {
			toast.success("Pengajar sesi diperbarui.");
			invalidate();
		},
		onError: (e) => toast.error(e instanceof ApiError ? e.message : "Gagal mengganti pengajar."),
	});
	const createM = useMutation({
		mutationFn: (body: Record<string, unknown>) =>
			apiFetch("/sessions", { method: "POST", body }),
		onSuccess: () => {
			toast.success("Sesi baru dibuat dan tutor ditugaskan.");
			setForm({ ...EMPTY, tutorId: defaultTutorId });
			invalidate();
		},
		onError: (e) => toast.error(e instanceof ApiError ? e.message : "Gagal membuat sesi."),
	});
	const updateM = useMutation({
		mutationFn: ({ sessionId, body }: { sessionId: string; body: Record<string, unknown> }) =>
			apiFetch(`/sessions/${sessionId}`, { method: "PATCH", body }),
		onSuccess: () => {
			toast.success("Sesi diperbarui.");
			setEditingId(null);
			invalidate();
		},
		onError: (e) => toast.error(e instanceof ApiError ? e.message : "Gagal memperbarui sesi."),
	});
	const deleteM = useMutation({
		mutationFn: (sessionId: string) =>
			apiFetch(`/sessions/${sessionId}`, { method: "DELETE" }),
		onSuccess: () => {
			toast.success("Sesi dihapus.");
			setDeleteTarget(null);
			invalidate();
		},
		onError: (e) => {
			toast.error(e instanceof ApiError ? e.message : "Gagal menghapus sesi.");
			setDeleteTarget(null);
		},
	});
	function invalidate() {
		qc.invalidateQueries({ queryKey: ["session-calendar"] });
		qc.invalidateQueries({ queryKey: ["sessions"] });
		onChanged();
	}

	function submitCreate() {
		if (!form.tutorId || !form.groupId || !form.start || !form.end) {
			toast.error("Lengkapi tutor, kelompok, dan jam sesi dulu.");
			return;
		}
		createM.mutate({
			groupId: form.groupId,
			tutorId: form.tutorId,
			roomId: form.roomId || null,
			subjectId: form.subjectId || null,
			startsAt: new Date(`${dateKey}T${form.start}`).toISOString(),
			endsAt: new Date(`${dateKey}T${form.end}`).toISOString(),
		});
	}

	function startEdit(s: SessionItem) {
		setEditingId(s.id);
		const st = new Date(s.startsAt);
		const en = new Date(s.endsAt);
		const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
		setEditForm({
			start: hhmm(st),
			end: hhmm(en),
			subjectId: s.subjectId ?? "",
			roomId: s.roomId ?? "",
			status: s.status,
		});
	}
	function submitEdit() {
		if (!editingSession) return;
		if (!editForm.start || !editForm.end) {
			toast.error("Jam mulai & selesai wajib diisi.");
			return;
		}
		updateM.mutate({
			sessionId: editingSession.id,
			body: {
				startsAt: new Date(`${dateKey}T${editForm.start}`).toISOString(),
				endsAt: new Date(`${dateKey}T${editForm.end}`).toISOString(),
				subjectId: editForm.subjectId || null,
				roomId: editForm.roomId || null,
				status: editForm.status || undefined,
			},
		});
	}

	const dayNotes = dayNotesQ.data ?? [];

	return (
		<div className="flex flex-col gap-3">
			{/* Catatan tanggal: libur / rapat / darurat — ikut reminder jadwal mingguan. */}
			<div className="flex flex-col gap-2 rounded-lg border border-amber-300/60 bg-amber-50/60 p-2.5 dark:border-amber-500/30 dark:bg-amber-500/10">
				<div className="flex items-center justify-between">
					<p className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-200">
						<Flag className="size-3.5" /> Catatan tanggal (libur/rapat/darurat)
					</p>
					<Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setNoteOpen((o) => !o)}>
						<Plus className="size-3.5" /> Tambah
					</Button>
				</div>
				{dayNotes.map((n) => (
					<div key={n.id} className="flex items-start justify-between gap-2 text-xs">
						<span className="min-w-0">
							<Badge variant="outline" className="mr-1.5">{n.type}</Badge>
							<span className="font-medium">{n.title}</span>
							{n.note ? <span className="text-muted-foreground"> — {n.note}</span> : null}
						</span>
						<Button
							variant="ghost" size="icon" className="size-6 shrink-0 text-muted-foreground hover:text-destructive"
							title="Hapus catatan" disabled={deleteNoteM.isPending}
							onClick={() => deleteNoteM.mutate(n.id)}
						>
							<Trash2 className="size-3.5" />
						</Button>
					</div>
				))}
				{!dayNotes.length && !noteOpen ? (
					<p className="text-xs text-muted-foreground">Tidak ada catatan — hari normal.</p>
				) : null}
				{noteOpen ? (
					<form
						className="grid grid-cols-1 gap-2 sm:grid-cols-[110px_1fr_1fr_auto]"
						onSubmit={(e) => {
							e.preventDefault();
							if (!noteForm.title.trim()) { toast.error("Judul catatan wajib diisi."); return; }
							createNoteM.mutate();
						}}
					>
						<select
							className="h-8 rounded-md border px-1.5 text-xs"
							value={noteForm.type}
							onChange={(e) => setNoteForm((f) => ({ ...f, type: e.target.value }))}
						>
							<option value="LIBUR">LIBUR</option>
							<option value="RAPAT">RAPAT</option>
							<option value="DARURAT">DARURAT</option>
							<option value="INFO">INFO</option>
						</select>
						<Input className="h-8 text-xs" placeholder="Judul, mis. Rapat guru" value={noteForm.title} onChange={(e) => setNoteForm((f) => ({ ...f, title: e.target.value }))} />
						<Input className="h-8 text-xs" placeholder="Catatan (opsional)" value={noteForm.note} onChange={(e) => setNoteForm((f) => ({ ...f, note: e.target.value }))} />
						<Button type="submit" size="sm" className="h-8" disabled={createNoteM.isPending}>
							{createNoteM.isPending ? "..." : "Simpan"}
						</Button>
					</form>
				) : null}
			</div>
			<div className="flex flex-col gap-2">
				{sessions.map((s) => (
					<div key={s.id} className="flex flex-col gap-2 rounded-lg border p-2.5 sm:flex-row sm:items-center">
						<div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
							<CalendarClock className="size-4" />
						</div>
						<div className="min-w-0 flex-1">
							<p className="truncate text-sm font-medium">
								{s.group.name}
								{subjectOf(s) ? (
									<span className="ml-1.5 text-xs font-normal text-muted-foreground">{subjectOf(s)!.name}</span>
								) : null}
							</p>
							<p className="flex items-center gap-1.5 text-xs text-muted-foreground">
								{fmtTime(s.startsAt)}–{fmtTime(s.endsAt)}
								<DoorOpen className="ml-1 size-3.5" /> {s.room?.name ?? "Ruang menyusul"}
								<Badge variant={s.status === "CANCELLED" ? "destructive" : "secondary"} className="ml-1">{s.status}</Badge>
							</p>
							{s.tutorAbsenceNote ? (
								<p className="mt-0.5 flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
									<Flag className="size-3 shrink-0" />
									Tutor berhalangan: {s.tutorAbsenceNote}
								</p>
							) : null}
						</div>
						<div className="flex items-center gap-1.5">
							<User className="size-3.5 shrink-0 text-muted-foreground" />
							<select
								className="h-8 w-40 rounded-md border px-1.5 text-xs"
								value={s.tutorId ?? ""}
								disabled={assignM.isPending || s.status === "CANCELLED"}
								onChange={(e) => assignM.mutate({ sessionId: s.id, tutorId: e.target.value || null })}
							>
								<option value="">— Belum ditentukan —</option>
								{activeTutors
									.filter((t) => (t.groupTutors ?? []).some((gt) => gt.groupId === s.groupId) || t.id === s.tutorId)
									.map((t) => (
										<option key={t.id} value={t.id}>{t.user.name}</option>
									))}
							</select>
							<Button
								variant="ghost" size="icon" className="size-8"
								title="Edit sesi (jam/mapel/ruangan/status)"
								onClick={() => (editingId === s.id ? setEditingId(null) : startEdit(s))}
							>
								<Pencil className="size-4" />
							</Button>
							<Button
								variant="ghost" size="icon"
								className="size-8 text-muted-foreground hover:text-destructive"
								title="Hapus sesi"
								onClick={() => setDeleteTarget(s)}
							>
								<Trash2 className="size-4" />
							</Button>
							{onSessionClick ? (
								<Button
									variant={selectedSessionId === s.id ? "default" : "outline"}
									size="icon"
									className="size-8"
									title="Detail sesi (absensi/override)"
									onClick={() => onSessionClick(s.id)}
								>
									<ListChecks className="size-4" />
								</Button>
							) : null}
						</div>
						{editingId === s.id ? (
							<div className="flex w-full flex-col gap-2 rounded-md border bg-muted/40 p-2.5 sm:col-span-full">
								<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
									<div className="flex flex-col gap-1">
										<Label className="text-xs">Mulai</Label>
										<Input type="time" className="h-8 text-xs" value={editForm.start} onChange={(e) => setEditForm((f) => ({ ...f, start: e.target.value }))} />
									</div>
									<div className="flex flex-col gap-1">
										<Label className="text-xs">Selesai</Label>
										<Input type="time" className="h-8 text-xs" value={editForm.end} onChange={(e) => setEditForm((f) => ({ ...f, end: e.target.value }))} />
									</div>
									<div className="flex flex-col gap-1">
										<Label className="text-xs">Mapel</Label>
										<select className="h-8 rounded-md border px-1.5 text-xs" value={editForm.subjectId} onChange={(e) => setEditForm((f) => ({ ...f, subjectId: e.target.value }))}>
											<option value="">— Ikut jenjang —</option>
											{editSubjects.map((sub) => <option key={sub.id} value={sub.id}>{sub.name}</option>)}
										</select>
									</div>
									<div className="flex flex-col gap-1">
										<Label className="text-xs">Ruangan</Label>
										<select className="h-8 rounded-md border px-1.5 text-xs" value={editForm.roomId} onChange={(e) => setEditForm((f) => ({ ...f, roomId: e.target.value }))}>
											<option value="">— Tentukan nanti —</option>
											{(roomsQ.data ?? []).filter((r) => r.isActive || r.id === s.roomId).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
										</select>
									</div>
									<div className="flex flex-col gap-1">
										<Label className="text-xs">Status</Label>
										<select className="h-8 rounded-md border px-1.5 text-xs" value={editForm.status} onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}>
											<option value="SCHEDULED">Terjadwal</option>
											<option value="CANCELLED">Dibatalkan</option>
											{s.status === "COMPLETED" ? <option value="COMPLETED">Selesai</option> : null}
										</select>
									</div>
								</div>
								<div className="flex gap-2">
									<Button size="sm" className="h-8" disabled={updateM.isPending} onClick={submitEdit}>
										{updateM.isPending ? "Menyimpan..." : "Simpan Perubahan"}
									</Button>
									<Button size="sm" variant="ghost" className="h-8" onClick={() => setEditingId(null)}>Batal</Button>
								</div>
							</div>
						) : null}
					</div>
				))}
				{sessions.length === 0 ? (
					<p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
						Belum ada sesi di tanggal ini — buat baru di bawah.
					</p>
				) : null}
			</div>

			<div className={cn("flex flex-col gap-3 rounded-lg border bg-muted/30 p-3")}>
				<p className="flex items-center gap-1.5 text-sm font-medium">
					<Plus className="size-4" /> Tugaskan tutor ke sesi baru
				</p>
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
					<div className="flex flex-col gap-1.5">
						<Label>Tutor</Label>
						<select
							className="h-9 rounded-md border px-2 text-sm"
							value={form.tutorId}
							onChange={(e) => setForm((f) => ({ ...f, tutorId: e.target.value, groupId: "", subjectId: "" }))}
						>
							<option value="">— Pilih tutor —</option>
							{activeTutors.map((t) => (
								<option key={t.id} value={t.id}>
									{t.user.name}{t.specialization ? ` (${t.specialization})` : ""}
								</option>
							))}
						</select>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label>Kelompok</Label>
						<select
							className="h-9 rounded-md border px-2 text-sm"
							value={form.groupId}
							disabled={!form.tutorId}
							onChange={(e) => setForm((f) => ({ ...f, groupId: e.target.value, subjectId: "" }))}
						>
							<option value="">
								{!form.tutorId
									? "— Pilih tutor dulu —"
									: tutorGroups.length === 0
										? "— Tutor belum ditugaskan ke kelompok —"
										: "— Pilih kelompok —"}
							</option>
							{tutorGroups.map((g) => (
								<option key={g.id} value={g.id}>{g.name}</option>
							))}
						</select>
						{form.tutorId && tutorGroups.length === 0 ? (
							<p className="text-xs text-warning-700">
								Tugaskan tutor ini ke kelompok dulu lewat halaman Kelompok.
							</p>
						) : null}
					</div>
					<div className="flex flex-col gap-1.5">
						<Label>Mapel</Label>
						<select
							className="h-9 rounded-md border px-2 text-sm"
							value={form.subjectId}
							disabled={!form.groupId || groupDetailQ.isLoading}
							onChange={(e) => setForm((f) => ({ ...f, subjectId: e.target.value }))}
						>
							<option value="">
								{groupSubjects.length ? "— Ikut jadwal/jenjang —" : "— Kelompok belum punya mapel —"}
							</option>
							{groupSubjects.map((s) => (
								<option key={s.id} value={s.id}>{s.name}</option>
							))}
						</select>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label>Ruangan</Label>
						<select
							className="h-9 rounded-md border px-2 text-sm"
							value={form.roomId}
							onChange={(e) => setForm((f) => ({ ...f, roomId: e.target.value }))}
						>
							<option value="">— Tentukan nanti —</option>
							{(roomsQ.data ?? []).filter((r) => r.isActive).map((r) => (
								<option key={r.id} value={r.id}>{r.name}</option>
							))}
						</select>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label>Jam mulai</Label>
						<Input type="time" value={form.start} onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))} />
					</div>
					<div className="flex flex-col gap-1.5">
						<Label>Jam selesai</Label>
						<Input type="time" value={form.end} onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))} />
					</div>
				</div>
				<div>
					<Button size="sm" disabled={createM.isPending} onClick={submitCreate}>
						{createM.isPending ? "Menyimpan..." : "Buat Sesi & Tugaskan"}
					</Button>
				</div>
			</div>

			<ConfirmDialog
				open={deleteTarget !== null}
				onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
				title={`Hapus sesi ${deleteTarget ? fmtTime(deleteTarget.startsAt) : ""} ${deleteTarget?.group.name ?? ""}?`}
				description="Sesi dihapus dari jadwal. Sesi yang sudah punya absensi tidak bisa dihapus — batalkan saja lewat tombol edit."
				confirmLabel="Hapus Sesi"
				pending={deleteM.isPending}
				onConfirm={() => deleteTarget && deleteM.mutate(deleteTarget.id)}
			/>
		</div>
	);
}
