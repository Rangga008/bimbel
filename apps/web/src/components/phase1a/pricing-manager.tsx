"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, ApiError } from "@/lib/api-client";

interface PricingLevel {
	id: string;
	name: string;
	price: string | number | null;
	priceUnit: "YEAR" | "MONTH" | "SESSION" | "PACKAGE" | null;
	fullPayPrice: string | number | null;
	installment2x: string | number | null;
	monthlyAmount: string | number | null;
	monthlyCount: number | null;
	promoPrice: string | number | null;
	sessionPrices: Record<string, number> | null;
	sessionDurationMin: number | null;
	registrationFee: string | number | null;
	gradeLevel: { id: string; code: string; name: string } | null;
}

interface PricingProgram {
	id: string;
	name: string;
	code: string;
	category: "REGULER" | "EXTRA" | "PRIVAT";
	registrationFee: string | number | null;
	levels: PricingLevel[];
}

const CATEGORY_LABEL: Record<string, string> = {
	REGULER: "Kelas Reguler",
	EXTRA: "Kelas Extra",
	PRIVAT: "Kelas Privat",
};

const UNIT_OPTIONS = [
	{ value: "YEAR", label: "Per Tahun Ajaran" },
	{ value: "MONTH", label: "Per Bulan" },
	{ value: "SESSION", label: "Per Pertemuan" },
	{ value: "PACKAGE", label: "Per Paket" },
];

function rp(v: string | number | null | undefined) {
	if (v === null || v === undefined || v === "") return "-";
	const n = Number(v);
	return Number.isNaN(n) ? "-" : `Rp ${n.toLocaleString("id-ID")}`;
}

function err(e: unknown, fb: string) {
	return e instanceof ApiError ? e.message : fb;
}

type NumField =
	| "price"
	| "fullPayPrice"
	| "installment2x"
	| "monthlyAmount"
	| "monthlyCount"
	| "promoPrice"
	| "sessionDurationMin"
	| "registrationFee";

interface LevelForm {
	price: string;
	priceUnit: string;
	fullPayPrice: string;
	installment2x: string;
	monthlyAmount: string;
	monthlyCount: string;
	promoPrice: string;
	sessionPrices: string;
	sessionDurationMin: string;
	registrationFee: string;
}

function toForm(l: PricingLevel): LevelForm {
	const tiers = l.sessionPrices
		? Object.entries(l.sessionPrices)
				.map(([k, v]) => `${k}=${v}`)
				.join(", ")
		: "";
	const num = (v: string | number | null) =>
		v === null || v === undefined ? "" : String(v);
	return {
		price: num(l.price),
		priceUnit: l.priceUnit ?? "",
		fullPayPrice: num(l.fullPayPrice),
		installment2x: num(l.installment2x),
		monthlyAmount: num(l.monthlyAmount),
		monthlyCount: l.monthlyCount === null ? "" : String(l.monthlyCount),
		promoPrice: num(l.promoPrice),
		sessionPrices: tiers,
		sessionDurationMin:
			l.sessionDurationMin === null ? "" : String(l.sessionDurationMin),
		registrationFee: num(l.registrationFee),
	};
}

function numOrNull(v: string) {
	return v === "" ? null : Number(v);
}

/** Editor harga satu jenjang — dipakai halaman Harga Program admin finance. */
function LevelPricingForm({
	level,
	programRegFee,
}: {
	level: PricingLevel;
	programRegFee: string | number | null;
}) {
	const qc = useQueryClient();
	const [form, setForm] = useState<LevelForm>(() => toForm(level));
	const [dirty, setDirty] = useState(false);

	const saveM = useMutation({
		mutationFn: () => {
			const tiers: Record<string, number> | null = form.sessionPrices.trim()
				? Object.fromEntries(
						form.sessionPrices
							.split(",")
							.map((p) => p.trim())
							.filter(Boolean)
							.map((p) => {
								const [k, v] = p.split("=").map((s) => s.trim());
								return [k, Number(v)];
							}),
					)
				: null;
			return apiFetch(`/levels/${level.id}/pricing`, {
				method: "PATCH",
				body: {
					price: numOrNull(form.price),
					priceUnit: form.priceUnit || null,
					fullPayPrice: numOrNull(form.fullPayPrice),
					installment2x: numOrNull(form.installment2x),
					monthlyAmount: numOrNull(form.monthlyAmount),
					monthlyCount: numOrNull(form.monthlyCount),
					promoPrice: numOrNull(form.promoPrice),
					sessionPrices: tiers,
					sessionDurationMin: numOrNull(form.sessionDurationMin),
					registrationFee: numOrNull(form.registrationFee),
				},
			});
		},
		onSuccess: () => {
			toast.success(`Harga ${level.name} tersimpan.`);
			setDirty(false);
			qc.invalidateQueries({ queryKey: ["programs-catalog"] });
		},
		onError: (e) => toast.error(err(e, "Gagal menyimpan harga.")),
	});

	const set = (k: keyof LevelForm) => (v: string) => {
		setForm({ ...form, [k]: v });
		setDirty(true);
	};
	const num = (k: NumField) => (
		<Input
			type="number"
			min={0}
			className="h-8"
			value={form[k]}
			onChange={(e) => set(k)(e.target.value)}
		/>
	);

	const isReguler = level.priceUnit === "YEAR";
	const isSession = level.priceUnit === "SESSION";

	return (
		<div className="rounded-md border p-3">
			<div className="mb-2 flex flex-wrap items-center gap-2">
				<p className="font-medium">
					{level.gradeLevel ? `${level.gradeLevel.name} · ` : ""}
					{level.name}
				</p>
				{level.priceUnit ? (
					<Badge variant="outline">
						{UNIT_OPTIONS.find((u) => u.value === level.priceUnit)?.label}
					</Badge>
				) : null}
			</div>
			<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
				<div className="flex flex-col gap-1">
					<Label className="text-xs">Harga dasar (Rp)</Label>
					{num("price")}
				</div>
				<div className="flex flex-col gap-1">
					<Label className="text-xs">Satuan</Label>
					<select
						className="border-input bg-background h-8 rounded-md border px-2 text-sm"
						value={form.priceUnit}
						onChange={(e) => set("priceUnit")(e.target.value)}
					>
						<option value="">— pilih —</option>
						{UNIT_OPTIONS.map((u) => (
							<option key={u.value} value={u.value}>
								{u.label}
							</option>
						))}
					</select>
				</div>
				<div className="flex flex-col gap-1">
					<Label className="text-xs">Biaya pendaftaran (Rp)</Label>
					{num("registrationFee")}
					<p className="text-[10px] text-muted-foreground">
						Kosong = ikut program ({rp(programRegFee)})
					</p>
				</div>
				{isReguler ? (
					<>
						<div className="flex flex-col gap-1">
							<Label className="text-xs">Lunas di awal (Rp)</Label>
							{num("fullPayPrice")}
						</div>
						<div className="flex flex-col gap-1">
							<Label className="text-xs">Angsuran 2x (Rp)</Label>
							{num("installment2x")}
						</div>
						<div className="flex flex-col gap-1">
							<Label className="text-xs">Angsuran/bulan (Rp)</Label>
							{num("monthlyAmount")}
						</div>
						<div className="flex flex-col gap-1">
							<Label className="text-xs">Jumlah angsuran</Label>
							{num("monthlyCount")}
						</div>
					</>
				) : null}
				{isSession ? (
					<>
						<div className="flex flex-col gap-1">
							<Label className="text-xs">Durasi/pertemuan (mnt)</Label>
							{num("sessionDurationMin")}
						</div>
						<div className="col-span-2 flex flex-col gap-1 sm:col-span-3">
							<Label className="text-xs">
								Harga per jumlah siswa (format: 2=500000, 3=450000)
							</Label>
							<Input
								className="h-8"
								value={form.sessionPrices}
								placeholder="1=harga dasar di atas"
								onChange={(e) => set("sessionPrices")(e.target.value)}
							/>
						</div>
					</>
				) : null}
				{level.priceUnit === "MONTH" ? (
					<div className="flex flex-col gap-1">
						<Label className="text-xs">Harga promo (Rp)</Label>
						{num("promoPrice")}
						<p className="text-[10px] text-muted-foreground">
							Untuk anak yang juga ikut reguler
						</p>
					</div>
				) : null}
			</div>
			<div className="mt-2 flex justify-end">
				<Button
					size="sm"
					disabled={!dirty || saveM.isPending}
					onClick={() => saveM.mutate()}
				>
					{saveM.isPending ? "Menyimpan…" : "Simpan Harga"}
				</Button>
			</div>
		</div>
	);
}

/** Halaman "Harga Program" (admin finance): atur biaya pendaftaran program +
 *  seluruh pricelist jenjang tanpa akses struktur program. */
export function PricingManager() {
	const qc = useQueryClient();
	const catalogQ = useQuery({
		queryKey: ["programs-catalog"],
		queryFn: () => apiFetch<PricingProgram[]>("/programs/catalog"),
	});
	const [regFees, setRegFees] = useState<Record<string, string>>({});
	const [regFeeDirty, setRegFeeDirty] = useState<Record<string, boolean>>({});

	const saveRegFeeM = useMutation({
		mutationFn: (args: { id: string; fee: string }) =>
			apiFetch(`/programs/${args.id}/pricing`, {
				method: "PATCH",
				body: { registrationFee: args.fee === "" ? null : Number(args.fee) },
			}),
		onSuccess: (_d, v) => {
			toast.success("Biaya pendaftaran program tersimpan.");
			setRegFeeDirty((m) => ({ ...m, [v.id]: false }));
			qc.invalidateQueries({ queryKey: ["programs-catalog"] });
		},
		onError: (e) => toast.error(err(e, "Gagal menyimpan biaya pendaftaran.")),
	});

	const programs = catalogQ.data ?? [];

	return (
		<div className="flex flex-col gap-5">
			<div>
				<h1 className="text-2xl font-semibold tracking-tight">Harga Program</h1>
				<p className="text-sm text-muted-foreground">
					Atur biaya pendaftaran &amp; pricelist tiap jenjang — perubahan langsung
					berlaku untuk pendaftaran baru (invoice yang sudah terbit tidak berubah).
				</p>
			</div>
			{catalogQ.isLoading ? <Skeleton className="h-48 w-full" /> : null}
			{programs.map((p) => (
				<Card key={p.id}>
					<CardHeader>
						<div className="flex flex-wrap items-center justify-between gap-3">
							<div>
								<CardTitle className="text-lg">{p.name}</CardTitle>
								<CardDescription>
									{CATEGORY_LABEL[p.category] ?? p.category}
								</CardDescription>
							</div>
							<div className="flex items-end gap-2">
								<div className="flex flex-col gap-1">
									<Label className="text-xs">Biaya pendaftaran program (Rp)</Label>
									<Input
										type="number"
										min={0}
										className="h-8 w-40"
										value={
											regFees[p.id] ??
											(p.registrationFee === null ||
											p.registrationFee === undefined
												? ""
												: String(p.registrationFee))
										}
										onChange={(e) => {
											setRegFees((m) => ({ ...m, [p.id]: e.target.value }));
											setRegFeeDirty((m) => ({ ...m, [p.id]: true }));
										}}
									/>
								</div>
								<Button
									size="sm"
									variant="outline"
									disabled={!regFeeDirty[p.id] || saveRegFeeM.isPending}
									onClick={() =>
										saveRegFeeM.mutate({
											id: p.id,
											fee: regFees[p.id] ?? "",
										})
									}
								>
									Simpan
								</Button>
							</div>
						</div>
					</CardHeader>
					<CardContent className="flex flex-col gap-3">
						{p.levels.length === 0 ? (
							<p className="text-sm text-muted-foreground">
								Belum ada jenjang di program ini.
							</p>
						) : (
							p.levels.map((l) => (
								// key memuat fingerprint harga — setelah simpan+refetch form
								// kembali menampilkan nilai terbaru dari server.
								<LevelPricingForm
									key={`${l.id}:${l.price}:${l.priceUnit}:${l.fullPayPrice}:${l.installment2x}:${l.monthlyAmount}:${l.monthlyCount}:${l.promoPrice}:${l.sessionDurationMin}:${l.registrationFee}`}
									level={l}
									programRegFee={p.registrationFee}
								/>
							))
						)}
					</CardContent>
				</Card>
			))}
		</div>
	);
}
