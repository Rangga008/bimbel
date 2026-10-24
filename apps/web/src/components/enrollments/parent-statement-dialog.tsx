"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Eraser, FileSignature } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch, ApiError } from "@/lib/api-client";
import { PrintStatementButton } from "./statement-print";

export interface StatementInstallment {
	label: string;
	amount: number;
}

export interface ParentStatement {
	id: string;
	parentName: string;
	address: string | null;
	phone: string | null;
	studentName: string;
	levelName: string;
	schoolOrigin: string | null;
	programName: string;
	paymentLabel: string;
	installments: StatementInstallment[];
	installmentAmount: number | null;
	installmentCount: number | null;
	totalAmount: number;
	dueDay: number | null;
	signatureData: string | null;
	agreedAt: string;
}

interface StatementFormData {
	parentName: string;
	phone: string;
	studentName: string;
	levelName: string;
	schoolOrigin: string;
	programName: string;
	dueDay: number | null;
	paymentLabel: string;
	installments: StatementInstallment[];
	installmentAmount: number | null;
	installmentCount: number | null;
	totalAmount: number;
}

interface StatementResponse {
	statement: ParentStatement | null;
	status: string;
	form: StatementFormData;
}

function rp(value: number | string | null | undefined) {
	if (value === null || value === undefined) return "-";
	const n = Number(value);
	if (Number.isNaN(n)) return "-";
	return `Rp ${n.toLocaleString("id-ID")}`;
}

/** Ketentuan administrasi kontrak belajar — versi v1 sesuai brosur GFS. */
export const STATEMENT_TERMS = [
	"Biaya les bukan dihitung biaya per bulan, tetapi biaya paket sampai selesai akhir tahun ajaran yang dapat dipermudah dengan diangsur. Jika program sudah selesai dan masih memiliki sisa pembayaran sesuai total biaya les yang seharusnya, orang tua wajib menyelesaikan sisa pembayaran (tidak tergantung tanggal/bulan masuk les).",
	"Menjelang akhir tahun ajaran, orang tua wajib menyelesaikan seluruh pembayaran yakni: maksimal satu minggu sebelum ujian sekolah/UTBK untuk kelas 6, 9, dan 12; maksimal satu minggu sebelum ujian kenaikan kelas untuk kelas 3, 4, 5, 7, 8, 10, dan 11.",
	"Jika siswa mengonfirmasi tidak menyelesaikan/berhenti sebelum program berakhir dan pilihan biaya les diangsur, maka orang tua wajib membayar denda 50% dari sisa angsuran yang seharusnya dibayarkan.",
	"Jika siswa mengonfirmasi tidak menyelesaikan/berhenti sebelum program berakhir dan orang tua sudah membayar lunas total seluruhnya saat awal daftar, maka pihak Bimbel GFS wajib mengembalikan uang sebesar 50% dari sisa program seharusnya.",
	"Jika siswa tidak menyelesaikan/berhenti sebelum program berakhir namun tidak mengonfirmasi, maka dianggap masih menjadi siswa GFS aktif yang tetap diwajibkan membayar biaya les secara penuh 100%.",
	"Jika pembayaran angsuran tidak sesuai dengan kesepakatan, pihak Bimbel GFS memiliki hak untuk melakukan penagihan baik via SMS/WA, telepon, surat, home visit dan/atau menonaktifkan sementara kegiatan belajar siswa di Bimbel GFS sampai beban administrasi diselesaikan atau ada pernyataan tertulis dari pihak orang tua.",
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="flex flex-col gap-1">
			<Label className="text-xs text-muted-foreground">{label}</Label>
			{children}
		</div>
	);
}

/** Kanvas tanda tangan sederhana — pointer events, output dataURL PNG. */
function SignaturePad({
	onChange,
}: {
	onChange: (dataUrl: string | null) => void;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const drawing = useRef(false);
	const [empty, setEmpty] = useState(true);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		ctx.fillStyle = "#ffffff";
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		ctx.strokeStyle = "#1e293b";
		ctx.lineWidth = 2.2;
		ctx.lineCap = "round";
		ctx.lineJoin = "round";
	}, []);

	const pos = (e: React.PointerEvent) => {
		const canvas = canvasRef.current!;
		const rect = canvas.getBoundingClientRect();
		return {
			x: ((e.clientX - rect.left) / rect.width) * canvas.width,
			y: ((e.clientY - rect.top) / rect.height) * canvas.height,
		};
	};

	const emit = () => {
		const canvas = canvasRef.current;
		if (canvas) onChange(canvas.toDataURL("image/png"));
	};

	return (
		<div className="flex flex-col gap-1.5">
			<canvas
				ref={canvasRef}
				width={480}
				height={170}
				className="w-full touch-none rounded-md border bg-white"
				onPointerDown={(e) => {
					drawing.current = true;
					const ctx = canvasRef.current?.getContext("2d");
					const p = pos(e);
					ctx?.beginPath();
					ctx?.moveTo(p.x, p.y);
					(e.target as HTMLElement).setPointerCapture(e.pointerId);
				}}
				onPointerMove={(e) => {
					if (!drawing.current) return;
					const ctx = canvasRef.current?.getContext("2d");
					const p = pos(e);
					ctx?.lineTo(p.x, p.y);
					ctx?.stroke();
					if (empty) setEmpty(false);
				}}
				onPointerUp={() => {
					if (drawing.current) {
						drawing.current = false;
						emit();
					}
				}}
				onPointerLeave={() => {
					if (drawing.current) {
						drawing.current = false;
						emit();
					}
				}}
			/>
			<div className="flex items-center justify-between">
				<p className="text-xs text-muted-foreground">
					Gambar tanda tangan di dalam kotak (opsional — bisa juga materai saat cetak).
				</p>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={() => {
						const canvas = canvasRef.current;
						const ctx = canvas?.getContext("2d");
						if (canvas && ctx) {
							ctx.fillStyle = "#ffffff";
							ctx.fillRect(0, 0, canvas.width, canvas.height);
						}
						setEmpty(true);
						onChange(null);
					}}
				>
					<Eraser className="size-3.5" /> Hapus
				</Button>
			</div>
		</div>
	);
}

/**
 * Dialog surat pernyataan ortu per pendaftaran — formulir diisi ortu,
 * rincian biaya/angsuran adalah snapshot server (tidak bisa diedit klien).
 */
export function ParentStatementDialog({
	enrollmentId,
	open,
	onOpenChange,
}: {
	enrollmentId: string | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const qc = useQueryClient();
	const [form, setForm] = useState({
		parentName: "",
		address: "",
		phone: "",
		schoolOrigin: "",
		dueDay: "",
		agreed: false,
	});
	const [editing, setEditing] = useState(false);
	const [signatureData, setSignatureData] = useState<string | null>(null);

	const dataQ = useQuery({
		queryKey: ["parent-statement", enrollmentId],
		enabled: open && !!enrollmentId,
		queryFn: () =>
			apiFetch<StatementResponse>(`/me/enrollments/${enrollmentId}/statement`),
	});

	// Isi formulir begitu data tiba — dari surat tersimpan atau prefill.
	useEffect(() => {
		const d = dataQ.data;
		if (!d) return;
		const s = d.statement;
		setForm({
			parentName: s?.parentName ?? d.form.parentName,
			address: s?.address ?? "",
			phone: s?.phone ?? d.form.phone,
			schoolOrigin: s?.schoolOrigin ?? d.form.schoolOrigin,
			dueDay: s?.dueDay != null ? String(s.dueDay) : d.form.dueDay != null ? String(d.form.dueDay) : "",
			agreed: false,
		});
		setEditing(!s);
	}, [dataQ.data]);

	const submitM = useMutation({
		mutationFn: () =>
			apiFetch<ParentStatement>(`/me/enrollments/${enrollmentId}/statement`, {
				method: "POST",
				body: {
					parentName: form.parentName.trim(),
					address: form.address.trim() || undefined,
					phone: form.phone.trim() || undefined,
					schoolOrigin: form.schoolOrigin.trim() || undefined,
					dueDay: form.dueDay ? Number(form.dueDay) : undefined,
					signatureData: signatureData ?? undefined,
					agreed: true,
				},
			}),
		onSuccess: () => {
			toast.success("Surat pernyataan tersimpan dan ditandatangani.");
			qc.invalidateQueries({ queryKey: ["parent-statement", enrollmentId] });
			qc.invalidateQueries({ queryKey: ["my-enrollments"] });
			setEditing(false);
		},
		onError: (e) =>
			toast.error(e instanceof ApiError ? e.message : "Gagal menyimpan surat pernyataan."),
	});

	const d = dataQ.data;
	const s = d?.statement ?? null;
	const f = d?.form ?? null;
	const display = s
		? {
				paymentLabel: s.paymentLabel,
				installments: s.installments,
				totalAmount: s.totalAmount,
				installmentAmount: s.installmentAmount,
				installmentCount: s.installmentCount,
			}
		: f
			? {
					paymentLabel: f.paymentLabel,
					installments: f.installments,
					totalAmount: f.totalAmount,
					installmentAmount: f.installmentAmount,
					installmentCount: f.installmentCount,
				}
			: null;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<FileSignature className="size-5" />
						Surat Pernyataan Orang Tua — Kontrak Belajar
					</DialogTitle>
					<DialogDescription>
						Formulir persetujuan administrasi Bimbel GFS untuk {s?.studentName ?? f?.studentName ?? "anak"}.
					</DialogDescription>
				</DialogHeader>

				{dataQ.isLoading ? <Skeleton className="h-64 w-full" /> : null}
				{dataQ.isError ? (
					<p className="py-8 text-center text-sm text-destructive">
						Gagal memuat formulir — coba lagi.
					</p>
				) : null}

				{d && display ? (
					s && !editing ? (
						// Tampilan surat yang sudah ditandatangani (read-only).
						<div className="flex flex-col gap-4 text-sm">
							<div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400">
								<CheckCircle2 className="size-4 shrink-0" />
								<span>
									Ditandatangani {new Date(s.agreedAt).toLocaleDateString("id-ID", {
										day: "numeric", month: "long", year: "numeric",
									})} — data di bawah adalah kesepakatan tersimpan.
								</span>
							</div>
							<div className="grid gap-3 rounded-md border p-4 sm:grid-cols-2">
								<Field label="Nama Orang Tua/Wali"><p className="font-medium">{s.parentName}</p></Field>
								<Field label="No. HP"><p className="font-medium">{s.phone ?? "-"}</p></Field>
								<Field label="Alamat"><p className="font-medium sm:col-span-2">{s.address ?? "-"}</p></Field>
								<Field label="Nama Siswa"><p className="font-medium">{s.studentName}</p></Field>
								<Field label="Kelas/Jenjang"><p className="font-medium">{s.levelName}</p></Field>
								<Field label="Asal Sekolah"><p className="font-medium">{s.schoolOrigin ?? "-"}</p></Field>
								<Field label="Program"><p className="font-medium">{s.programName}</p></Field>
								<Field label="Sistem Pembayaran">
									<p className="font-medium">{display.paymentLabel}</p>
								</Field>
								{s.dueDay ? (
									<Field label="Jatuh Tempo"><p className="font-medium">Tanggal {s.dueDay} setiap bulan</p></Field>
								) : null}
							</div>
							<div className="rounded-md border">
								<div className="border-b bg-muted/50 px-3 py-2 text-xs font-medium">Rincian Pembayaran</div>
								<div className="divide-y">
									{display.installments.map((it, i) => (
										<div key={i} className="flex items-center justify-between px-3 py-1.5 text-xs">
											<span className="capitalize text-muted-foreground">{it.label}</span>
											<span className="font-medium tabular-nums">{rp(it.amount)}</span>
										</div>
									))}
									<div className="flex items-center justify-between bg-muted/50 px-3 py-2 text-sm font-semibold">
										<span>TOTAL</span>
										<span className="tabular-nums">{rp(display.totalAmount)}</span>
									</div>
								</div>
							</div>
							{s.signatureData ? (
								<Field label="Tanda Tangan">
									<img
										src={s.signatureData}
										alt="Tanda tangan orang tua"
										className="h-20 w-auto rounded-md border bg-white object-contain p-1"
									/>
								</Field>
							) : null}
							<div className="flex items-center justify-end gap-2">
								<PrintStatementButton enrollmentId={enrollmentId!} base="/me/enrollments" />
								<Button variant="outline" size="sm" onClick={() => setEditing(true)}>
									Perbarui Surat Pernyataan
								</Button>
							</div>
						</div>
					) : (
						// Formulir pengisian / koreksi surat pernyataan.
						<form
							className="flex flex-col gap-4"
							onSubmit={(ev) => {
								ev.preventDefault();
								submitM.mutate();
							}}
						>
							<div className="grid gap-3 sm:grid-cols-2">
								<Field label="Nama Orang Tua/Wali *">
									<Input
										value={form.parentName}
										onChange={(e) => setForm({ ...form, parentName: e.target.value })}
										required
										minLength={3}
									/>
								</Field>
								<Field label="No. HP *">
									<Input
										value={form.phone}
										onChange={(e) => setForm({ ...form, phone: e.target.value })}
										required
										minLength={9}
										inputMode="tel"
									/>
								</Field>
								<Field label="Alamat *">
									<Textarea
										className="sm:col-span-2 min-h-16"
										value={form.address}
										onChange={(e) => setForm({ ...form, address: e.target.value })}
										required
									/>
								</Field>
								<Field label="Nama Siswa">
									<Input value={f?.studentName ?? ""} disabled />
								</Field>
								<Field label="Kelas / Jenjang">
									<Input value={f?.levelName ?? ""} disabled />
								</Field>
								<Field label="Asal Sekolah *">
									<Input
										value={form.schoolOrigin}
										onChange={(e) => setForm({ ...form, schoolOrigin: e.target.value })}
										required
									/>
								</Field>
								<Field label="Jatuh Tempo (tanggal tiap bulan)">
									<Input
										type="number"
										min={1}
										max={31}
										value={form.dueDay}
										onChange={(e) => setForm({ ...form, dueDay: e.target.value })}
										placeholder="mis. 10"
									/>
								</Field>
							</div>

							<div className="rounded-md border">
								<div className="border-b bg-muted/50 px-3 py-2 text-xs font-medium">
									Rincian Pembayaran — {f?.programName} · {display.paymentLabel}
								</div>
								<div className="divide-y">
									{display.installments.map((it, i) => (
										<div key={i} className="flex items-center justify-between px-3 py-1.5 text-xs">
											<span className="capitalize text-muted-foreground">{it.label}</span>
											<span className="font-medium tabular-nums">{rp(it.amount)}</span>
										</div>
									))}
									{display.installmentAmount && display.installmentCount ? (
										<div className="flex items-center justify-between px-3 py-1.5 text-xs">
											<span className="text-muted-foreground">Per angsuran</span>
											<span className="font-medium tabular-nums">
												{rp(display.installmentAmount)} × {display.installmentCount}
											</span>
										</div>
									) : null}
									<div className="flex items-center justify-between bg-muted/50 px-3 py-2 text-sm font-semibold">
										<span>TOTAL</span>
										<span className="tabular-nums">{rp(display.totalAmount)}</span>
									</div>
								</div>
							</div>

							<div className="rounded-md border">
								<div className="border-b bg-muted/50 px-3 py-2 text-xs font-medium">Ketentuan Administrasi</div>
								<ol className="max-h-44 list-decimal space-y-2 overflow-y-auto px-6 py-3 text-xs text-muted-foreground">
									{STATEMENT_TERMS.map((t, i) => (
										<li key={i}>{t}</li>
									))}
								</ol>
							</div>

							<div className="flex flex-col gap-1">
								<Label className="text-xs text-muted-foreground">Tanda Tangan Orang Tua/Wali</Label>
								<SignaturePad onChange={setSignatureData} />
							</div>

							<label className="flex cursor-pointer items-start gap-2 text-sm">
								<Checkbox
									checked={form.agreed}
									onCheckedChange={(v) => setForm({ ...form, agreed: v === true })}
									className="mt-0.5"
								/>
								<span>
									Saya telah membaca, memahami, dan akan mematuhi semua ketentuan administrasi
									Bimbel GFS di atas. Saya yang bertanda tangan di bawah ini selaku orang tua/wali
									menyetujui kontrak belajar ini.
								</span>
							</label>

							<DialogFooter>
								{s ? (
									<Button type="button" variant="outline" onClick={() => setEditing(false)}>
										Batal
									</Button>
								) : null}
								<Button type="submit" disabled={!form.agreed || submitM.isPending}>
									{submitM.isPending ? "Menyimpan…" : s ? "Perbarui & Tanda Tangani" : "Setuju & Tanda Tangani"}
								</Button>
							</DialogFooter>
						</form>
					)
				) : null}
			</DialogContent>
		</Dialog>
	);
}
