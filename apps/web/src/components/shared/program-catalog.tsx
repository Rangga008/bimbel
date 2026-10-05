"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, ChevronLeft, ChevronRight, Sparkles, UserRound } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api-client";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

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

const CATEGORY_META: Record<string, { label: string; desc: string; icon: typeof BookOpen }> = {
	REGULER: { label: "Kelas Reguler", desc: "Kelas berkelompok per jenjang — berisi beberapa mata pelajaran.", icon: BookOpen },
	EXTRA: { label: "Kelas Extra", desc: "Kelas tambahan di luar kelas reguler.", icon: Sparkles },
	PRIVAT: { label: "Kelas Privat", desc: "Bimbingan personal dengan tutor — harga per pertemuan.", icon: UserRound },
};

const CATEGORY_ORDER = ["REGULER", "EXTRA", "PRIVAT"];

const UNIT_LABEL: Record<string, string> = {
	YEAR: "tahun",
	MONTH: "bulan",
	SESSION: "pertemuan",
	PACKAGE: "paket",
};

/** Ringkasan cara bayar sesuai brosur per jenjang. */
function paymentOptions(level: CatalogLevel): string[] {
	const out: string[] = [];
	if (level.fullPayPrice) out.push(`Lunas di awal ${formatPrice(level.fullPayPrice)}`);
	if (level.installment2x) out.push(`2x angsuran ${formatPrice(level.installment2x)}`);
	if (level.monthlyAmount) {
		out.push(`${level.monthlyCount ?? 10}x ${formatPrice(level.monthlyAmount)}/bulan`);
	}
	if (level.promoPrice) out.push(`Promo ${formatPrice(level.promoPrice)} (ikut reguler)`);
	if (level.sessionPrices) {
		for (const [n, p] of Object.entries(level.sessionPrices).sort(
			([a], [b]) => Number(a) - Number(b),
		)) {
			out.push(`${n} siswa ${formatPrice(p)}`);
		}
	}
	if (level.sessionDurationMin) out.push(`${level.sessionDurationMin} menit`);
	return out;
}

function formatPrice(price: CatalogLevel["price"]) {
	if (price === null || price === undefined) return "-";
	const n = Number(price);
	if (Number.isNaN(n)) return "-";
	return `Rp ${n.toLocaleString("id-ID")}`;
}

/** Halaman "Program" (Orang Tua): pilih kategori dulu, baru lihat programnya. */
export function ProgramCatalog() {
	const [category, setCategory] = useState<string | null>(null);
	const catalogQ = useQuery({
		queryKey: ["programs-catalog"],
		queryFn: () => apiFetch<CatalogProgram[]>("/programs/catalog"),
	});

	if (catalogQ.isLoading) {
		return <Skeleton className="h-40 w-full" />;
	}

	if (catalogQ.isError) {
		return (
			<Card>
				<CardContent className="py-10 text-center text-sm text-destructive">
					{catalogQ.error instanceof ApiError
						? catalogQ.error.message
						: "Gagal memuat katalog program."}
				</CardContent>
			</Card>
		);
	}

	const programs = catalogQ.data ?? [];
	const grouped = CATEGORY_ORDER.map((cat) => ({
		cat,
		meta: CATEGORY_META[cat],
		items: programs.filter((p) => (p.category ?? "REGULER") === cat),
	}));
	const activeGroup = category ? grouped.find((g) => g.cat === category) : null;

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h1 className="text-2xl font-semibold tracking-tight">Program</h1>
					<p className="text-sm text-muted-foreground">
						{category
							? "Pilih program di kategori ini, lalu lanjut daftarkan anak."
							: "Pilih kategori program dulu — reguler, extra, atau privat."}
					</p>
				</div>
				<Link href="/orang-tua/pendaftaran">
					<Button>Daftarkan Anak</Button>
				</Link>
			</div>

			{programs.length === 0 ? (
				<Card>
					<CardContent className="py-10 text-center text-sm text-muted-foreground">
						Belum ada program aktif.
					</CardContent>
				</Card>
			) : null}

			{/* Langkah 1 — kartu kategori */}
			{!category ? (
				<div className="grid gap-3 sm:grid-cols-3">
					{grouped.map((group) => {
						const Icon = group.meta.icon;
						return (
							<button
								key={group.cat}
								type="button"
								disabled={group.items.length === 0}
								onClick={() => setCategory(group.cat)}
								className="rounded-xl border bg-card p-5 text-left transition-colors hover:border-primary/60 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
							>
								<Icon className="mb-2 size-6 text-primary" />
								<p className="font-semibold">{group.meta.label}</p>
								<p className="mt-1 text-sm text-muted-foreground">{group.meta.desc}</p>
								<p className="mt-3 flex items-center gap-1 text-xs font-medium text-primary">
									{group.items.length > 0
										? `${group.items.length} program`
										: "Belum tersedia"}
									{group.items.length > 0 ? <ChevronRight className="size-3" /> : null}
								</p>
							</button>
						);
					})}
				</div>
			) : null}

			{/* Langkah 2 — program dalam kategori terpilih */}
			{category && activeGroup ? (
				<div className="flex flex-col gap-3">
					<Button variant="ghost" size="sm" className="w-fit" onClick={() => setCategory(null)}>
						<ChevronLeft className="size-4" /> Semua kategori
					</Button>
					<div>
						<h2 className="text-lg font-semibold">{activeGroup.meta.label}</h2>
						<p className="text-sm text-muted-foreground">{activeGroup.meta.desc}</p>
					</div>
					{activeGroup.items.map((program) => (
						<Card key={program.id}>
							<CardHeader>
								<CardTitle className="flex flex-wrap items-center gap-2">
									{program.name}
									<Badge variant="outline">{program.code}</Badge>
									{program.registrationFee ? (
										<Badge variant="secondary">
											Pendaftaran {formatPrice(program.registrationFee)}
										</Badge>
									) : null}
								</CardTitle>
								{program.description ? (
									<CardDescription>{program.description}</CardDescription>
								) : null}
							</CardHeader>
							<CardContent className="flex flex-col gap-4">
								{program.levels.map((level) => (
									<div key={level.id} className="flex flex-col gap-2 rounded-lg border p-3">
										<div className="flex flex-wrap items-center justify-between gap-2">
											<p className="text-sm font-medium">
												{level.gradeLevel ? `${level.gradeLevel.name} — ` : ""}
												{level.name}
											</p>
											<p className="text-sm font-semibold text-primary">
												{level.price !== null && level.price !== undefined
													? `${formatPrice(level.price)}/${UNIT_LABEL[level.priceUnit ?? "MONTH"] ?? "bulan"}`
													: "Harga segera"}
											</p>
										</div>
										{paymentOptions(level).length > 0 ? (
											<div className="flex flex-wrap gap-1">
												{paymentOptions(level).map((opt) => (
													<Badge key={opt} variant="secondary" className="text-[11px]">
														{opt}
													</Badge>
												))}
											</div>
										) : null}
										{(level.levelSubjects ?? []).length > 0 ? (
											<div className="flex flex-wrap gap-1">
												{level.levelSubjects.map((ls) => (
													<Badge key={ls.subject.id} variant="outline" className="text-[11px]">
														{ls.subject.name}
													</Badge>
												))}
											</div>
										) : null}
									</div>
								))}
								{program.levels.length === 0 ? (
									<p className="text-xs text-muted-foreground">Belum ada jenjang aktif.</p>
								) : null}
							</CardContent>
						</Card>
					))}
					{activeGroup.items.length === 0 ? (
						<Card>
							<CardContent className="py-10 text-center text-sm text-muted-foreground">
								Belum ada program aktif di kategori ini.
							</CardContent>
						</Card>
					) : null}
				</div>
			) : null}
		</div>
	);
}
