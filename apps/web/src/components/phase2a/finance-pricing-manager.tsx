"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Info, Package2, Pencil, Search, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { SkeletonCards } from "@/components/shared/skeletons";
import { apiFetch, ApiError } from "@/lib/api-client";
import type { LevelItem, PackageItem, ProgramItem } from "@/lib/phase1a-types";

const LEVEL_UNIT_OPTIONS = [
	{ value: "YEAR", label: "Per tahun ajaran" },
	{ value: "MONTH", label: "Per bulan" },
	{ value: "SESSION", label: "Per pertemuan" },
	{ value: "PACKAGE", label: "Per paket" },
];

const NUM_CLS =
	"h-9 rounded-md border border-input bg-input/30 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

function rupiah(value: string | number | null | undefined) {
	if (value === null || value === undefined) return "Belum diatur";
	const n = Number(value);
	if (Number.isNaN(n)) return String(value);
	return `Rp ${n.toLocaleString("id-ID")}`;
}

/**
 * Halaman "Harga Program" (Admin Finance) — daftar program → level → paket
 * dengan editor harga paket. Finance hanya mengubah harga (price.manage);
 * struktur program/level tetap milik admin akademik.
 */
export function FinancePricingManager() {
	const qc = useQueryClient();
	const [search, setSearch] = useState("");
	const [editTarget, setEditTarget] = useState<PackageItem | null>(null);
	const [priceInput, setPriceInput] = useState("");
	const [editLevel, setEditLevel] = useState<LevelItem | null>(null);
	const [levelForm, setLevelForm] = useState<Record<string, string>>({});

	const programsQ = useQuery({
		queryKey: ["programs"],
		queryFn: () => apiFetch<ProgramItem[]>("/programs"),
	});
	const packagesQ = useQuery({
		queryKey: ["packages-pricing"],
		queryFn: () => apiFetch<PackageItem[]>("/packages"),
	});
	const levelsQ = useQuery({
		queryKey: ["levels-pricing"],
		queryFn: () => apiFetch<LevelItem[]>("/levels"),
	});

	const groups = useMemo(() => {
		const q = search.trim().toLowerCase();
		const pkgs = (packagesQ.data ?? []).filter((p) => {
			if (!q) return true;
			return (
				p.name.toLowerCase().includes(q) ||
				(p.code ?? "").toLowerCase().includes(q) ||
				(p.level?.name ?? "").toLowerCase().includes(q) ||
				(p.level?.program?.name ?? "").toLowerCase().includes(q)
			);
		});
		// Kelompokkan: program → level → paket (paket sudah include level+program).
		const byProgram = new Map<
			string,
			{ program: string; code: string; levels: Map<string, { level: string; items: PackageItem[] }> }
		>();
		for (const p of pkgs) {
			const progId = p.level?.program?.id ?? "tanpa-program";
			const progName = p.level?.program?.name ?? "Tanpa Program";
			const progCode = p.level?.program?.code ?? "";
			const levelId = p.level?.id ?? p.levelId;
			const levelName = p.level?.name ?? "Tanpa Level";
			if (!byProgram.has(progId)) {
				byProgram.set(progId, { program: progName, code: progCode, levels: new Map() });
			}
			const prog = byProgram.get(progId)!;
			if (!prog.levels.has(levelId)) prog.levels.set(levelId, { level: levelName, items: [] });
			prog.levels.get(levelId)!.items.push(p);
		}
		return [...byProgram.values()];
	}, [packagesQ.data, search]);

	const setPriceM = useMutation({
		mutationFn: () => {
			const price = priceInput.trim() === "" ? null : Number(priceInput);
			return apiFetch<PackageItem>(`/packages/${editTarget!.id}/price`, {
				method: "PATCH",
				body: { price },
			});
		},
		onSuccess: (updated) => {
			toast.success(
				updated.price === null
					? `Harga ${updated.name} dikosongkan.`
					: `Harga ${updated.name} diatur ke ${rupiah(updated.price)}.`,
			);
			setEditTarget(null);
			setPriceInput("");
			qc.invalidateQueries({ queryKey: ["packages-pricing"] });
			qc.invalidateQueries({ queryKey: ["packages"] });
			qc.invalidateQueries({ queryKey: ["packages-lite"] });
		},
		onError: (e) =>
			toast.error(e instanceof ApiError ? e.message : "Gagal menyimpan harga."),
	});

	// Jenjang: dikelompokkan per program untuk seksi harga level.
	const levelGroups = useMemo(() => {
		const q = search.trim().toLowerCase();
		const lvls = (levelsQ.data ?? []).filter((l) => {
			if (!q) return true;
			return (
				l.name.toLowerCase().includes(q) ||
				(l.program?.name ?? "").toLowerCase().includes(q)
			);
		});
		const byProgram = new Map<string, { program: string; category: string; items: LevelItem[] }>();
		for (const l of lvls) {
			const progId = l.program?.id ?? l.programId;
			const progName = l.program?.name ?? "Program";
			const cat = (l.program as { category?: string } | undefined)?.category ?? "";
			if (!byProgram.has(progId)) byProgram.set(progId, { program: progName, category: cat, items: [] });
			byProgram.get(progId)!.items.push(l);
		}
		return [...byProgram.values()];
	}, [levelsQ.data, search]);

	const setLevelPricingM = useMutation({
		mutationFn: () => {
			const num = (k: string) =>
				levelForm[k] === undefined ? undefined : levelForm[k] === "" ? null : Number(levelForm[k]);
			const sessionPrices: Record<string, number> = {};
			let sessionTouched = false;
			for (const n of [2, 3, 4, 5]) {
				const v = levelForm[`sessionPrice${n}`];
				if (v !== undefined) {
					sessionTouched = true;
					if (v !== "") sessionPrices[String(n)] = Number(v);
				}
			}
			return apiFetch<LevelItem>(`/levels/${editLevel!.id}/pricing`, {
				method: "PATCH",
				body: {
					price: num("price"),
					priceUnit: levelForm.priceUnit === undefined ? undefined : levelForm.priceUnit === "__none__" ? null : levelForm.priceUnit,
					fullPayPrice: num("fullPayPrice"),
					installment2x: num("installment2x"),
					monthlyAmount: num("monthlyAmount"),
					monthlyCount: num("monthlyCount"),
					promoPrice: num("promoPrice"),
					sessionDurationMin: num("sessionDurationMin"),
					registrationFee: num("registrationFee"),
					sessionPrices: sessionTouched
						? Object.keys(sessionPrices).length
							? sessionPrices
							: null
						: undefined,
				},
			});
		},
		onSuccess: () => {
			toast.success(`Harga jenjang ${editLevel?.name} disimpan.`);
			setEditLevel(null);
			qc.invalidateQueries({ queryKey: ["levels-pricing"] });
			qc.invalidateQueries({ queryKey: ["levels"] });
			qc.invalidateQueries({ queryKey: ["programs-catalog"] });
		},
		onError: (e) =>
			toast.error(e instanceof ApiError ? e.message : "Gagal menyimpan harga."),
	});

	const openLevelEditor = (l: LevelItem) => {
		setEditLevel(l);
		setLevelForm({
			price: l.price == null ? "" : String(l.price),
			priceUnit: l.priceUnit ?? "__none__",
			fullPayPrice: l.fullPayPrice == null ? "" : String(l.fullPayPrice),
			installment2x: l.installment2x == null ? "" : String(l.installment2x),
			monthlyAmount: l.monthlyAmount == null ? "" : String(l.monthlyAmount),
			monthlyCount: l.monthlyCount == null ? "" : String(l.monthlyCount),
			promoPrice: l.promoPrice == null ? "" : String(l.promoPrice),
			sessionPrice2: l.sessionPrices?.["2"] == null ? "" : String(l.sessionPrices["2"]),
			sessionPrice3: l.sessionPrices?.["3"] == null ? "" : String(l.sessionPrices["3"]),
			sessionPrice4: l.sessionPrices?.["4"] == null ? "" : String(l.sessionPrices["4"]),
			sessionPrice5: l.sessionPrices?.["5"] == null ? "" : String(l.sessionPrices["5"]),
			sessionDurationMin: l.sessionDurationMin == null ? "" : String(l.sessionDurationMin),
			registrationFee: l.registrationFee == null ? "" : String(l.registrationFee),
		});
	};

	function levelPriceSummary(l: LevelItem) {
		const parts: string[] = [
			l.price != null
				? `${rupiah(l.price)}/${LEVEL_UNIT_OPTIONS.find((u) => u.value === l.priceUnit)?.label.toLowerCase().replace("per ", "") ?? l.priceUnit ?? ""}`
				: "Belum diatur",
		];
		if (l.fullPayPrice) parts.push(`lunas ${rupiah(l.fullPayPrice)}`);
		if (l.installment2x) parts.push(`2x ${rupiah(l.installment2x)}`);
		if (l.monthlyAmount) parts.push(`${l.monthlyCount ?? ""}x ${rupiah(l.monthlyAmount)}`);
		if (l.promoPrice) parts.push(`promo ${rupiah(l.promoPrice)}`);
		if (l.sessionPrices) {
			parts.push(
				Object.entries(l.sessionPrices)
					.sort(([a], [b]) => Number(a) - Number(b))
					.map(([n, p]) => `${n}s ${rupiah(p)}`)
					.join(" · "),
			);
		}
		if (l.sessionDurationMin) parts.push(`${l.sessionDurationMin}mnt`);
		return parts;
	}

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h1 className="text-2xl font-semibold tracking-tight">Harga Program</h1>
					<p className="text-sm text-muted-foreground">
						{packagesQ.data ? `${packagesQ.data.length} paket` : "Memuat..."}
					</p>
				</div>
			</div>

			<Card className="border-brand-blue-200 bg-brand-blue-50/50">
				<CardContent className="flex items-start gap-3 py-3 text-sm">
					<Info className="mt-0.5 size-4 shrink-0 text-brand-blue-600" />
					<p className="text-muted-foreground">
						Harga jenjang menentukan invoice pendaftaran siswa baru — reguler
						punya 3 cara bayar (lunas di awal / 2x / bulanan), extra punya harga
						promo bila ikut reguler, privat per pertemuan menurut jumlah siswa.
						Harga paket menjadi nilai default saat invoice dibuat dari paket;
						harga bisa disesuaikan per-invoice tanpa mengubah harga umum.
					</p>
				</CardContent>
			</Card>

			<div className="relative w-full max-w-md">
				<Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					placeholder="Cari program / level / paket..."
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					className="pl-9"
				/>
			</div>

			{/* Harga per jenjang — sesuai price list brosur. */}
			{levelsQ.isLoading ? <SkeletonCards /> : null}
			{levelGroups.map((prog) => (
				<Card key={`lvl-${prog.program}`}>
					<CardHeader className="pb-2">
						<CardTitle className="text-base">
							{prog.program}{" "}
							{prog.category ? (
								<Badge variant="secondary" className="ml-1 align-middle text-[11px]">
									{prog.category === "REGULER" ? "Reguler" : prog.category === "EXTRA" ? "Extra" : "Privat"}
								</Badge>
							) : null}
						</CardTitle>
					</CardHeader>
					<CardContent className="grid gap-2">
						{prog.items.map((l) => (
							<div
								key={l.id}
								className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2.5"
							>
								<div className="min-w-0">
									<p className="truncate text-sm font-medium">
										{l.name}
										{l.gradeLevel ? (
											<span className="ml-1.5 text-xs font-normal text-muted-foreground">
												{l.gradeLevel.name}
											</span>
										) : null}
										{!l.isActive ? (
											<Badge variant="outline" className="ml-1.5">Nonaktif</Badge>
										) : null}
									</p>
									<div className="mt-1 flex flex-wrap gap-1.5">
										{levelPriceSummary(l).map((t) => (
											<Badge key={t} variant="outline" className="text-[11px] tabular-nums">
												{t}
											</Badge>
										))}
									</div>
								</div>
								<Button
									variant="outline"
									size="sm"
									className="gap-1.5"
									onClick={() => openLevelEditor(l)}
								>
									<Pencil className="size-3.5" />
									Atur Harga
								</Button>
							</div>
						))}
					</CardContent>
				</Card>
			))}

			{programsQ.isLoading || packagesQ.isLoading ? <SkeletonCards /> : null}
			{packagesQ.isError ? (
				<EmptyState
					icon={Package2}
					title="Gagal memuat paket"
					description="Coba muat ulang halaman atau cek permission akun Anda."
				/>
			) : null}
			{!packagesQ.isLoading && !packagesQ.isError && groups.length === 0 ? (
				<EmptyState
					icon={Tag}
					title={search ? "Paket tidak ditemukan" : "Belum ada paket"}
					description={
						search
							? "Coba ubah kata kunci pencarian."
							: "Paket dibuat oleh admin akademik di halaman Program."
					}
				/>
			) : null}

			{groups.map((prog) => (
				<Card key={prog.program}>
					<CardHeader className="pb-2">
						<CardTitle className="text-base">
							{prog.program}{" "}
							<span className="text-xs font-normal text-muted-foreground">
								{prog.code}
							</span>
						</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-col gap-4">
						{[...prog.levels.values()].map((lvl) => (
							<div key={lvl.level} className="flex flex-col gap-2">
								<p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
									{lvl.level}
								</p>
								<div className="grid gap-2">
									{lvl.items.map((p) => (
										<div
											key={p.id}
											className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2.5"
										>
											<div className="min-w-0">
												<p className="truncate text-sm font-medium">
													{p.name}
													{p.code ? (
														<span className="ml-1.5 text-xs font-normal text-muted-foreground">
															{p.code}
														</span>
													) : null}
												</p>
												<div className="mt-1 flex flex-wrap gap-1.5">
													<Badge variant="outline" className="tabular-nums">
														{p.totalSessions} sesi
													</Badge>
													{p.durationWeeks ? (
														<Badge variant="outline" className="tabular-nums">
															{p.durationWeeks} minggu
														</Badge>
													) : null}
													{!p.isActive ? (
														<Badge variant="outline">Nonaktif</Badge>
													) : null}
												</div>
											</div>
											<div className="flex items-center gap-2">
												<p
													className={`text-sm font-semibold tabular-nums ${
														p.price === null
															? "font-normal text-warning-700 italic"
															: ""
													}`}
												>
													{rupiah(p.price)}
												</p>
												<Button
													variant="outline"
													size="sm"
													className="gap-1.5"
													onClick={() => {
														setEditTarget(p);
														setPriceInput(
															p.price === null ? "" : String(p.price),
														);
													}}
												>
													<Pencil className="size-3.5" />
													Atur Harga
												</Button>
											</div>
										</div>
									))}
								</div>
							</div>
						))}
					</CardContent>
				</Card>
			))}

			<Dialog
				open={editTarget !== null}
				onOpenChange={(o) => {
					if (!o) setEditTarget(null);
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Atur Harga Paket</DialogTitle>
						<DialogDescription>
							{editTarget
								? `${editTarget.name} — ${editTarget.level?.program?.name ?? ""} ${editTarget.level?.name ?? ""} · ${editTarget.totalSessions} sesi`
								: ""}
						</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="pkg-price">Harga (Rp)</Label>
						<Input
							id="pkg-price"
							type="number"
							min={0}
							placeholder="cth: 1500000 — kosongkan untuk hapus harga"
							value={priceInput}
							onChange={(e) => setPriceInput(e.target.value)}
						/>
						<p className="text-xs text-muted-foreground">
							Paket tanpa harga tidak bisa dibuatkan invoice otomatis. Perubahan
							harga tidak mengubah invoice yang sudah terbit (harga di-snapshot
							per invoice).
						</p>
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setEditTarget(null)}
						>
							Batal
						</Button>
						<Button
							disabled={setPriceM.isPending}
							onClick={() => setPriceM.mutate()}
						>
							Simpan Harga
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog
				open={editLevel !== null}
				onOpenChange={(o) => {
					if (!o) setEditLevel(null);
				}}
			>
				<DialogContent className="max-h-[90vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle>Atur Harga Jenjang</DialogTitle>
						<DialogDescription>
							{editLevel
								? `${editLevel.name} — ${editLevel.program?.name ?? ""}`
								: ""}
						</DialogDescription>
					</DialogHeader>
					{editLevel ? (
						<div className="flex flex-col gap-3">
							<div className="grid grid-cols-2 gap-2">
								<div className="flex flex-col gap-1.5">
									<Label htmlFor="lv-price">
										Harga utama (Rp) — {editLevel.program?.name?.toLowerCase().includes("reguler") ? "per tahun" : "per " + (levelForm.priceUnit === "SESSION" ? "pertemuan" : levelForm.priceUnit === "PACKAGE" ? "paket" : "bulan")}
									</Label>
									<Input
										id="lv-price"
										type="number"
										min={0}
										value={levelForm.price ?? ""}
										onChange={(e) => setLevelForm((p) => ({ ...p, price: e.target.value }))}
									/>
								</div>
								<div className="flex flex-col gap-1.5">
									<Label htmlFor="lv-unit">Satuan Harga</Label>
									<select
										id="lv-unit"
										value={levelForm.priceUnit ?? "__none__"}
										onChange={(e) => setLevelForm((p) => ({ ...p, priceUnit: e.target.value }))}
										className={NUM_CLS}
									>
										<option value="__none__">— Tanpa satuan —</option>
										{LEVEL_UNIT_OPTIONS.map((o) => (
											<option key={o.value} value={o.value}>{o.label}</option>
										))}
									</select>
								</div>
							</div>
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="lv-regfee">Biaya pendaftaran (Rp) — kosong = ikut program</Label>
								<Input
									id="lv-regfee"
									type="number"
									min={0}
									value={levelForm.registrationFee ?? ""}
									onChange={(e) => setLevelForm((p) => ({ ...p, registrationFee: e.target.value }))}
								/>
							</div>

							{(levelForm.priceUnit ?? editLevel.priceUnit) === "YEAR" ? (
								<div className="flex flex-col gap-2 rounded-md border border-dashed p-3">
									<p className="text-xs font-medium text-muted-foreground">Cara bayar reguler (brosur)</p>
									<div className="grid grid-cols-2 gap-2">
										{[
											["fullPayPrice", "Lunas di awal (Rp)"],
											["installment2x", "Angsuran 2x /angsuran (Rp)"],
											["monthlyAmount", "Angsuran bulanan (Rp)"],
											["monthlyCount", "Jumlah bulan"],
										].map(([name, label]) => (
											<div key={name} className="flex flex-col gap-1.5">
												<Label htmlFor={`lv-${name}`} className="text-xs">{label}</Label>
												<Input
													id={`lv-${name}`}
													type="number"
													min={0}
													value={levelForm[name] ?? ""}
													onChange={(e) => setLevelForm((p) => ({ ...p, [name]: e.target.value }))}
												/>
											</div>
										))}
									</div>
								</div>
							) : null}
							{(levelForm.priceUnit ?? editLevel.priceUnit) === "MONTH" ? (
								<div className="flex flex-col gap-1.5 rounded-md border border-dashed p-3">
									<Label htmlFor="lv-promo" className="text-xs font-medium">Harga promo /bulan (bila anak ikut kelas reguler)</Label>
									<Input
										id="lv-promo"
										type="number"
										min={0}
										value={levelForm.promoPrice ?? ""}
										onChange={(e) => setLevelForm((p) => ({ ...p, promoPrice: e.target.value }))}
									/>
								</div>
							) : null}
							{(levelForm.priceUnit ?? editLevel.priceUnit) === "SESSION" ? (
								<div className="flex flex-col gap-2 rounded-md border border-dashed p-3">
									<p className="text-xs font-medium text-muted-foreground">Privat — harga/pertemuan per jumlah siswa</p>
									<div className="grid grid-cols-2 gap-2">
										{[2, 3, 4, 5].map((n) => (
											<div key={n} className="flex flex-col gap-1.5">
												<Label htmlFor={`lv-sp${n}`} className="text-xs">{n} siswa (Rp)</Label>
												<Input
													id={`lv-sp${n}`}
													type="number"
													min={0}
													value={levelForm[`sessionPrice${n}`] ?? ""}
													onChange={(e) => setLevelForm((p) => ({ ...p, [`sessionPrice${n}`]: e.target.value }))}
												/>
											</div>
										))}
										<div className="flex flex-col gap-1.5">
											<Label htmlFor="lv-dur" className="text-xs">Durasi (menit)</Label>
											<Input
												id="lv-dur"
												type="number"
												min={15}
												value={levelForm.sessionDurationMin ?? ""}
												onChange={(e) => setLevelForm((p) => ({ ...p, sessionDurationMin: e.target.value }))}
											/>
										</div>
									</div>
								</div>
							) : null}
							<p className="text-xs text-muted-foreground">
								Perubahan tidak mengubah invoice yang sudah terbit — hanya pendaftaran baru.
							</p>
						</div>
					) : null}
					<DialogFooter>
						<Button variant="outline" onClick={() => setEditLevel(null)}>Batal</Button>
						<Button
							disabled={setLevelPricingM.isPending}
							onClick={() => setLevelPricingM.mutate()}
						>
							Simpan Harga
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
