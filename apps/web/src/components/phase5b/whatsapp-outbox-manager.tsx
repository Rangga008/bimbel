"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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

function statusBadge(status: OutboxRow["status"]) {
	if (status === "SENT") return <Badge>Terkirim</Badge>;
	if (status === "FAILED") return <Badge variant="destructive">Gagal</Badge>;
	return <Badge variant="outline">Pending</Badge>;
}

/**
 * Monitor antrean WhatsApp outbox (Fase 5b). Dipakai Admin Finance
 * (halaman Pengaturan) dan Owner (halaman Audit).
 */
export function WhatsAppOutboxManager({ canManage = true }: { canManage?: boolean }) {
	const qc = useQueryClient();
	const [status, setStatus] = useState<string>("");

	const statsQ = useQuery({
		queryKey: ["wa-outbox-stats"],
		queryFn: () => apiFetch<OutboxStats>("/whatsapp-outbox/stats"),
	});
	const listQ = useQuery({
		queryKey: ["wa-outbox", status],
		queryFn: () =>
			apiFetch<OutboxRow[]>(
				`/whatsapp-outbox${status ? `?status=${status}` : ""}`,
			),
	});

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

				<div className="flex flex-wrap gap-2">
					{STATUS_FILTERS.map((f) => (
						<Button
							key={f.value}
							size="sm"
							variant={status === f.value ? "default" : "outline"}
							onClick={() => setStatus(f.value)}
						>
							{f.label}
						</Button>
					))}
				</div>

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

				<div className="flex flex-col gap-2">
					{listQ.data?.map((row) => (
						<div key={row.id} className="rounded-lg border p-3">
							<div className="flex flex-wrap items-center justify-between gap-2">
								<div className="min-w-0">
									<p className="truncate text-sm font-medium">
										{row.recipientName || row.recipientPhone}
									</p>
									<p className="text-xs text-muted-foreground">
										{row.recipientPhone} · {row.eventType} ·{" "}
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
			</CardContent>
		</Card>
	);
}
