"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Baby, Plus, Trash2 } from "lucide-react";
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
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ComboboxField } from "@/components/shared/combobox-field";
import { apiFetch, ApiError } from "@/lib/api-client";

interface CatalogLevel {
	id: string;
	name: string;
	price: string | number | null;
	priceUnit: "YEAR" | "MONTH" | "SESSION" | "PACKAGE" | null;
	fullPayPrice?: string | number | null;
	installment2x?: string | number | null;
	monthlyAmount?: string | number | null;
	monthlyCount?: number | null;
	promoPrice?: string | number | null;
	sessionPrices?: Record<string, number> | null;
	sessionDurationMin?: number | null;
	registrationFee?: string | number | null;
	gradeLevel: { id: string; code: string; name: string } | null;
	levelSubjects: { subject: { id: string; code: string; name: string } }[];
}

interface CatalogProgram {
	id: string;
	name: string;
	code: string;
	description: string | null;
	category: "REGULER" | "EXTRA" | "PRIVAT";
	registrationFee: string | number | null;
	levels: CatalogLevel[];
}

interface EnrollmentItem {
	id: string;
	status:
		| "PENDING_PAYMENT"
		| "PAID"
		| "ACCEPTED"
		| "PLACED"
		| "REJECTED";
	childName: string;
	student?: { id: string } | null;
	createdAt: string;
	notes: string | null;
	paymentPlan?: "FULL" | "TWO_TIMES" | "MONTHLY" | null;
	studentCount?: number | null;
	sessionCount?: number | null;
	program: { id: string; name: string; code: string; category: string };
	level: { id: string; name: string; price: string | number | null; priceUnit: string | null };
	group: { id: string; name: string; code: string | null } | null;
	invoice: {
		id: string;
		number: string;
		status: string;
		totalAmount: string | number;
		amountPaid: string | number;
		dueDate: string | null;
	} | null;
	invoices?: {
		id: string;
		number: string;
		status: string;
		totalAmount: string | number;
		amountPaid: string | number;
		dueDate: string | null;
	}[];
}

const CATEGORY_LABEL: Record<string, string> = {
	REGULER: "Kelas Reguler",
	EXTRA: "Kelas Extra",
	PRIVAT: "Kelas Privat",
};

const STATUS_META: Record<EnrollmentItem["status"], { label: string; variant: "secondary" | "outline" | "destructive" | "default" }> = {
	PENDING_PAYMENT: { label: "Menunggu Pembayaran", variant: "outline" },
	PAID: { label: "Lunas — Menunggu Verifikasi", variant: "default" },
	ACCEPTED: { label: "Diterima — Menunggu Kelompok", variant: "secondary" },
	PLACED: { label: "Aktif di Kelompok", variant: "secondary" },
	REJECTED: { label: "Ditolak", variant: "destructive" },
};

function rp(value: string | number | null | undefined) {
	if (value === null || value === undefined) return "-";
	const n = Number(value);
	if (Number.isNaN(n)) return "-";
	return `Rp ${n.toLocaleString("id-ID")}`;
}

const UNIT_LABEL: Record<string, string> = {
	YEAR: "tahun",
	MONTH: "bulan",
	SESSION: "pertemuan",
	PACKAGE: "paket",
};

const PLAN_LABEL: Record<string, string> = {
	FULL: "Lunas di awal",
	TWO_TIMES: "Angsuran 2x",
	MONTHLY: "Angsuran bulanan",
};

function planLabel(e: EnrollmentItem) {
	if (e.paymentPlan) return PLAN_LABEL[e.paymentPlan];
	if (e.sessionCount) return `${e.sessionCount} pertemuan · ${e.studentCount ?? 1} siswa`;
	return "Per periode";
}

function err(e: unknown, fb: string) {
	return e instanceof ApiError ? e.message : fb;
}

const EMPTY_FORM = {
	existingStudentId: "",
	childName: "",
	dateOfBirth: "",
	gender: "",
	schoolOrigin: "",
	programId: "",
	levelId: "",
	paymentPlan: "MONTHLY",
	studentCount: "1",
	sessionCount: "8",
};

/** Halaman "Pendaftaran" ortu: daftarkan anak → invoice → pantau status. */
export function ParentEnrollments() {
	const qc = useQueryClient();
	const [open, setOpen] = useState(false);
	const [form, setForm] = useState(EMPTY_FORM);
	const [deleteChild, setDeleteChild] = useState<{ id: string; name: string } | null>(null);

	const enrollmentsQ = useQuery({
		queryKey: ["my-enrollments"],
		queryFn: () => apiFetch<EnrollmentItem[]>("/me/enrollments"),
	});
	const catalogQ = useQuery({
		queryKey: ["programs-catalog"],
		queryFn: () => apiFetch<CatalogProgram[]>("/programs/catalog"),
	});
	const childrenQ = useQuery({
		queryKey: ["my-children"],
		queryFn: () =>
			apiFetch<{ id: string; name: string; isActive: boolean }[]>(
				"/me/enrollments/children",
			),
	});

	const program = (catalogQ.data ?? []).find((p) => p.id === form.programId);
	const level = program?.levels.find((l) => l.id === form.levelId);
	const isReguler = program?.category === "REGULER" || level?.priceUnit === "YEAR";
	const isPrivat = level?.priceUnit === "SESSION";
	const regFee = level?.registrationFee
		? Number(level.registrationFee)
		: program?.registrationFee
			? Number(program.registrationFee)
			: 0;
	const levelPrice = level?.price ? Number(level.price) : 0;
	const studentCount = Math.min(Math.max(Number(form.studentCount) || 1, 1), 5);
	const sessionCount = Math.min(Math.max(Number(form.sessionCount) || 1, 1), 48);
	const perSession = isPrivat
		? studentCount > 1 && level?.sessionPrices?.[String(studentCount)]
			? Number(level.sessionPrices[String(studentCount)])
			: levelPrice
		: levelPrice;

	// Cara bayar yang tersedia untuk jenjang ini (brosur reguler).
	const planOptions = !isReguler
		? []
		: ([
				level?.fullPayPrice ? "FULL" : null,
				level?.installment2x ? "TWO_TIMES" : null,
				level?.monthlyAmount ? "MONTHLY" : null,
			].filter(Boolean) as string[]);
	const activePlan =
		isReguler && planOptions.length
			? planOptions.includes(form.paymentPlan)
				? form.paymentPlan
				: planOptions[0]
			: "";

	// Preview tagihan pertama sesuai cara bayar.
	const firstBill = isReguler
		? activePlan === "FULL"
			? Number(level?.fullPayPrice ?? levelPrice)
			: activePlan === "TWO_TIMES"
				? Number(level?.installment2x ?? 0)
				: Number(level?.monthlyAmount ?? 0)
		: isPrivat
			? perSession * sessionCount
			: levelPrice;

	const removeChildM = useMutation({
		mutationFn: (studentId: string) =>
			apiFetch(`/me/enrollments/children/${studentId}`, { method: "DELETE" }),
		onSuccess: () => {
			toast.success("Data anak dihapus.");
			setDeleteChild(null);
			qc.invalidateQueries({ queryKey: ["my-children"] });
			qc.invalidateQueries({ queryKey: ["my-enrollments"] });
			qc.invalidateQueries({ queryKey: ["parent-invoices"] });
		},
		onError: (e) => toast.error(err(e, "Gagal menghapus data anak.")),
	});

	const createM = useMutation({
		mutationFn: () =>
			apiFetch<EnrollmentItem>("/me/enrollments", {
				method: "POST",
				body: {
					childName: form.childName.trim(),
					programId: form.programId,
					levelId: form.levelId,
					existingStudentId: form.existingStudentId || undefined,
					paymentPlan: isReguler && activePlan ? activePlan : undefined,
					studentCount: isPrivat ? studentCount : undefined,
					sessionCount: isPrivat ? sessionCount : undefined,
					dateOfBirth: form.dateOfBirth || undefined,
					gender: (form.gender || undefined) as "M" | "F" | undefined,
					schoolOrigin: form.schoolOrigin.trim() || undefined,
				},
			}),
		onSuccess: (created) => {
			toast.success(
				`Pendaftaran ${created.childName} dibuat — invoice ${created.invoice?.number ?? ""} terbit. Silakan lakukan pembayaran.`,
			);
			setOpen(false);
			setForm(EMPTY_FORM);
			qc.invalidateQueries({ queryKey: ["my-enrollments"] });
			qc.invalidateQueries({ queryKey: ["parent-invoices"] });
		},
		onError: (e) => toast.error(err(e, "Gagal membuat pendaftaran.")),
	});

	const enrollments = enrollmentsQ.data ?? [];
	const children = childrenQ.data ?? [];
	const isLoading = enrollmentsQ.isLoading || childrenQ.isLoading;

	const th = "px-3 py-2 text-left font-medium whitespace-nowrap";
	const td = "px-3 py-2 align-top";

	return (
		<div className="flex flex-col gap-5">
			<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h1 className="text-2xl font-semibold tracking-tight">Anak &amp; Pendaftaran</h1>
					<p className="text-sm text-muted-foreground">
						Daftarkan anak ke program bimbel — invoice terbit otomatis, akun anak aktif setelah pembayaran diverifikasi admin.
					</p>
				</div>
				<Button onClick={() => setOpen(true)}>
					<Plus /> Daftarkan Anak
				</Button>
			</div>

			{isLoading ? <Skeleton className="h-40 w-full" /> : null}
			{enrollmentsQ.isError ? (
				<Card>
					<CardContent className="py-10 text-center text-sm text-destructive">
						{err(enrollmentsQ.error, "Gagal memuat pendaftaran.")}
					</CardContent>
				</Card>
			) : null}

			{!isLoading && children.length === 0 && enrollments.length === 0 ? (
				<EmptyState
					icon={Baby}
					title="Belum ada anak terdaftar"
					description="Klik tombol Daftarkan Anak untuk mendaftarkan anak ke program bimbel."
				/>
			) : null}

			{children.length > 0 ? (
				<section className="flex flex-col gap-2">
					<h2 className="text-lg font-medium">Anak Saya</h2>
					<div className="overflow-x-auto rounded-md border">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b bg-muted/50">
									<th className={th}>Nama Anak</th>
									<th className={th}>Status Akun</th>
									<th className={th}>Program</th>
									<th className={th}></th>
								</tr>
							</thead>
							<tbody>
								{children.map((c) => {
									const childEnrollments = enrollments.filter((e) => e.student?.id === c.id);
									return (
										<tr key={c.id} className="border-b last:border-0">
											<td className={`${td} font-medium`}>{c.name}</td>
											<td className={td}>
												<Badge variant={c.isActive ? "secondary" : "outline"}>
													{c.isActive ? "Aktif" : "Nonaktif — menunggu verifikasi pembayaran"}
												</Badge>
											</td>
											<td className={`${td} text-muted-foreground`}>
												{childEnrollments.length > 0
													? childEnrollments.map((e) => e.level.name).join(", ")
													: "Belum terdaftar program"}
											</td>
											<td className={`${td} text-right`}>
												<Button
													variant="ghost"
													size="icon-sm"
													aria-label={`Hapus ${c.name}`}
													className="text-destructive hover:text-destructive"
													onClick={() => setDeleteChild({ id: c.id, name: c.name })}
												>
													<Trash2 className="size-4" />
												</Button>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				</section>
			) : null}

			{enrollments.length > 0 ? (
				<section className="flex flex-col gap-2">
					<h2 className="text-lg font-medium">Riwayat Pendaftaran</h2>
					<div className="overflow-x-auto rounded-md border">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b bg-muted/50">
									<th className={th}>Anak</th>
									<th className={th}>Program</th>
									<th className={th}>Pembayaran</th>
									<th className={th}>Tagihan</th>
									<th className={th}>Status</th>
									<th className={th}></th>
								</tr>
							</thead>
							<tbody>
								{enrollments.map((e) => {
									const meta = STATUS_META[e.status];
									const paid = (e.invoices ?? []).filter((i) => i.status === "PAID").length;
									return (
										<tr key={e.id} className="border-b last:border-0">
											<td className={`${td} font-medium whitespace-nowrap`}>
												{e.childName}
												<p className="text-xs font-normal text-muted-foreground">
													{new Date(e.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
												</p>
											</td>
											<td className={td}>
												{CATEGORY_LABEL[e.program.category] ?? e.program.category} — {e.level.name}
												{e.group ? <p className="text-xs text-muted-foreground">Kelompok: {e.group.name}</p> : null}
												{e.notes ? <p className="text-xs text-muted-foreground">Catatan: {e.notes}</p> : null}
											</td>
											<td className={`${td} whitespace-nowrap`}>
												{planLabel(e)}
											</td>
											<td className={`${td} whitespace-nowrap`}>
												{(e.invoices?.length ?? 0) > 1 ? (
													<span className="text-muted-foreground">
														{paid}/{e.invoices?.length} invoice lunas · total {rp((e.invoices ?? []).reduce((s, i) => s + Number(i.totalAmount), 0))}
													</span>
												) : e.invoice ? (
													<span>
														{e.invoice.number} · <span className="font-medium tabular-nums">{rp(e.invoice.totalAmount)}</span>
													</span>
												) : (
													"-"
												)}
											</td>
											<td className={`${td} whitespace-nowrap`}>
												<Badge variant={meta.variant}>{meta.label}</Badge>
											</td>
											<td className={`${td} text-right whitespace-nowrap`}>
												{e.status === "PENDING_PAYMENT" ? (
													<Link href="/orang-tua/pembayaran">
														<Button size="sm" variant="outline">Bayar</Button>
													</Link>
												) : null}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				</section>
			) : null}

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Daftarkan Anak</DialogTitle>
						<DialogDescription>
							Isi data anak lalu pilih program &amp; jenjang. Invoice (biaya pendaftaran + periode pertama) akan terbit otomatis.
						</DialogDescription>
					</DialogHeader>
					<form
						className="flex flex-col gap-3"
						onSubmit={(ev) => {
							ev.preventDefault();
							createM.mutate();
						}}
					>
						{(childrenQ.data?.length ?? 0) > 0 ? (
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="enr-existing">Anak</Label>
								<select
									id="enr-existing"
									value={form.existingStudentId}
									onChange={(e) =>
										setForm({
											...form,
											existingStudentId: e.target.value,
											childName: e.target.value
												? (childrenQ.data ?? []).find((c) => c.id === e.target.value)?.name ?? form.childName
												: form.childName,
										})
									}
									className="border-input bg-background h-9 rounded-md border px-3 text-sm"
								>
									<option value="">Anak baru — isi data di bawah</option>
									{(childrenQ.data ?? []).map((c) => (
										<option key={c.id} value={c.id}>
											{c.name} — daftarkan ke program lain
										</option>
									))}
								</select>
							</div>
						) : null}
						{!form.existingStudentId ? (
							<>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="enr-name">Nama Lengkap Anak *</Label>
							<Input
								id="enr-name"
								value={form.childName}
								onChange={(e) => setForm({ ...form, childName: e.target.value })}
								placeholder="Nama sesuai identitas"
								required
								minLength={3}
							/>
						</div>
						<div className="grid grid-cols-2 gap-2">
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="enr-dob">Tanggal Lahir</Label>
								<Input
									id="enr-dob"
									type="date"
									value={form.dateOfBirth}
									onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
								/>
							</div>
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="enr-gender">Jenis Kelamin</Label>
								<select
									id="enr-gender"
									value={form.gender}
									onChange={(e) => setForm({ ...form, gender: e.target.value })}
									className="border-input bg-background h-9 rounded-md border px-3 text-sm"
								>
									<option value="">— Pilih —</option>
									<option value="M">Laki-laki</option>
									<option value="F">Perempuan</option>
								</select>
							</div>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="enr-school">Asal Sekolah</Label>
							<Input
								id="enr-school"
								value={form.schoolOrigin}
								onChange={(e) => setForm({ ...form, schoolOrigin: e.target.value })}
								placeholder="Contoh: SDN 1 Bandung"
							/>
						</div>
							</>
						) : null}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="enr-program">Program *</Label>
							<ComboboxField
								id="enr-program"
								value={form.programId}
								onChange={(v) => setForm({ ...form, programId: v, levelId: "" })}
								options={(catalogQ.data ?? []).map((p) => ({
									value: p.id,
									label: `${CATEGORY_LABEL[p.category] ?? p.category} — ${p.name}`,
								}))}
								placeholder="Pilih program"
								emptyText="Belum ada program aktif."
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="enr-level">Jenjang *</Label>
							<ComboboxField
								id="enr-level"
								value={form.levelId}
								onChange={(v) => setForm({ ...form, levelId: v })}
								options={(program?.levels ?? []).map((l) => ({
									value: l.id,
									label: `${l.gradeLevel ? `${l.gradeLevel.name} · ` : ""}${l.name}${l.price ? ` — ${rp(l.price)}/${UNIT_LABEL[l.priceUnit ?? "MONTH"] ?? "bulan"}` : ""}`,
								}))}
								placeholder={form.programId ? "Pilih jenjang" : "Pilih program dulu"}
								emptyText="Belum ada jenjang aktif di program ini."
							/>
						</div>
						{level && (level.levelSubjects ?? []).length > 0 ? (
							<div className="flex flex-wrap gap-1">
								{level.levelSubjects.map((ls) => (
									<Badge key={ls.subject.id} variant="outline">{ls.subject.name}</Badge>
								))}
							</div>
						) : null}

						{isReguler && planOptions.length > 0 ? (
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="enr-plan">Cara Bayar *</Label>
								<select
									id="enr-plan"
									value={activePlan}
									onChange={(e) => setForm({ ...form, paymentPlan: e.target.value })}
									className="border-input bg-background h-9 rounded-md border px-3 text-sm"
								>
									{planOptions.includes("FULL") ? (
										<option value="FULL">
											Lunas di awal — {rp(Number(level?.fullPayPrice ?? 0))} (harga diskon)
										</option>
									) : null}
									{planOptions.includes("TWO_TIMES") ? (
										<option value="TWO_TIMES">
											Angsuran 2x — {rp(Number(level?.installment2x ?? 0))}/angsuran
										</option>
									) : null}
									{planOptions.includes("MONTHLY") ? (
										<option value="MONTHLY">
											Angsuran {level?.monthlyCount ?? 10}x — {rp(Number(level?.monthlyAmount ?? 0))}/bulan
										</option>
									) : null}
								</select>
							</div>
						) : null}

						{isPrivat ? (
							<div className="grid grid-cols-2 gap-2">
								<div className="flex flex-col gap-1.5">
									<Label htmlFor="enr-students">Jumlah Siswa</Label>
									<select
										id="enr-students"
										value={form.studentCount}
										onChange={(e) => setForm({ ...form, studentCount: e.target.value })}
										className="border-input bg-background h-9 rounded-md border px-3 text-sm"
									>
										{[1, 2, 3, 4, 5].map((n) => (
											<option key={n} value={n}>
												{n} siswa{n > 1 ? ` — ${rp(Number(level?.sessionPrices?.[String(n)] ?? levelPrice))}/pertemuan` : ""}
											</option>
										))}
									</select>
								</div>
								<div className="flex flex-col gap-1.5">
									<Label htmlFor="enr-sessions">Jumlah Pertemuan</Label>
									<Input
										id="enr-sessions"
										type="number"
										min={1}
										max={48}
										value={form.sessionCount}
										onChange={(e) => setForm({ ...form, sessionCount: e.target.value })}
									/>
								</div>
								<p className="col-span-2 text-xs text-muted-foreground">
									Privat dibayar di awal · {level?.sessionDurationMin ?? 60} menit/pertemuan · {rp(perSession)}/pertemuan/siswa.
								</p>
							</div>
						) : null}

						{program?.category === "EXTRA" && level?.promoPrice ? (
							<p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
								Harga promo {rp(Number(level.promoPrice))}/bulan berlaku otomatis bila anak sudah terdaftar di kelas reguler.
							</p>
						) : null}

						{form.programId && form.levelId ? (
							<div className="flex flex-col gap-1 rounded-md border bg-muted/40 p-3 text-sm">
								{regFee > 0 ? (
									<div className="flex justify-between">
										<span className="text-muted-foreground">Biaya pendaftaran</span>
										<span className="tabular-nums">{rp(regFee)}</span>
									</div>
								) : null}
								{firstBill > 0 ? (
									<div className="flex justify-between">
										<span className="text-muted-foreground">
											{isReguler
												? activePlan === "FULL"
													? "Biaya les 1 tahun (lunas di awal)"
													: activePlan === "TWO_TIMES"
														? "Angsuran 1 dari 2"
														: `Angsuran bulan 1 dari ${level?.monthlyCount ?? 10}`
												: isPrivat
													? `Les privat ${sessionCount} pertemuan`
													: "Biaya les bulan pertama"}
										</span>
										<span className="tabular-nums">{rp(firstBill)}</span>
									</div>
								) : null}
								<div className="flex justify-between border-t pt-1 font-semibold">
									<span>Invoice pertama</span>
									<span className="tabular-nums">{rp(regFee + firstBill)}</span>
								</div>
								{isReguler && activePlan === "TWO_TIMES" ? (
									<p className="text-xs text-muted-foreground">
										+ 1 angsuran lagi {rp(Number(level?.installment2x ?? 0))} bulan depan — invoice dibuat berjadwal otomatis.
									</p>
								) : null}
								{isReguler && activePlan === "MONTHLY" ? (
									<p className="text-xs text-muted-foreground">
										+ {(level?.monthlyCount ?? 10) - 1} angsuran berikutnya {rp(Number(level?.monthlyAmount ?? 0))}/bulan — invoice dibuat berjadwal otomatis.
									</p>
								) : null}
								{isReguler && level?.price && activePlan === "FULL" ? (
									<p className="text-xs text-muted-foreground">
										Hemat {rp(Number(level.price) - Number(level.fullPayPrice ?? 0))} dibanding harga normal {rp(level.price)}.
									</p>
								) : null}
								<p className="text-xs text-muted-foreground">
									Akun anak dibuat otomatis dan aktif setelah pembayaran diverifikasi admin finance.
								</p>
							</div>
						) : null}
						<DialogFooter>
							<Button type="button" variant="outline" onClick={() => setOpen(false)}>
								Batal
							</Button>
							<Button
								type="submit"
								disabled={
									createM.isPending ||
									!form.childName.trim() ||
									!form.programId ||
									!form.levelId
								}
							>
								{createM.isPending ? "Memproses..." : "Buat Pendaftaran"}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			<ConfirmDialog
				open={deleteChild !== null}
				onOpenChange={(o) => { if (!o) setDeleteChild(null); }}
				title={`Hapus data anak "${deleteChild?.name ?? ''}"?`}
				description="Data anak, akun loginnya, dan pendaftaran yang belum dibayar akan dihapus permanen. Anak yang sudah lunas/diterima/masuk kelompok tidak bisa dihapus — hubungi admin."
				confirmLabel="Ya, hapus"
				pending={removeChildM.isPending}
				onConfirm={() => { if (deleteChild) removeChildM.mutate(deleteChild.id); }}
			/>
		</div>
	);
}
