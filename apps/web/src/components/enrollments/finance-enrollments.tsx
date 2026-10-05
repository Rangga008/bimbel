"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ClipboardList, X } from "lucide-react";
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
import { apiFetch, ApiError } from "@/lib/api-client";

export interface StaffEnrollment {
	id: string;
	status: "PENDING_PAYMENT" | "PAID" | "ACCEPTED" | "PLACED" | "REJECTED";
	childName: string;
	createdAt: string;
	notes: string | null;
	student: { id: string; isActive: boolean; user: { id: string; name: string; email: string; isActive: boolean } };
	parent: { id: string; user: { id: string; name: string; email: string; phone: string | null } };
	program: { id: string; name: string; code: string; category: string };
	level: { id: string; name: string; price: string | number | null; priceUnit: string | null };
	paymentPlan?: "FULL" | "TWO_TIMES" | "MONTHLY" | null;
	studentCount?: number | null;
	sessionCount?: number | null;
	group: { id: string; name: string; code: string | null } | null;
	invoice: {
		id: string;
		number: string;
		status: string;
		totalAmount: string | number;
		amountPaid: string | number;
	} | null;
	invoices?: {
		id: string;
		number: string;
		status: string;
		totalAmount: string | number;
		amountPaid: string | number;
		dueDate: string | null;
	}[];
	reviewedBy: { id: string; name: string } | null;
}

const CATEGORY_LABEL: Record<string, string> = {
	REGULER: "Reguler",
	EXTRA: "Extra",
	PRIVAT: "Privat",
};

export const PLAN_LABEL: Record<string, string> = {
	FULL: "Lunas di awal",
	TWO_TIMES: "Angsuran 2x",
	MONTHLY: "Angsuran bulanan",
};

export const ENROLLMENT_STATUS_META: Record<StaffEnrollment["status"], { label: string; variant: "secondary" | "outline" | "destructive" | "default" }> = {
	PENDING_PAYMENT: { label: "Menunggu Bayar", variant: "outline" },
	PAID: { label: "Lunas — Perlu Verifikasi", variant: "default" },
	ACCEPTED: { label: "Diterima", variant: "secondary" },
	PLACED: { label: "Sudah di Kelompok", variant: "secondary" },
	REJECTED: { label: "Ditolak", variant: "destructive" },
};

const STATUS_FILTERS = [
	{ value: "PAID", label: "Perlu Verifikasi" },
	{ value: "PENDING_PAYMENT", label: "Menunggu Bayar" },
	{ value: "ACCEPTED", label: "Diterima — Tunggu Penempatan" },
	{ value: "PLACED", label: "Sudah Ditempatkan" },
	{ value: "REJECTED", label: "Ditolak" },
	{ value: "", label: "Semua" },
];

function rp(value: string | number | null | undefined) {
	if (value === null || value === undefined) return "-";
	const n = Number(value);
	if (Number.isNaN(n)) return "-";
	return `Rp ${n.toLocaleString("id-ID")}`;
}

function err(e: unknown, fb: string) {
	return e instanceof ApiError ? e.message : fb;
}

/** Halaman "Pendaftaran" admin finance — verifikasi pendaftaran yang sudah lunas. */
export function FinanceEnrollments() {
	const qc = useQueryClient();
	// Default ke "Perlu Verifikasi" — antrean kerja finance, bukan semua data.
	const [status, setStatus] = useState("PAID");
	const [search, setSearch] = useState("");
	const [programId, setProgramId] = useState("");
	const [reviewTarget, setReviewTarget] = useState<{ item: StaffEnrollment; action: "accept" | "reject" } | null>(null);
	const [notes, setNotes] = useState("");

	// Ambil semua sekali — count per kategori dihitung lokal agar tab akurat.
	const listQ = useQuery({
		queryKey: ["enrollments", "all"],
		queryFn: () => apiFetch<StaffEnrollment[]>("/enrollments"),
	});

	const reviewM = useMutation({
		mutationFn: (t: { item: StaffEnrollment; action: "accept" | "reject" }) =>
			apiFetch(`/enrollments/${t.item.id}/${t.action}`, {
				method: "POST",
				body: { notes: notes.trim() || undefined },
			}),
		onSuccess: (_, t) => {
			toast.success(
				t.action === "accept"
					? `Pendaftaran ${t.item.childName} diterima — akun siswa aktif.`
					: `Pendaftaran ${t.item.childName} ditolak.`,
			);
			setReviewTarget(null);
			setNotes("");
			qc.invalidateQueries({ queryKey: ["enrollments"] });
		},
		onError: (e) => toast.error(err(e, "Gagal memproses pendaftaran.")),
	});

	const allItems = listQ.data ?? [];
	const countOf = (s: string) =>
		s === "" ? allItems.length : allItems.filter((e) => e.status === s).length;
	// Program unik untuk filter — dari data yang ada, tidak perlu query tambahan.
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
				: [e.childName, e.student.user.name, e.student.user.email, e.parent.user.name, e.group?.name, e.invoice?.number]
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
					Verifikasi pendaftaran siswa baru — tombol terima aktif setelah invoice pendaftaran lunas.
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
					placeholder="Cari nama anak / ortu / kelompok / invoice..."
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
				<EmptyState
					icon={ClipboardList}
					title="Tidak ada pendaftaran"
					description={
						status === "PAID"
							? "Tidak ada pendaftaran yang perlu diverifikasi saat ini."
							: "Belum ada pendaftaran di kategori ini — cek kategori lain di atas."
					}
				/>
			) : null}

			{items.length > 0 ? (
				<div className="overflow-x-auto rounded-md border">
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b bg-muted/50">
								<th className={th}>Anak / Ortu</th>
								<th className={th}>Program</th>
								<th className={th}>Pembayaran</th>
								<th className={th}>Tagihan</th>
								<th className={th}>Status</th>
								<th className={th}>Aksi</th>
							</tr>
						</thead>
						<tbody>
							{items.map((e) => {
								const meta = ENROLLMENT_STATUS_META[e.status];
								const invoiceList = e.invoices?.length ? e.invoices : e.invoice ? [e.invoice] : [];
								const totalPaid = invoiceList.reduce((s, i) => s + Number(i.amountPaid), 0);
								const totalBill = invoiceList.reduce((s, i) => s + Number(i.totalAmount), 0);
								return (
									<tr key={e.id} className="border-b last:border-0">
										<td className={`${td} whitespace-nowrap`}>
											<span className="font-medium">{e.childName}</span>
											<p className="text-xs text-muted-foreground">
												ortu {e.parent.user.name}{e.parent.user.phone ? ` · ${e.parent.user.phone}` : ""}
											</p>
											<p className="text-xs text-muted-foreground">
												{new Date(e.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
											</p>
										</td>
										<td className={td}>
											<div className="flex flex-wrap gap-1">
												<Badge variant="outline">{CATEGORY_LABEL[e.program.category] ?? e.program.category}</Badge>
												<Badge variant="outline">{e.level.name}</Badge>
											</div>
											{e.group ? <p className="mt-1 text-xs text-muted-foreground">Kelompok: {e.group.name}</p> : null}
											{e.reviewedBy ? <p className="mt-1 text-xs text-muted-foreground">Ditinjau {e.reviewedBy.name}</p> : null}
											{e.notes ? <p className="mt-1 text-xs text-muted-foreground">Catatan: {e.notes}</p> : null}
										</td>
										<td className={`${td} whitespace-nowrap`}>
											{e.paymentPlan ? PLAN_LABEL[e.paymentPlan] : e.sessionCount ? `${e.sessionCount} pertemuan · ${e.studentCount ?? 1} siswa` : "—"}
										</td>
										<td className={`${td} whitespace-nowrap`}>
											{invoiceList.length > 0 ? (
												<>
													<span className="tabular-nums">{rp(totalPaid)} / {rp(totalBill)}</span>
													<details className="text-xs text-muted-foreground">
														<summary className="cursor-pointer">{invoiceList.length} invoice</summary>
														{invoiceList.map((inv) => (
															<div key={inv.id} className="mt-0.5">
																{inv.number} · {rp(inv.totalAmount)} · {inv.status}
															</div>
														))}
													</details>
												</>
											) : (
												<span className="text-muted-foreground">Tanpa invoice</span>
											)}
										</td>
										<td className={`${td} whitespace-nowrap`}>
											<Badge variant={meta.variant}>{meta.label}</Badge>
										</td>
										<td className={`${td} whitespace-nowrap`}>
											<div className="flex flex-wrap gap-1.5">
												{e.status === "PAID" ? (
													<Button size="sm" onClick={() => { setReviewTarget({ item: e, action: "accept" }); setNotes(""); }}>
														<Check /> Terima
													</Button>
												) : null}
												{e.status === "PENDING_PAYMENT" || e.status === "PAID" ? (
													<Button size="sm" variant="outline" className="text-destructive hover:text-destructive"
														onClick={() => { setReviewTarget({ item: e, action: "reject" }); setNotes(""); }}>
														<X /> Tolak
													</Button>
												) : null}
											</div>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			) : null}

			<Dialog open={reviewTarget !== null} onOpenChange={(o) => { if (!o) setReviewTarget(null); }}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							{reviewTarget?.action === "accept" ? "Terima" : "Tolak"} Pendaftaran — {reviewTarget?.item.childName ?? ""}
						</DialogTitle>
						<DialogDescription>
							{reviewTarget?.action === "accept"
								? "Akun siswa akan diaktifkan dan pendaftaran diteruskan ke admin academic untuk penempatan kelompok."
								: "Pendaftaran ditolak — akun siswa tetap nonaktif. Tindakan ini tidak membatalkan invoice."}
						</DialogDescription>
					</DialogHeader>
					<form
						className="flex flex-col gap-3"
						onSubmit={(ev) => {
							ev.preventDefault();
							if (reviewTarget) reviewM.mutate(reviewTarget);
						}}
					>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="enr-notes">Catatan (opsional)</Label>
							<Input
								id="enr-notes"
								value={notes}
								onChange={(e) => setNotes(e.target.value)}
								placeholder={reviewTarget?.action === "accept" ? "Contoh: pembayaran valid" : "Alasan penolakan"}
							/>
						</div>
						<DialogFooter>
							<Button type="button" variant="outline" onClick={() => setReviewTarget(null)}>
								Batal
							</Button>
							<Button
								type="submit"
								variant={reviewTarget?.action === "reject" ? "destructive" : "default"}
								disabled={reviewM.isPending}
							>
								{reviewM.isPending ? "Memproses..." : reviewTarget?.action === "accept" ? "Ya, Terima" : "Ya, Tolak"}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</div>
	);
}
