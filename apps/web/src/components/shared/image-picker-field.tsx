"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
	FileText,
	Image as ImageIcon,
	Link as LinkIcon,
	LoaderCircle,
	Search,
	Trash2,
	Upload,
	X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FormField } from "@/components/shared/form-field";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { apiFetch, ApiError, resolveAssetUrl } from "@/lib/api-client";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { cn } from "@/lib/utils";

export interface MediaAssetItem {
	id: string;
	name: string;
	mime: string;
	size: number;
	url: string;
	uploadedBy: string | null;
	createdAt: string;
}

export type MediaKind = "image" | "pdf";
export type MediaCategory = "ACADEMIC" | "FINANCE" | "BRANDING";

const KIND_CONFIG: Record<
	MediaKind,
	{ accept: string; noun: string; hint: string }
> = {
	image: {
		accept: "image/jpeg,image/png,image/webp,image/gif,image/svg+xml",
		noun: "gambar",
		hint: "JPG, PNG, WebP, GIF, SVG — maks 2MB",
	},
	pdf: {
		accept: "application/pdf,.pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		noun: "file dokumen",
		hint: "PDF / Word (.doc, .docx) — maks 10MB",
	},
};

function errMsg(e: unknown, fallback: string) {
	return e instanceof ApiError ? e.message : fallback;
}

function formatSize(bytes: number) {
	return bytes >= 1024 * 1024
		? `${(bytes / 1024 / 1024).toFixed(1)} MB`
		: `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Dialog pustaka media: upload file baru, pilih dari pustaka, atau tempel
 * link eksternal. `kind` membatasi tipe (image = thumbnail grid, pdf = daftar
 * dokumen). Hanya dipakai di konteks role admin/tutor (endpoint dilindungi
 * permission media.manage di backend).
 */
export function MediaLibraryDialog({
	open,
	onOpenChange,
	onPick,
	kind = "image",
	category = "ACADEMIC",
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** url + metadata aset (mime/size/name) — meta ada saat pick dari pustaka/upload. */
	onPick: (url: string, meta?: MediaAssetItem) => void;
	kind?: MediaKind;
	/** Kategori pustaka: akademik (soal/materi), finance (bukti), branding (logo). */
	category?: MediaCategory;
}) {
	const qc = useQueryClient();
	const [search, setSearch] = useState("");
	const debouncedSearch = useDebouncedValue(search);
	const [linkUrl, setLinkUrl] = useState("");
	const [file, setFile] = useState<File | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<MediaAssetItem | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const cfg = KIND_CONFIG[kind];

	const listQ = useQuery({
		queryKey: ["media-assets", kind, category, debouncedSearch],
		queryFn: () =>
			apiFetch<MediaAssetItem[]>(
				`/media?kind=${kind}&category=${category}${debouncedSearch ? `&search=${encodeURIComponent(debouncedSearch)}` : ""}`,
			),
		enabled: open,
	});

	const uploadM = useMutation({
		mutationFn: (f: File) => {
			const fd = new FormData();
			fd.append("file", f);
			fd.append("category", category);
			return apiFetch<MediaAssetItem>("/media", { method: "POST", body: fd });
		},
		onSuccess: (asset) => {
			toast.success(`${kind === "pdf" ? "Dokumen" : "Gambar"} terupload.`);
			qc.invalidateQueries({ queryKey: ["media-assets"] });
			onPick(asset.url, asset);
		},
		onError: (e) =>
			toast.error(errMsg(e, `Gagal mengupload ${cfg.noun}.`)),
	});

	const deleteM = useMutation({
		mutationFn: (id: string) =>
			apiFetch(`/media/${id}`, { method: "DELETE" }),
		onSuccess: () => {
			toast.success("File dihapus dari pustaka.");
			setDeleteTarget(null);
			qc.invalidateQueries({ queryKey: ["media-assets"] });
		},
		onError: (e) => toast.error(errMsg(e, "Gagal menghapus file.")),
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>
						Pustaka {kind === "pdf" ? "Dokumen" : "Gambar"}
					</DialogTitle>
					<DialogDescription>
						Upload {cfg.noun} baru, pilih dari pustaka, atau tempel link
						eksternal.
					</DialogDescription>
				</DialogHeader>
				<Tabs defaultValue="library" className="w-full">
					<TabsList className="w-full">
						<TabsTrigger value="library" className="flex-1">
							{kind === "pdf" ? (
								<FileText className="size-4" />
							) : (
								<ImageIcon className="size-4" />
							)}
							Pustaka
						</TabsTrigger>
						<TabsTrigger value="upload" className="flex-1">
							<Upload className="size-4" /> Upload
						</TabsTrigger>
						<TabsTrigger value="link" className="flex-1">
							<LinkIcon className="size-4" /> Link
						</TabsTrigger>
					</TabsList>

					<TabsContent value="library" className="flex flex-col gap-3 pt-2">
						<div className="relative">
							<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								value={search}
								onChange={(e) => setSearch(e.target.value)}
								placeholder={`Cari nama ${cfg.noun}...`}
								className="pl-9"
							/>
						</div>
						{listQ.isLoading ? (
							<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
								{Array.from({ length: 6 }).map((_, i) => (
									<div key={i} className="aspect-video animate-pulse rounded-lg bg-muted" />
								))}
							</div>
						) : listQ.data?.length ? (
							<div className="grid max-h-80 grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
								{listQ.data.map((a) => (
									<div key={a.id} className="group relative">
										<button
											type="button"
											onClick={() => onPick(a.url, a)}
											className="w-full overflow-hidden rounded-lg border bg-muted/30 text-left transition-colors hover:border-brand-blue-500 hover:ring-2 hover:ring-brand-blue-500/30"
										>
											{!a.mime.startsWith("image/") ? (
												<div className="flex aspect-video w-full flex-col items-center justify-center gap-1.5">
													<FileText className="size-8 text-brand-blue-500" />
													<span className="text-[10px] font-medium uppercase text-muted-foreground">
														PDF · {formatSize(a.size)}
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
											<p className="truncate px-2 py-1.5 text-xs">{a.name}</p>
										</button>
										<button
											type="button"
											aria-label={`Hapus ${a.name}`}
											onClick={() => setDeleteTarget(a)}
											className="absolute right-1.5 top-1.5 hidden size-6 items-center justify-center rounded-md bg-background/90 text-destructive shadow group-hover:flex"
										>
											<Trash2 className="size-3.5" />
										</button>
									</div>
								))}
							</div>
						) : (
							<div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-10 text-center">
								{kind === "pdf" ? (
									<FileText className="size-8 text-muted-foreground/50" />
								) : (
									<ImageIcon className="size-8 text-muted-foreground/50" />
								)}
								<p className="text-sm text-muted-foreground">
									{search
										? `Tidak ada ${cfg.noun} yang cocok.`
										: "Pustaka masih kosong."}
								</p>
							</div>
						)}
					</TabsContent>

					<TabsContent value="upload" className="flex flex-col gap-3 pt-2">
						<button
							type="button"
							onClick={() => fileInputRef.current?.click()}
							className={cn(
								"flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-10 text-sm transition-colors",
								"hover:border-brand-blue-500 hover:bg-brand-blue-500/5",
							)}
						>
							{file ? (
								<>
									{kind === "pdf" ? (
										<FileText className="size-8 text-brand-blue-500" />
									) : (
										<ImageIcon className="size-8 text-brand-blue-500" />
									)}
									<span className="font-medium">{file.name}</span>
									<span className="text-xs text-muted-foreground">
										{formatSize(file.size)} — klik untuk ganti
									</span>
								</>
							) : (
								<>
									<Upload className="size-8 text-muted-foreground/60" />
									<span>Klik untuk pilih {cfg.noun}</span>
									<span className="text-xs text-muted-foreground">
										{cfg.hint}
									</span>
								</>
							)}
						</button>
						<input
							ref={fileInputRef}
							type="file"
							accept={cfg.accept}
							className="hidden"
							onChange={(e) => setFile(e.target.files?.[0] ?? null)}
						/>
						<Button
							type="button"
							disabled={!file || uploadM.isPending}
							onClick={() => file && uploadM.mutate(file)}
						>
							{uploadM.isPending ? (
								<LoaderCircle className="size-4 animate-spin" />
							) : (
								<Upload className="size-4" />
							)}
							Upload &amp; Pakai
						</Button>
					</TabsContent>

					<TabsContent value="link" className="flex flex-col gap-3 pt-2">
						<Input
							value={linkUrl}
							onChange={(e) => setLinkUrl(e.target.value)}
							placeholder={
								kind === "pdf"
									? "https://contoh.com/materi.pdf"
									: "https://contoh.com/gambar.png"
							}
							type="url"
						/>
						{linkUrl && kind === "image" ? (
							<img
								src={linkUrl}
								alt="Pratinjau link"
								className="max-h-48 w-auto self-start rounded-lg border object-contain"
								onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
								onLoad={(e) => ((e.target as HTMLImageElement).style.display = "")}
							/>
						) : null}
						<Button
							type="button"
							disabled={!linkUrl.trim()}
							onClick={() => onPick(linkUrl.trim())}
						>
							<LinkIcon className="size-4" /> Pakai Link Ini
						</Button>
					</TabsContent>
				</Tabs>

				<ConfirmDialog
					open={deleteTarget !== null}
					onOpenChange={(o) => !o && setDeleteTarget(null)}
					title="Hapus file?"
					description={`"${deleteTarget?.name}" dihapus permanen dari pustaka. Konten yang sudah memakainya akan kehilangan file.`}
					confirmLabel="Hapus"
					pending={deleteM.isPending}
					onConfirm={() => deleteTarget && deleteM.mutate(deleteTarget.id)}
				/>
			</DialogContent>
		</Dialog>
	);
}

/**
 * Field gambar: preview + tombol buka pustaka. Nilai tetap string URL yang sama
 * (path `/api/media/...` untuk gambar pustaka, URL penuh untuk link) sehingga
 * payload form/API tidak berubah.
 */
export function ImagePickerField({
	id,
	label,
	value,
	onChange,
	required = false,
	disabled = false,
	error,
	hint,
	category = "ACADEMIC",
}: {
	id: string;
	label?: string;
	value: string;
	onChange: (url: string) => void;
	required?: boolean;
	disabled?: boolean;
	error?: string | null;
	hint?: string;
	category?: MediaCategory;
}) {
	const [open, setOpen] = useState(false);
	const src = resolveAssetUrl(value);

	return (
		<FormField htmlFor={id} label={label ?? "Gambar"} required={required} error={error} hint={hint}>
			<div className="flex items-start gap-3">
				{value ? (
					<img
						src={src}
						alt="Gambar terpilih"
						className="h-16 w-24 shrink-0 rounded-lg border bg-muted/30 object-contain"
					/>
				) : (
					<div className="flex h-16 w-24 shrink-0 items-center justify-center rounded-lg border border-dashed bg-muted/20">
						<ImageIcon className="size-5 text-muted-foreground/50" />
					</div>
				)}
				<div className="flex flex-col gap-1.5">
					<div className="flex gap-2">
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={disabled}
							onClick={() => setOpen(true)}
						>
							<ImageIcon className="size-4" />
							{value ? "Ganti Gambar" : "Pilih Gambar"}
						</Button>
						{value ? (
							<Button
								type="button"
								variant="ghost"
								size="sm"
								disabled={disabled}
								onClick={() => onChange("")}
							>
								<X className="size-4" /> Hapus
							</Button>
						) : null}
					</div>
					{value ? (
						<p className="max-w-64 truncate text-xs text-muted-foreground" title={value}>
							{value}
						</p>
					) : null}
				</div>
			</div>
			<MediaLibraryDialog
				open={open}
				onOpenChange={setOpen}
				category={category}
				onPick={(url) => {
					onChange(url);
					setOpen(false);
				}}
			/>
		</FormField>
	);
}

/**
 * Field dokumen (PDF): preview nama file + tombol buka pustaka PDF.
 * onChange menerima metadata aset (mime/size) bila dipilih dari pustaka atau
 * baru diupload — dipakai form materi untuk mengisi fileType/fileSize otomatis.
 */
export function FilePickerField({
	id,
	label,
	value,
	onChange,
	disabled = false,
	hint,
}: {
	id: string;
	label?: string;
	value: string;
	onChange: (
		url: string,
		meta?: { mime: string; size: number; name: string },
	) => void;
	disabled?: boolean;
	hint?: string;
}) {
	const [open, setOpen] = useState(false);
	const fileName = value ? decodeURIComponent(value.split("/").pop() ?? value) : "";

	return (
		<FormField htmlFor={id} label={label ?? "File"} hint={hint}>
			<div className="flex items-start gap-3">
				<div className="flex h-16 w-24 shrink-0 items-center justify-center rounded-lg border bg-muted/20">
					{value ? (
						<FileText className="size-6 text-brand-blue-500" />
					) : (
						<FileText className="size-5 text-muted-foreground/50" />
					)}
				</div>
				<div className="flex flex-col gap-1.5">
					<div className="flex gap-2">
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={disabled}
							onClick={() => setOpen(true)}
						>
							<FileText className="size-4" />
							{value ? "Ganti File" : "Pilih File"}
						</Button>
						{value ? (
							<>
								<a
									href={resolveAssetUrl(value)}
									target="_blank"
									rel="noreferrer"
									className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent"
								>
									<LinkIcon className="size-4" /> Buka
								</a>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									disabled={disabled}
									onClick={() => onChange("")}
								>
									<X className="size-4" /> Hapus
								</Button>
							</>
						) : null}
					</div>
					{value ? (
						<p className="max-w-64 truncate text-xs text-muted-foreground" title={value}>
							{fileName}
						</p>
					) : null}
				</div>
			</div>
			<MediaLibraryDialog
				kind="pdf"
				open={open}
				onOpenChange={setOpen}
				onPick={(url, meta) => {
					onChange(
						url,
						meta ? { mime: meta.mime, size: meta.size, name: meta.name } : undefined,
					);
					setOpen(false);
				}}
			/>
		</FormField>
	);
}
