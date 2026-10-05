"use client";
// Fase 6 — Halaman Audit (Owner): tabel audit_logs dengan filter
// actor / action / entity / rentang tanggal + expand old/new data.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api-client";
import type {
	AuditLogListResponse,
	AuditLogMeta,
	AuditLogRow,
} from "@/lib/phase6-types";

function fmtTs(iso: string) {
	return new Date(iso).toLocaleString("id-ID");
}

function JsonPreview({ data }: { data: unknown }) {
	if (data === null || data === undefined)
		return <span className="text-muted-foreground">-</span>;
	return (
		<pre className="max-h-48 overflow-auto rounded bg-muted p-2 text-[11px] whitespace-pre-wrap break-all">
			{JSON.stringify(data, null, 2)}
		</pre>
	);
}

export function AuditLogsViewer() {
	const [actorId, setActorId] = useState("");
	const [action, setAction] = useState("");
	const [entity, setEntity] = useState("");
	const [from, setFrom] = useState("");
	const [to, setTo] = useState("");
	const [page, setPage] = useState(1);
	const [expandedId, setExpandedId] = useState<string | null>(null);

	const params = new URLSearchParams();
	if (actorId) params.set("actorId", actorId);
	if (action) params.set("action", action);
	if (entity) params.set("entity", entity);
	if (from) params.set("from", from);
	if (to) params.set("to", to);
	params.set("page", String(page));

	const metaQ = useQuery({
		queryKey: ["audit-logs-meta"],
		queryFn: () => apiFetch<AuditLogMeta>("/audit-logs/meta"),
	});

	const listQ = useQuery({
		queryKey: ["audit-logs", actorId, action, entity, from, to, page],
		queryFn: () =>
			apiFetch<AuditLogListResponse>(`/audit-logs?${params.toString()}`),
	});

	const totalPages = listQ.data
		? Math.max(1, Math.ceil(listQ.data.total / listQ.data.pageSize))
		: 1;

	const selectCls =
		"h-9 rounded-md border border-input bg-background px-2 text-sm max-w-44";

	return (
		<div className="flex flex-col gap-4">
			<div>
				<h1 className="text-2xl font-semibold tracking-tight">Audit Log</h1>
				<p className="text-sm text-muted-foreground">
					Jejak semua aksi kritis: verifikasi pembayaran, refund, perubahan
					jadwal, koreksi absensi, publish/lock ujian, perubahan role, dst.
				</p>
			</div>

			<Card>
				<CardContent className="flex flex-wrap items-end gap-2 py-4">
					<label className="flex flex-col gap-1 text-xs">
						Actor
						<select
							className={selectCls}
							value={actorId}
							onChange={(e) => {
								setActorId(e.target.value);
								setPage(1);
							}}
						>
							<option value="">Semua</option>
							{metaQ.data?.actors.map((a) => (
								<option key={a.id} value={a.id}>
									{a.name}
								</option>
							))}
						</select>
					</label>
					<label className="flex flex-col gap-1 text-xs">
						Action
						<select
							className={selectCls}
							value={action}
							onChange={(e) => {
								setAction(e.target.value);
								setPage(1);
							}}
						>
							<option value="">Semua</option>
							{metaQ.data?.actions.map((a) => (
								<option key={a} value={a}>
									{a}
								</option>
							))}
						</select>
					</label>
					<label className="flex flex-col gap-1 text-xs">
						Entity
						<select
							className={selectCls}
							value={entity}
							onChange={(e) => {
								setEntity(e.target.value);
								setPage(1);
							}}
						>
							<option value="">Semua</option>
							{metaQ.data?.entities.map((en) => (
								<option key={en} value={en}>
									{en}
								</option>
							))}
						</select>
					</label>
					<label className="flex flex-col gap-1 text-xs">
						Dari
						<input
							type="date"
							className={selectCls}
							value={from}
							onChange={(e) => {
								setFrom(e.target.value);
								setPage(1);
							}}
						/>
					</label>
					<label className="flex flex-col gap-1 text-xs">
						Sampai
						<input
							type="date"
							className={selectCls}
							value={to}
							onChange={(e) => {
								setTo(e.target.value);
								setPage(1);
							}}
						/>
					</label>
					<Button
						variant="outline"
						size="sm"
						onClick={() => {
							setActorId("");
							setAction("");
							setEntity("");
							setFrom("");
							setTo("");
							setPage(1);
						}}
					>
						Reset
					</Button>
				</CardContent>
			</Card>

			{listQ.isLoading ? <Skeleton className="h-40 w-full" /> : null}
			{listQ.isError ? (
				<p className="text-sm text-destructive">Gagal memuat audit log.</p>
			) : null}

			{listQ.data ? (
				<Card>
					<CardHeader>
						<CardTitle className="text-sm font-medium">
							{listQ.data.total} entri ditemukan
						</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-col gap-2">
						{listQ.data.data.length === 0 ? (
							<p className="text-sm text-muted-foreground">
								Belum ada audit log untuk filter ini.
							</p>
						) : (
							listQ.data.data.map((row: AuditLogRow) => (
								<div key={row.id} className="rounded-md border p-3 text-sm">
									<div className="flex flex-wrap items-center gap-2">
										<Badge variant="secondary">{row.action}</Badge>
										<span className="font-medium">
											{row.entity}
											<span className="text-muted-foreground">
												{" "}
												#{row.entityId.slice(0, 8)}
											</span>
										</span>
										<span className="ml-auto text-xs text-muted-foreground">
											{fmtTs(row.createdAt)}
										</span>
									</div>
									<p className="mt-1 text-xs text-muted-foreground">
										Oleh: {row.actor?.name ?? "SYSTEM"}
										{row.ipAddress ? ` · IP ${row.ipAddress}` : ""}
									</p>
									<Button
										variant="ghost"
										size="sm"
										className="mt-1 h-7 px-2 text-xs"
										onClick={() =>
											setExpandedId(expandedId === row.id ? null : row.id)
										}
									>
										{expandedId === row.id
											? "Sembunyikan detail"
											: "Lihat detail"}
									</Button>
									{expandedId === row.id ? (
										<div className="mt-2 grid gap-2 sm:grid-cols-2">
											<div>
												<p className="mb-1 text-xs font-medium">Sebelum</p>
												<JsonPreview data={row.oldData} />
											</div>
											<div>
												<p className="mb-1 text-xs font-medium">Sesudah</p>
												<JsonPreview data={row.newData} />
											</div>
										</div>
									) : null}
								</div>
							))
						)}
						{totalPages > 1 ? (
							<div className="flex items-center gap-2 pt-2">
								<Button
									variant="outline"
									size="sm"
									disabled={page <= 1}
									onClick={() => setPage(page - 1)}
								>
									Sebelumnya
								</Button>
								<span className="text-xs text-muted-foreground">
									Halaman {page} / {totalPages}
								</span>
								<Button
									variant="outline"
									size="sm"
									disabled={page >= totalPages}
									onClick={() => setPage(page + 1)}
								>
									Berikutnya
								</Button>
							</div>
						) : null}
					</CardContent>
				</Card>
			) : null}
		</div>
	);
}
