"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ListPager } from "@/components/shared/list-pager";
import { useDebouncedValue } from "@/lib/use-debounced-value";

interface OutboxStats {
	provider: string;
	PENDING: number;
	SENT: number;
	FAILED: number;
}

interface OutboxRow {
	id: string;
	recipientPhone: string;
	recipientName: string | null;
	eventType: string;
	message: string;
	status: "PENDING" | "SENT" | "FAILED";
	attempts: number;
	error: string | null;
	sentAt: string | null;
	createdAt: string;
}

interface ProcessResult {
	provider: string;
	found: number;
	sent: number;
	failed: number;
	retryLater: number;
}

function err(e: unknown, fb: string) {
	return e instanceof ApiError ? e.message : fb;
}

const STATUS_FILTERS = [
	{ value: "", label: "Semua" },
	{ value: "PENDING", label: "Pending" },
	{ value: "SENT", label: "Terkirim" },
	{ value: "FAILED", label: "Gagal" },
] as const;

/** Tipe antrean WA yang dikenal sistem — label ramah untuk dropdown filter. */
const EVENT_TYPE_FILTERS = [
	{ value: "", label: "Semua tipe" },
	{ value: "INVOICE_ISSUED", label: "Invoice terbit" },
	{ value: "PAYMENT_REMINDER", label: "Reminder tagihan" },
	{ value: "PAYMENT_PROOF_SUBMITTED", label: "Bukti bayar masuk" },
	{ value: "PAYMENT_VERIFIED", label: "Kwitansi / pembayaran disetujui" },
	{ value: "PAYMENT_REJECTED", label: "Pembayaran ditolak" },
	{ value: "PAYROLL_PAID", label: "Payroll tutor" },
	{ value: "GROUP_REMINDER", label: "Reminder kelompok (ortu/siswa)" },
	{ value: "TUTOR_WEEKLY_SCHEDULE", label: "Jadwal mingguan tutor" },
	{ value: "TUTOR_ABSENCE", label: "Ketidakhadiran tutor" },
	{ value: "TEST", label: "Pesan uji" },
] as const;

function eventLabel(code: string) {
	const found = EVENT_TYPE_FILTERS.find((f) => f.value !== "" && code.startsWith(f.value));
	return found ? `${found.label} (${code})` : code;
}

function statusBadge(status: OutboxRow["status"]) {
	if (status === "SENT") return <Badge>Terkirim</Badge>;
	if (status === "FAILED") return <Badge variant="destructive">Gagal</Badge>;
	return <Badge variant="outline">Pending</Badge>;
}

/**
 * Monitor antrean WhatsApp outbox (Fase 5b). Dipakai Admin Finance
 * (halaman Pengaturan) dan Owner (halaman Audit).
 * Mode `compact` (pengaturan): statistik + 5 entri terbaru + tautan ke
 * halaman detail; mode penuh (halaman detail): search/filter/sort/pager.
 */
export function WhatsAppOutboxManager({
	canManage = true,
	compact = false,
	detailHref,
}: {
	canManage?: boolean;
	compact?: boolean;
	/** Tautan "Lihat semua" di mode compact. */
	detailHref?: string;
}) {
	const qc = useQueryClient();
	const [status, setStatus] = useState<string>("");
	const [eventType, setEventType] = useState<string>("");
	const [search, setSearch] = useState("");
	const debouncedSearch = useDebouncedValue(search, 400);
	const [sortDesc, setSortDesc] = useState(true);
	const [page, setPage] = useState(0);
	const [pageSize, setPageSize] = useState(10);

	const statsQ = useQuery({
		queryKey: ["wa-outbox-stats"],
		queryFn: () => apiFetch<OutboxStats>("/whatsapp-outbox/stats"),
	});
	const listQ = useQuery({
		queryKey: ["wa-outbox", status, eventType, debouncedSearch, compact],
		queryFn: () => {
			const p = new URLSearchParams();
			if (status) p.set("status", status);
			if (eventType) p.set("eventType", eventType);
			if (debouncedSearch) p.set("search", debouncedSearch);
			p.set("take", compact ? "5" : "500");
			return apiFetch<OutboxRow[]>(`/whatsapp-outbox?${p.toString()}`);
		},
	});

	// Urutan & halaman dihitung client-side (daftar ≤500 baris).
	const rows = useMemo(() => {
		const r = [...(listQ.data ?? [])];
		if (!sortDesc) r.reverse();
		return r;
	}, [listQ.data, sortDesc]);
	const pageCount = Math.ceil(rows.length / pageSize);
	const pagedRows = compact ? rows.slice(0, 5) : rows.slice(page * pageSize, (page + 1) * pageSize);

	const invalidate = () => {
		qc.invalidateQueries({ queryKey: ["wa-outbox"] });
		qc.invalidateQueries({ queryKey: ["wa-outbox-stats"] });
	};

	const processM = useMutation({
		mutationFn: () =>
			apiFetch<ProcessResult>("/whatsapp-outbox/process", { method: "POST" }),
		onSuccess: (r) => {
			toast.success(
				`Antrean diproses (${r.provider}): ${r.sent} terkirim, ${r.retryLater} coba lagi, ${r.failed} gagal.`,
			);
			invalidate();
		},
		onError: (e) => toast.error(err(e, "Gagal memproses antrean.")),
	});

	const retryM = useMutation({
		mutationFn: (id: string) =>
			apiFetch(`/whatsapp-outbox/${id}/retry`, { method: "POST" }),
		onSuccess: () => {
			toast.success("Pesan dikembalikan ke antrean.");
			invalidate();
		},
		onError: (e) => toast.error(err(e, "Gagal retry pesan.")),
	});

	return (
		<Card>
			<CardHeader>
				<div className="flex flex-wrap items-center justify-between gap-2">
					<div>
						<CardTitle>Antrean WhatsApp</CardTitle>
						<CardDescription>
							Provider aktif: {statsQ.data?.provider ?? "…"} — pesan keluar
							lewat outbox dulu (PENDING → SENT/FAILED).
						</CardDescription>
					</div>
					{canManage ? (
						<Button
							size="sm"
							variant="outline"
							disabled={processM.isPending}
							onClick={() => processM.mutate()}
						>
							{processM.isPending ? "Memproses..." : "Proses Antrean"}
						</Button>
					) : null}
				</div>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<div className="grid grid-cols-3 gap-2">
					<div className="rounded-lg border p-3 text-center">
						<p className="text-2xl font-bold">{statsQ.data?.PENDING ?? "-"}</p>
						<p className="text-xs text-muted-foreground">Pending</p>
					</div>
					<div className="rounded-lg border p-3 text-center">
						<p className="text-2xl font-bold">{statsQ.data?.SENT ?? "-"}</p>
						<p className="text-xs text-muted-foreground">Terkirim</p>
					</div>
					<div className="rounded-lg border p-3 text-center">
						<p className="text-2xl font-bold">{statsQ.data?.FAILED ?? "-"}</p>
						<p className="text-xs text-muted-foreground">Gagal</p>
					</div>
				</div>

				{!compact ? (
					<div className="flex flex-wrap items-center gap-2">
						<div className="relative w-full sm:w-64">
							<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								placeholder="Cari nama / nomor / event..."
								value={search}
								onChange={(e) => {
									setSearch(e.target.value);
									setPage(0);
								}}
								className="pl-9"
							/>
						</div>
						{STATUS_FILTERS.map((f) => (
							<Button
								key={f.value}
								size="sm"
								variant={status === f.value ? "default" : "outline"}
								onClick={() => {
									setStatus(f.value);
									setPage(0);
								}}
							>
								{f.label}
							</Button>
						))}
						<select
							className="h-9 rounded-md border border-input bg-background px-2 text-sm"
							value={eventType}
							onChange={(e) => {
								setEventType(e.target.value);
								setPage(0);
							}}
							aria-label="Filter tipe antrean"
						>
							{EVENT_TYPE_FILTERS.map((f) => (
								<option key={f.value} value={f.value}>{f.label}</option>
							))}
						</select>
						<Button
							size="sm"
							variant="outline"
							onClick={() => setSortDesc((v) => !v)}
						>
							{sortDesc ? "Terbaru dulu" : "Terlama dulu"}
						</Button>
					</div>
				) : null}

				{listQ.isLoading ? <Skeleton className="h-24 w-full" /> : null}
				{listQ.isError ? (
					<p className="text-sm text-destructive">
						{err(listQ.error, "Gagal memuat antrean.")}
					</p>
				) : null}
				{listQ.data?.length === 0 ? (
					<p className="py-6 text-center text-sm text-muted-foreground">
						Tidak ada pesan pada status ini.
					</p>
				) : null}

				{compact ? (
					<p className="text-xs font-medium text-muted-foreground">
						5 entri terbaru — buka halaman antrean untuk daftar lengkap.
					</p>
				) : null}
				<div className="flex flex-col gap-2">
					{pagedRows.map((row) => (
						<div key={row.id} className="rounded-lg border p-3">
							<div className="flex flex-wrap items-center justify-between gap-2">
								<div className="min-w-0">
									<p className="truncate text-sm font-medium">
										{row.recipientName || row.recipientPhone}
									</p>
									<p className="text-xs text-muted-foreground">
										{row.recipientPhone} · {eventLabel(row.eventType)} ·{" "}
										{new Date(row.createdAt).toLocaleString("id-ID")}
									</p>
								</div>
								<div className="flex items-center gap-2">
									{statusBadge(row.status)}
									{canManage && row.status === "FAILED" ? (
										<Button
											size="sm"
											variant="outline"
											disabled={retryM.isPending}
											onClick={() => retryM.mutate(row.id)}
										>
											Retry
										</Button>
									) : null}
								</div>
							</div>
							<p className="mt-2 whitespace-pre-line text-xs text-muted-foreground">
								{row.message}
							</p>
							{row.error ? (
								<p className="mt-1 text-xs text-destructive">
									Error ({row.attempts}x): {row.error}
								</p>
							) : null}
							{row.sentAt ? (
								<p className="mt-1 text-xs text-muted-foreground">
									Terkirim {new Date(row.sentAt).toLocaleString("id-ID")}
								</p>
							) : null}
						</div>
					))}
				</div>

				{compact && detailHref ? (
					<Link href={detailHref} className="self-end">
						<Button variant="outline" size="sm">
							Lihat Semua Antrean
						</Button>
					</Link>
				) : null}
				{!compact ? (
					<ListPager
						page={page}
						pageCount={pageCount}
						total={rows.length}
						shown={pageSize}
						onPageChange={setPage}
						pageSize={pageSize}
						onPageSizeChange={(s) => { setPageSize(s); setPage(0); }}
					/>
				) : null}
			</CardContent>
		</Card>
	);
}
