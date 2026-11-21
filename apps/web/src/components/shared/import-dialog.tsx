"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
	CircleCheck,
	CircleAlert,
	Download,
	FileUp,
	LoaderCircle,
	Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch, apiFetchBlob, ApiError } from "@/lib/api-client";

export type ImportEntity = "students" | "parents" | "tutors";

interface ImportResult {
	entity: ImportEntity;
	total: number;
	created: number;
	failed: number;
	/** Baris dilewati karena redundansi (duplikat di file / sudah dipakai). */
	skipped: number;
	errors: Array<{ row: number; email: string; message: string }>;
	warnings: Array<{ row: number; email: string; message: string }>;
	credentials: Array<{ email: string; name: string; tempPassword?: string }>;
}

interface PreviewRow {
	row: number;
	name: string;
	email: string;
	phone: string;
	/** Pesan redundansi — baris ini akan di-skip server. */
	dup?: string;
}

/** Parse CSV sisi client untuk pratinjau — replika ringan parser server
 *  (delimiter auto, kutip ganda, komentar # / sep= di-skip). */
function parsePreview(text: string): PreviewRow[] {
	const clean = text.replace(/^﻿/, "");
	const lines = clean.split(/\r?\n/);
	const meaningful = lines.find(
		(l) => l.trim() && !l.trim().startsWith("#") && !/^sep=/i.test(l.trim()),
	);
	if (!meaningful) return [];
	const delim = (meaningful.match(/;/g) ?? []).length > (meaningful.match(/,/g) ?? []).length ? ";" : ",";
	const splitRow = (line: string): string[] => {
		const cells: string[] = [];
		let cur = "";
		let inQ = false;
		for (let i = 0; i < line.length; i++) {
			const ch = line[i];
			if (inQ) {
				if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
				else if (ch === '"') inQ = false;
				else cur += ch;
			} else if (ch === '"') inQ = true;
			else if (ch === delim) { cells.push(cur); cur = ""; }
			else cur += ch;
		}
		cells.push(cur);
		return cells;
	};
	const dataLines = lines.filter(
		(l) => l.trim() && !l.trim().startsWith("#") && !/^sep=/i.test(l.trim()),
	);
	const headers = splitRow(dataLines[0]).map((h) => h.trim().toLowerCase());
	const idx = (k: string) => headers.indexOf(k);
	const seenEmail = new Map<string, number>();
	const seenPhone = new Map<string, number>();
	const out: PreviewRow[] = [];
	dataLines.slice(1).forEach((line, i) => {
		const c = splitRow(line);
		const email = (c[idx("email")] ?? "").trim();
		const name = (c[idx("name")] ?? "").trim();
		const phone = (c[idx("phone")] ?? "").trim();
		let dup: string | undefined;
		const eKey = email.toLowerCase();
		if (eKey) {
			if (seenEmail.has(eKey)) dup = `Email duplikat di file`;
			else seenEmail.set(eKey, i);
		}
		const pKey = phone.replace(/\D/g, "");
		if (pKey) {
			if (seenPhone.has(pKey)) dup = `No HP duplikat di file`;
			else seenPhone.set(pKey, i);
		}
		out.push({ row: i + 2, name, email, phone, dup });
	});
	return out;
}

const ENTITY_LABEL: Record<ImportEntity, string> = {
	students: "Siswa",
	parents: "Orang Tua",
	tutors: "Tutor",
};

function err(e: unknown, fb: string) {
	return e instanceof ApiError ? e.message : fb;
}

/**
 * Dialog import CSV massal: unduh template -> isi di Excel/Sheets -> upload.
 * Hasil menampilkan ringkasan sukses/gagal + daftar password sementara.
 */
export function ImportDialog({
	entity,
	open,
	onOpenChange,
	invalidateKeys,
}: {
	entity: ImportEntity;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	invalidateKeys: string[];
}) {
	const qc = useQueryClient();
	const fileRef = useRef<HTMLInputElement>(null);
	const [fileName, setFileName] = useState("");
	const [csv, setCsv] = useState("");
	const [xlsx, setXlsx] = useState("");
	const [preview, setPreview] = useState<PreviewRow[] | null>(null);
	const [result, setResult] = useState<ImportResult | null>(null);

	const importM = useMutation({
		mutationFn: () =>
			apiFetch<ImportResult>(`/import/${entity}`, {
				method: "POST",
				body: xlsx ? { xlsx } : { csv },
			}),
		onSuccess: (data) => {
			setResult(data);
			if (data.created > 0) {
				invalidateKeys.forEach((k) =>
					qc.invalidateQueries({ queryKey: [k] }),
				);
				toast.success(`${data.created} data berhasil diimport.`);
			}
			if (data.skipped > 0) {
				toast.warning(`${data.skipped} baris dilewati (redundan).`);
			}
			if (data.failed > 0) {
				toast.warning(`${data.failed} baris gagal — cek detail error.`);
			}
		},
		onError: (e) => toast.error(err(e, "Import gagal.")),
	});

	const [downloading, setDownloading] = useState(false);
	const downloadTemplate = async () => {
		setDownloading(true);
		try {
			const blob = await apiFetchBlob(`/import/template/${entity}`);
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `template-import-${entity}.xlsx`;
			a.click();
			URL.revokeObjectURL(url);
		} catch (e) {
			toast.error(err(e, "Gagal mengunduh template."));
		} finally {
			setDownloading(false);
		}
	};

	const pickFile = async (file: File | undefined) => {
		if (!file) return;
		setFileName(file.name);
		setResult(null);
		setCsv("");
		setXlsx("");
		setPreview(null);
		if (/\.xlsx$/i.test(file.name)) {
			const buf = new Uint8Array(await file.arrayBuffer());
			let bin = "";
			for (let i = 0; i < buf.length; i += 0x8000) {
				bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
			}
			setXlsx(btoa(bin));
		} else {
			const text = await file.text();
			setCsv(text);
			setPreview(parsePreview(text));
		}
	};

	const reset = () => {
		setFileName("");
		setCsv("");
		setXlsx("");
		setPreview(null);
		setResult(null);
		if (fileRef.current) fileRef.current.value = "";
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				if (!o) reset();
				onOpenChange(o);
			}}
		>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Import {ENTITY_LABEL[entity]} Massal</DialogTitle>
					<DialogDescription>
						Unduh template Excel (.xlsx), isi datanya di Excel/Google Sheets,
						lalu upload kembali di sini. File CSV lama juga masih diterima.
						Baris redundan otomatis dilewati dengan peringatan.
					</DialogDescription>
				</DialogHeader>

				{!result ? (
					<div className="flex flex-col gap-4">
						<Button
							type="button"
							variant="outline"
							className="w-full"
							disabled={downloading}
							onClick={() => void downloadTemplate()}
						>
							<Download className="size-4" />
							Unduh Template Excel
						</Button>
						<div className="rounded-lg border border-dashed p-4 text-center">
							<input
								ref={fileRef}
								type="file"
								accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
								className="hidden"
								onChange={(e) => void pickFile(e.target.files?.[0])}
							/>
							<FileUp className="mx-auto mb-2 size-8 text-muted-foreground/60" />
							<p className="text-sm text-muted-foreground">
								{fileName || "Belum ada file dipilih"}
							</p>
							<Button
								type="button"
								variant="secondary"
								size="sm"
								className="mt-2"
								onClick={() => fileRef.current?.click()}
							>
								Pilih File (.xlsx / .csv)
							</Button>
						</div>
						{xlsx ? (
							<p className="rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
								File Excel siap diimport — validasi tiap baris dilakukan
								server, hasilnya tampil setelah proses selesai.
							</p>
						) : null}
						{preview ? (
							<div className="rounded-lg border">
								<p className="border-b bg-muted/40 px-3 py-2 text-xs font-medium">
									{preview.length} baris terbaca
									{preview.filter((r) => r.dup).length > 0
										? ` — ${preview.filter((r) => r.dup).length} redundan (akan di-skip)`
										: ""}
								</p>
								<div className="max-h-40 overflow-auto">
									{preview.length === 0 ? (
										<p className="px-3 py-2 text-xs text-muted-foreground">
											File tidak berisi baris data.
										</p>
									) : (
										<table className="w-full text-xs">
											<tbody>
												{preview.slice(0, 50).map((r) => (
													<tr key={r.row} className="border-t first:border-0">
														<td className="px-2 py-1.5 tabular-nums text-muted-foreground">
															{r.row}
														</td>
														<td className="px-2 py-1.5">
															<span className="block truncate font-medium">
																{r.name || "(tanpa nama)"}
															</span>
															<span className="block truncate text-muted-foreground">
																{r.email || r.phone || "—"}
															</span>
														</td>
														<td className="px-2 py-1.5 text-right">
															{r.dup ? (
																<span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">
																	{r.dup} — skip
																</span>
															) : null}
														</td>
													</tr>
												))}
											</tbody>
										</table>
									)}
									{preview.length > 50 ? (
										<p className="px-3 py-1.5 text-xs text-muted-foreground">
											…dan {preview.length - 50} baris lainnya
										</p>
									) : null}
								</div>
							</div>
						) : null}
						<Button
							disabled={(!csv && !xlsx) || importM.isPending}
							onClick={() => importM.mutate()}
						>
							{importM.isPending ? (
								<>
									<LoaderCircle className="size-4 animate-spin" /> Memproses...
								</>
							) : (
								<>
									<Upload className="size-4" /> Import Sekarang
								</>
							)}
						</Button>
					</div>
				) : (
					<div className="flex flex-col gap-4">
						<div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
							<div className="rounded-lg bg-muted/50 p-3">
								<p className="text-xl font-semibold tabular-nums">
									{result.total}
								</p>
								<p className="text-xs text-muted-foreground">Total</p>
							</div>
							<div className="rounded-lg bg-emerald-50 p-3 text-emerald-700">
								<p className="text-xl font-semibold tabular-nums">
									{result.created}
								</p>
								<p className="text-xs">Berhasil</p>
							</div>
							<div className="rounded-lg bg-amber-50 p-3 text-amber-700">
								<p className="text-xl font-semibold tabular-nums">
									{result.skipped}
								</p>
								<p className="text-xs">Dilewati</p>
							</div>
							<div className="rounded-lg bg-destructive/10 p-3 text-destructive">
								<p className="text-xl font-semibold tabular-nums">
									{result.failed}
								</p>
								<p className="text-xs">Gagal</p>
							</div>
						</div>

						{result.warnings.length > 0 ? (
							<div className="max-h-32 overflow-auto rounded-lg border border-amber-200 bg-amber-50/50">
								<table className="w-full text-xs">
									<thead className="bg-amber-100/60 sticky top-0">
										<tr>
											<th className="px-2 py-1.5 text-left">Baris</th>
											<th className="px-2 py-1.5 text-left">Email</th>
											<th className="px-2 py-1.5 text-left">Dilewati</th>
										</tr>
									</thead>
									<tbody>
										{result.warnings.map((w) => (
											<tr key={w.row} className="border-t border-amber-200">
												<td className="px-2 py-1.5 tabular-nums">{w.row}</td>
												<td className="px-2 py-1.5">{w.email || "—"}</td>
												<td className="px-2 py-1.5 text-amber-800">
													{w.message}
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						) : null}

						{result.errors.length > 0 ? (
							<div className="max-h-40 overflow-auto rounded-lg border">
								<table className="w-full text-xs">
									<thead className="bg-muted/50 sticky top-0">
										<tr>
											<th className="px-2 py-1.5 text-left">Baris</th>
											<th className="px-2 py-1.5 text-left">Email</th>
											<th className="px-2 py-1.5 text-left">Error</th>
										</tr>
									</thead>
									<tbody>
										{result.errors.map((e2) => (
											<tr key={e2.row} className="border-t">
												<td className="px-2 py-1.5 tabular-nums">{e2.row}</td>
												<td className="px-2 py-1.5">{e2.email || "—"}</td>
												<td className="px-2 py-1.5 text-destructive">
													{e2.message}
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						) : null}

						{result.credentials.length > 0 ? (
							<div>
								<p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium">
									<CircleCheck className="size-3.5 text-emerald-600" />
									Password sementara — salin &amp; sampaikan ke user (hanya
									tampil sekali):
								</p>
								<div className="max-h-40 overflow-auto rounded-lg border">
									<table className="w-full text-xs">
										<thead className="bg-muted/50 sticky top-0">
											<tr>
												<th className="px-2 py-1.5 text-left">Email</th>
												<th className="px-2 py-1.5 text-left">Password</th>
											</tr>
										</thead>
										<tbody>
											{result.credentials.map((c) => (
												<tr key={c.email} className="border-t">
													<td className="px-2 py-1.5">{c.email}</td>
													<td className="px-2 py-1.5 font-mono">
														{c.tempPassword ?? "—"}
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							</div>
						) : null}

						<div className="flex gap-2">
							<Button variant="outline" className="flex-1" onClick={reset}>
								<FileUp className="size-4" /> Import File Lain
							</Button>
							<Button className="flex-1" onClick={() => onOpenChange(false)}>
								Selesai
							</Button>
						</div>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}

/** Tombol "Export Excel" — unduh data entitas sebagai .xlsx.
 *  Untuk siswa: buka dialog filter (asal daftar, kelompok, jenjang). */
export function ExportButton({
	entity,
	className,
}: {
	entity: ImportEntity;
	className?: string;
}) {
	const [downloading, setDownloading] = useState(false);
	const [filterOpen, setFilterOpen] = useState(false);
	const [origin, setOrigin] = useState("");
	const [groupId, setGroupId] = useState("");
	const [levelId, setLevelId] = useState("");

	const groupsQ = useQuery({
		queryKey: ["export-groups"],
		queryFn: () =>
			apiFetch<Array<{ id: string; name: string; level?: { name: string } | null }>>(
				"/groups",
			),
		enabled: filterOpen && entity === "students",
	});
	const levelsQ = useQuery({
		queryKey: ["export-levels"],
		queryFn: () =>
			apiFetch<Array<{ id: string; name: string }>>("/levels"),
		enabled: filterOpen && entity === "students",
	});

	const download = async (qs = "") => {
		setDownloading(true);
		try {
			const blob = await apiFetchBlob(`/import/export/${entity}${qs}`);
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `export-${entity}-${new Date().toISOString().slice(0, 10)}.xlsx`;
			a.click();
			URL.revokeObjectURL(url);
			setFilterOpen(false);
		} catch (e) {
			toast.error(err(e, "Gagal mengunduh export."));
		} finally {
			setDownloading(false);
		}
	};

	const downloadFiltered = () => {
		const p = new URLSearchParams();
		if (origin) p.set("origin", origin);
		if (groupId) p.set("groupId", groupId);
		if (levelId) p.set("levelId", levelId);
		const qs = p.toString();
		void download(qs ? `?${qs}` : "");
	};

	const sel =
		"h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

	return (
		<>
			<Button
				variant="outline"
				className={className}
				disabled={downloading}
				onClick={() =>
					entity === "students" ? setFilterOpen(true) : void download()
				}
			>
				{downloading ? (
					<LoaderCircle className="size-4 animate-spin" />
				) : (
					<Download className="size-4" />
				)}
				Export
			</Button>
			<Dialog open={filterOpen} onOpenChange={setFilterOpen}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Export Siswa ke Excel</DialogTitle>
						<DialogDescription>
							Pilih filter (opsional) — kosongkan untuk export semua siswa.
						</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-3">
						<div>
							<p className="mb-1 text-xs font-medium text-muted-foreground">
								Asal daftar
							</p>
							<select
								className={sel}
								value={origin}
								onChange={(e) => setOrigin(e.target.value)}
							>
								<option value="">Semua</option>
								<option value="external">Daftar mandiri / orang luar</option>
								<option value="internal">Siswa GFS</option>
							</select>
						</div>
						<div>
							<p className="mb-1 text-xs font-medium text-muted-foreground">
								Jenjang
							</p>
							<select
								className={sel}
								value={levelId}
								onChange={(e) => setLevelId(e.target.value)}
							>
								<option value="">Semua jenjang</option>
								{(levelsQ.data ?? []).map((l) => (
									<option key={l.id} value={l.id}>
										{l.name}
									</option>
								))}
							</select>
						</div>
						<div>
							<p className="mb-1 text-xs font-medium text-muted-foreground">
								Kelompok
							</p>
							<select
								className={sel}
								value={groupId}
								onChange={(e) => setGroupId(e.target.value)}
							>
								<option value="">Semua kelompok</option>
								{(groupsQ.data ?? []).map((g) => (
									<option key={g.id} value={g.id}>
										{g.name}
										{g.level?.name ? ` (${g.level.name})` : ""}
									</option>
								))}
							</select>
						</div>
						<Button
							disabled={downloading}
							onClick={downloadFiltered}
						>
							{downloading ? (
								<>
									<LoaderCircle className="size-4 animate-spin" /> Mengunduh...
								</>
							) : (
								<>
									<Download className="size-4" /> Unduh Excel
								</>
							)}
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}
