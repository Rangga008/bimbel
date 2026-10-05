"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ClipboardList, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ComboboxField } from "@/components/shared/combobox-field";
import { apiFetch, ApiError } from "@/lib/api-client";
import type { GroupListItem } from "@/lib/phase1b-types";
import { ENROLLMENT_STATUS_META, type StaffEnrollment } from "./finance-enrollments";

const CATEGORY_LABEL: Record<string, string> = {
	REGULER: "Reguler",
	EXTRA: "Extra",
	PRIVAT: "Privat",
};

const STATUS_FILTERS = [
	{ value: "ACCEPTED", label: "Siap Ditempatkan" },
	{ value: "PAID", label: "Menunggu Verifikasi Finance" },
	{ value: "PENDING_PAYMENT", label: "Menunggu Bayar" },
	{ value: "PLACED", label: "Sudah Ditempatkan" },
	{ value: "REJECTED", label: "Ditolak" },
	{ value: "", label: "Semua" },
];

function err(e: unknown, fb: string) {
	return e instanceof ApiError ? e.message : fb;
}

/** Halaman "Pendaftaran" admin academic — tempatkan siswa yang diterima finance ke kelompok. */
export function AcademicEnrollments() {
	const qc = useQueryClient();
	const [status, setStatus] = useState("ACCEPTED");
	const [search, setSearch] = useState("");
	const [programId, setProgramId] = useState("");
	const [placeTarget, setPlaceTarget] = useState<StaffEnrollment | null>(null);
	const [groupId, setGroupId] = useState("");

	// Ambil semua sekali — count per kategori dihitung lokal agar tab akurat.
	const listQ = useQuery({
		queryKey: ["enrollments", "all"],
		queryFn: () => apiFetch<StaffEnrollment[]>("/enrollments"),
	});

	const groupsQ = useQuery({
		queryKey: ["groups-for-enrollment", placeTarget?.level.id, placeTarget?.program.id],
		enabled: placeTarget !== null,
		queryFn: () =>
			apiFetch<GroupListItem[]>(
				`/groups?programId=${placeTarget?.program.id ?? ""}`,
			).then((groups) =>
				// Samakan dengan aturan backend: kelompok tanpa jenjang atau jenjang yang sama.
				groups.filter(
					(g) =>
						g.isActive &&
						(g.levelId === null || g.levelId === placeTarget?.level.id),
				),
			),
	});

	const placeM = useMutation({
		mutationFn: () =>
			apiFetch(`/enrollments/${placeTarget?.id}/place`, {
				method: "POST",
				body: { groupId },
			}),
		onSuccess: () => {
			toast.success(`${placeTarget?.childName} ditempatkan ke kelompok.`);
			setPlaceTarget(null);
			setGroupId("");
			qc.invalidateQueries({ queryKey: ["enrollments"] });
			qc.invalidateQueries({ queryKey: ["groups"] });
		},
		onError: (e) => toast.error(err(e, "Gagal menempatkan siswa.")),
	});

	const allItems = listQ.data ?? [];
	const countOf = (s: string) =>
		s === "" ? allItems.length : allItems.filter((e) => e.status === s).length;
	const programOptions = [
		...new Map(allItems.map((e) => [e.program.id, e.program.name])).entries(),
	];
	const q = search.trim().toLowerCase();
	const items = allItems
		.filter((e) => (status === "" ? true : e.status === status))
		.filter((e) => (programId === "" ? true : e.program.id === programId))
		.filter((e) =>
			q === ""
				? true
				: [e.childName, e.student.user.name, e.parent.user.name, e.group?.name]
						.filter(Boolean)
						.some((v) => String(v).toLowerCase().includes(q)),
		);
	const th = "px-3 py-2 text-left font-medium whitespace-nowrap";
	const td = "px-3 py-2 align-top";

	return (
		<div className="flex flex-col gap-4">
			<div>
				<h1 className="text-2xl font-semibold tracking-tight">Pendaftaran</h1>
				<p className="text-sm text-muted-foreground">
					Tempatkan siswa baru yang sudah diverifikasi finance ke kelompok belajar.
				</p>
			</div>
			<div className="flex flex-wrap gap-1.5">
				{STATUS_FILTERS.map((f) => (
					<button
						key={f.value || "all"}
						type="button"
						onClick={() => setStatus(f.value)}
						className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
							status === f.value
								? "border-primary bg-primary text-primary-foreground"
								: "bg-background hover:border-primary/50"
						}`}
					>
						{f.label}
						<span className={`ml-1.5 tabular-nums ${status === f.value ? "opacity-80" : "text-muted-foreground"}`}>
							{countOf(f.value)}
						</span>
					</button>
				))}
			</div>

			{/* Filter pencarian + program — difilter lokal dari daftar lengkap. */}
			<div className="flex flex-wrap items-center gap-2">
				<Input
					className="h-9 w-full sm:w-64"
					placeholder="Cari nama anak / ortu / kelompok..."
					value={search}
					onChange={(e) => setSearch(e.target.value)}
				/>
				<select
					className="h-9 rounded-md border border-input bg-background px-3 text-sm"
					value={programId}
					onChange={(e) => setProgramId(e.target.value)}
				>
					<option value="">Semua program</option>
					{programOptions.map(([id, name]) => (
						<option key={id} value={id}>{name}</option>
					))}
				</select>
				{(search || programId) ? (
					<Button variant="ghost" size="sm" onClick={() => { setSearch(""); setProgramId(""); }}>
						Reset filter
					</Button>
				) : null}
			</div>

			{listQ.isLoading ? <Skeleton className="h-40 w-full" /> : null}
			{listQ.isError ? (
				<Card>
					<CardContent className="py-10 text-center text-sm text-destructive">
						{err(listQ.error, "Gagal memuat pendaftaran.")}
					</CardContent>
				</Card>
			) : null}
			{!listQ.isLoading && items.length === 0 ? (
				<EmptyState icon={ClipboardList} title="Tidak ada pendaftaran" description="Belum ada pendaftaran dengan status ini." />
			) : null}

			{items.length > 0 ? (
				<div className="overflow-x-auto rounded-md border">
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b bg-muted/50">
								<th className={th}>Anak / Ortu</th>
								<th className={th}>Program</th>
								<th className={th}>Kelompok</th>
								<th className={th}>Status</th>
								<th className={th}>Aksi</th>
							</tr>
						</thead>
						<tbody>
							{items.map((e) => {
								const meta = ENROLLMENT_STATUS_META[e.status];
								return (
									<tr key={e.id} className="border-b last:border-0">
										<td className={`${td} whitespace-nowrap`}>
											<span className="font-medium">{e.childName}</span>
											<p className="text-xs text-muted-foreground">ortu {e.parent.user.name}</p>
											<p className="text-xs text-muted-foreground">
												{new Date(e.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
											</p>
										</td>
										<td className={td}>
											<div className="flex flex-wrap gap-1">
												<Badge variant="outline">{CATEGORY_LABEL[e.program.category] ?? e.program.category}</Badge>
												<Badge variant="outline">{e.level.name}</Badge>
											</div>
										</td>
										<td className={`${td} whitespace-nowrap`}>
											{e.group ? e.group.name : <span className="text-muted-foreground">—</span>}
										</td>
										<td className={`${td} whitespace-nowrap`}>
											<Badge variant={meta.variant}>{meta.label}</Badge>
										</td>
										<td className={`${td} whitespace-nowrap`}>
											{e.status === "ACCEPTED" ? (
												<Button size="sm" onClick={() => { setPlaceTarget(e); setGroupId(""); }}>
													<Users /> Tempatkan
												</Button>
											) : null}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			) : null}

			<Dialog open={placeTarget !== null} onOpenChange={(o) => { if (!o) setPlaceTarget(null); }}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Tempatkan {placeTarget?.childName ?? ""}</DialogTitle>
						<DialogDescription>
							Pilih kelompok untuk {placeTarget?.program.name} — {placeTarget?.level.name}. Hanya kelompok aktif dari program &amp; jenjang yang sesuai.
						</DialogDescription>
					</DialogHeader>
					<form
						className="flex flex-col gap-3"
						onSubmit={(ev) => {
							ev.preventDefault();
							placeM.mutate();
						}}
					>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="enr-group">Kelompok *</Label>
							<ComboboxField
								id="enr-group"
								value={groupId}
								onChange={setGroupId}
								options={(groupsQ.data ?? []).map((g) => ({
									value: g.id,
									label: `${g.name}${g.capacity ? ` (${g._count.members}/${g.capacity})` : ` (${g._count.members} siswa)`}`,
								}))}
								placeholder={groupsQ.isLoading ? "Memuat kelompok..." : "Pilih kelompok"}
								emptyText="Belum ada kelompok untuk jenjang ini — buat dulu di halaman Kelompok."
							/>
						</div>
						<DialogFooter>
							<Button type="button" variant="outline" onClick={() => setPlaceTarget(null)}>
								Batal
							</Button>
							<Button type="submit" disabled={placeM.isPending || !groupId}>
								{placeM.isPending ? "Memproses..." : "Tempatkan"}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</div>
	);
}
