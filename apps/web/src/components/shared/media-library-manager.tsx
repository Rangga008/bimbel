"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
	FileText,
	Images,
	LoaderCircle,
	Search,
	Trash2,
	Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { apiFetch, ApiError, resolveAssetUrl } from "@/lib/api-client";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import type { MediaAssetItem } from "@/components/shared/image-picker-field";

const ACCEPTED =
	"image/jpeg,image/png,image/webp,image/gif,image/svg+xml,application/pdf,.pdf";

function errMsg(e: unknown, fallback: string) {
	return e instanceof ApiError ? e.message : fallback;
}

const CATEGORY_META = {
	ACADEMIC: {
		title: "Pustaka Media",
		subtitle:
			"Gambar untuk soal/konten dan PDF untuk materi. JPG/PNG/WebP/GIF/SVG maks 2MB, PDF maks 10MB.",
		empty: "Upload gambar/PDF pertama untuk dipakai di soal, materi, dan konten.",
	},
	FINANCE: {
		title: "Pustaka Keuangan",
		subtitle:
			"Bukti pembayaran, kwitansi hasil generate, dan dokumen keuangan lainnya.",
		empty: "Upload bukti pembayaran/dokumen keuangan pertama.",
	},
	BRANDING: {
		title: "Pustaka Branding",
		subtitle: "Logo dan aset identitas aplikasi.",
		empty: "Upload logo/aset branding pertama.",
	},
} as const;

type MediaCategory = keyof typeof CATEGORY_META;

/**
 * Halaman pustaka media per kategori — akademik (soal/materi), finance
 * (bukti & kwitansi), branding (logo). Backend menegakkan permission
 * per kategori.
 */
export function MediaLibraryManager({
	category = "ACADEMIC",
}: {
	category?: MediaCategory;
}) {
	const meta = CATEGORY_META[category];
	const qc = useQueryClient();
	const [search, setSearch] = useState("");
	const debouncedSearch = useDebouncedValue(search);
	const [from, setFrom] = useState("");
	const [to, setTo] = useState("");
	const [ext, setExt] = useState("");
	const [uploader, setUploader] = useState("");
	const [deleteTarget, setDeleteTarget] = useState<MediaAssetItem | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const listQ = useQuery({
		queryKey: ["media-assets", category, debouncedSearch, from, to, ext, uploader],
		queryFn: () => {
			const p = new URLSearchParams({ category });
			if (debouncedSearch) p.set("search", debouncedSearch);
			if (from) p.set("from", from);
			if (to) p.set("to", to);
			if (ext) p.set("ext", ext);
			if (uploader) p.set("uploader", uploader);
			return apiFetch<MediaAssetItem[]>(`/media?${p.toString()}`);
		},
	});

	// Opsi "asal file" — nama pengupload yang pernah mengisi pustaka ini.
	const uploadersQ = useQuery({
		queryKey: ["media-uploaders", category],
		queryFn: () => apiFetch<string[]>(`/media/uploaders?category=${category}`),
	});

	const uploadM = useMutation({
		mutationFn: (f: File) => {
			const fd = new FormData();
			fd.append("file", f);
			fd.append("category", category);
			return apiFetch<MediaAssetItem>("/media", { method: "POST", body: fd });
		},
		onSuccess: () => {
			toast.success("File terupload ke pustaka.");
			qc.invalidateQueries({ queryKey: ["media-assets"] });
		},
		onError: (e) => toast.error(errMsg(e, "Gagal mengupload file.")),
	});

	const deleteM = useMutation({
		mutationFn: (id: string) => apiFetch(`/media/${id}`, { method: "DELETE" }),
		onSuccess: () => {
			toast.success("File dihapus dari pustaka.");
			setDeleteTarget(null);
			qc.invalidateQueries({ queryKey: ["media-assets"] });
		},
		onError: (e) => toast.error(errMsg(e, "Gagal menghapus file.")),
	});

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h1 className="text-2xl font-semibold tracking-tight">{meta.title}</h1>
					<p className="text-sm text-muted-foreground">{meta.subtitle}</p>
				</div>
				<Button
					onClick={() => fileInputRef.current?.click()}
					disabled={uploadM.isPending}
				>
					{uploadM.isPending ? (
						<LoaderCircle className="size-4 animate-spin" />
					) : (
						<Upload className="size-4" />
					)}
					Upload File
				</Button>
			</div>
			<input
				ref={fileInputRef}
				type="file"
				accept={ACCEPTED}
				className="hidden"
				onChange={(e) => {
					const f = e.target.files?.[0];
					if (f) uploadM.mutate(f);
					e.target.value = "";
				}}
			/>
			<div className="flex flex-wrap items-end gap-3">
				<div className="relative w-full max-w-xs">
					<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Cari nama file..."
						className="pl-9"
					/>
				</div>
				<div className="flex flex-col gap-1">
					<span className="text-xs font-medium text-muted-foreground">Dari tanggal</span>
					<Input
						type="date"
						value={from}
						onChange={(e) => setFrom(e.target.value)}
						className="w-40"
					/>
				</div>
				<div className="flex flex-col gap-1">
					<span className="text-xs font-medium text-muted-foreground">Sampai tanggal</span>
					<Input
						type="date"
						value={to}
						onChange={(e) => setTo(e.target.value)}
						className="w-40"
					/>
				</div>
				<div className="flex flex-col gap-1">
					<span className="text-xs font-medium text-muted-foreground">Tipe file</span>
					<select
						value={ext}
						onChange={(e) => setExt(e.target.value)}
						className="h-9 w-40 rounded-md border border-input bg-background px-3 text-sm"
					>
						<option value="">Semua tipe</option>
						<option value="jpg">JPG</option>
						<option value="png">PNG</option>
						<option value="webp">WebP</option>
						<option value="gif">GIF</option>
						<option value="svg">SVG</option>
						<option value="pdf">PDF</option>
						<option value="doc">DOC</option>
						<option value="docx">DOCX</option>
					</select>
				</div>
				<div className="flex flex-col gap-1">
					<span className="text-xs font-medium text-muted-foreground">Asal (pengupload)</span>
					<select
						value={uploader}
						onChange={(e) => setUploader(e.target.value)}
						className="h-9 w-44 rounded-md border border-input bg-background px-3 text-sm"
					>
						<option value="">Semua asal</option>
						{(uploadersQ.data ?? []).map((u) => (
							<option key={u} value={u}>{u}</option>
						))}
					</select>
				</div>
				{(from || to || ext || uploader) && (
					<Button
						variant="ghost"
						size="sm"
						onClick={() => {
							setFrom("");
							setTo("");
							setExt("");
							setUploader("");
						}}
					>
						Reset Filter
					</Button>
				)}
			</div>

			{listQ.isLoading ? (
				<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
					{Array.from({ length: 8 }).map((_, i) => (
						<div key={i} className="aspect-video animate-pulse rounded-lg bg-muted" />
					))}
				</div>
			) : listQ.data?.length ? (
				<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
					{listQ.data.map((a) => (
						<Card key={a.id} className="group overflow-hidden py-0">
							<a
								href={resolveAssetUrl(a.url)}
								target="_blank"
								rel="noopener noreferrer"
								className="block bg-muted/30"
							>
								{a.mime === "application/pdf" ? (
									<div className="flex aspect-video w-full flex-col items-center justify-center gap-1.5">
										<FileText className="size-9 text-brand-blue-500" />
										<span className="text-[10px] font-medium uppercase text-muted-foreground">
											Dokumen PDF
										</span>
									</div>
								) : (
									<img
										src={resolveAssetUrl(a.url)}
										alt={a.name}
										className="aspect-video w-full object-contain"
										loading="lazy"
									/>
								)}
							</a>
							<CardContent className="flex items-center justify-between gap-2 px-3 py-2">
								<div className="min-w-0">
									<p className="truncate text-xs font-medium" title={a.name}>
										{a.name}
									</p>
									<p className="text-[11px] text-muted-foreground">
										{(a.size / 1024).toFixed(0)} KB
										{a.uploadedBy ? ` · ${a.uploadedBy}` : ""}
										{a.createdAt
											? ` · ${new Date(a.createdAt).toLocaleDateString("id-ID")}`
											: ""}
									</p>
								</div>
								<Button
									variant="ghost"
									size="sm"
									className="size-7 shrink-0 p-0 text-destructive"
									aria-label={`Hapus ${a.name}`}
									onClick={() => setDeleteTarget(a)}
								>
									<Trash2 className="size-3.5" />
								</Button>
							</CardContent>
						</Card>
					))}
				</div>
			) : (
				<EmptyState
					icon={Images}
					title={search ? "File tidak ditemukan" : "Pustaka masih kosong"}
					description={
						search
							? `Tidak ada file yang cocok dengan "${search}".`
							: meta.empty
					}
				/>
			)}

			<ConfirmDialog
				open={deleteTarget !== null}
				onOpenChange={(o) => !o && setDeleteTarget(null)}
				title="Hapus file?"
				description={`"${deleteTarget?.name}" dihapus permanen. Soal/materi yang sudah memakainya akan kehilangan file.`}
				confirmLabel="Hapus"
				pending={deleteM.isPending}
				onConfirm={() => deleteTarget && deleteM.mutate(deleteTarget.id)}
			/>
		</div>
	);
}
