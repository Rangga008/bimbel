"use client";

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
	errors: Array<{ row: number; email: string; message: string }>;
	credentials: Array<{ email: string; name: string; tempPassword?: string }>;
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
	const [result, setResult] = useState<ImportResult | null>(null);

	const importM = useMutation({
		mutationFn: (text: string) =>
			apiFetch<ImportResult>(`/import/${entity}`, {
				method: "POST",
				body: { csv: text },
			}),
		onSuccess: (data) => {
			setResult(data);
			if (data.created > 0) {
				invalidateKeys.forEach((k) =>
					qc.invalidateQueries({ queryKey: [k] }),
				);
				toast.success(`${data.created} data berhasil diimport.`);
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
			a.download = `template-import-${entity}.csv`;
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
		const text = await file.text();
		setCsv(text);
		setResult(null);
	};

	const reset = () => {
		setFileName("");
		setCsv("");
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
						Unduh template CSV, isi datanya di Excel/Google Sheets (pemisah
						koma atau titik-koma), lalu upload kembali di sini. Baris
						berawalan # adalah contoh — otomatis diabaikan saat import.
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
							Unduh Template CSV
						</Button>
						<div className="rounded-lg border border-dashed p-4 text-center">
							<input
								ref={fileRef}
								type="file"
								accept=".csv,text/csv"
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
								Pilih File CSV
							</Button>
						</div>
						<Button
							disabled={!csv || importM.isPending}
							onClick={() => importM.mutate(csv)}
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
						<div className="grid grid-cols-3 gap-2 text-center">
							<div className="rounded-lg bg-muted/50 p-3">
								<p className="text-xl font-semibold tabular-nums">
									{result.total}
								</p>
								<p className="text-xs text-muted-foreground">Total baris</p>
							</div>
							<div className="rounded-lg bg-emerald-50 p-3 text-emerald-700">
								<p className="text-xl font-semibold tabular-nums">
									{result.created}
								</p>
								<p className="text-xs">Berhasil</p>
							</div>
							<div className="rounded-lg bg-destructive/10 p-3 text-destructive">
								<p className="text-xl font-semibold tabular-nums">
									{result.failed}
								</p>
								<p className="text-xs">Gagal</p>
							</div>
						</div>

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
