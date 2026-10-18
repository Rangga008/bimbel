"use client";

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Printer } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, apiFetchBlob, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface ContentCategoryItem {
	id: string;
	code: string;
	name: string;
	isActive?: boolean;
}

/**
 * Tombol "Cetak Laporan Hasil Belajar" — dialog memilih tipe ujian utama
 * (mis. TKA/UTBK/TO) + opsional kategori "Tes Kemampuan Dasar", lalu membuka
 * dokumen cetak (HTML auto-print → bisa langsung cetak / simpan PDF).
 *
 * `endpoint` disesuaikan role:
 *   admin/tutor : /analytics/student/<id>/learning-report/print
 *   ortu        : /analytics/parent/child/<id>/learning-report/print
 *   siswa       : /analytics/my-learning-report/print
 */
export function LearningReportButton({ endpoint }: { endpoint: string }) {
	const [open, setOpen] = useState(false);
	const [category, setCategory] = useState("");
	const [basic, setBasic] = useState("");
	const [busy, setBusy] = useState(false);
	const [reportHtml, setReportHtml] = useState<string | null>(null);
	const iframeRef = useRef<HTMLIFrameElement | null>(null);

	const catsQ = useQuery({
		queryKey: ["content-categories"],
		queryFn: () => apiFetch<ContentCategoryItem[]>("/content-categories"),
		enabled: open,
	});
	const cats = (catsQ.data ?? []).filter((c) => c.isActive !== false);

	async function handleShow() {
		if (!category) {
			toast.error("Pilih tipe ujian utama dulu (mis. TKA / Try Out).");
			return;
		}
		const params = new URLSearchParams({ category });
		if (basic && basic !== category) params.set("basic", basic);
		setBusy(true);
		try {
			const blob = await apiFetchBlob(`${endpoint}?${params}`);
			// Buang <script> auto-print — preview iframe tidak boleh
			// langsung memunculkan dialog print.
			setReportHtml(
				(await blob.text()).replace(/<script[\s\S]*?<\/script>/gi, ""),
			);
		} catch (e) {
			toast.error(
				e instanceof ApiError ? e.message : "Gagal memuat laporan.",
			);
		} finally {
			setBusy(false);
		}
	}

	return (
		<>
			<Button variant="outline" size="sm" onClick={() => setOpen(true)}>
				<FileText className="mr-1.5 size-4" /> Laporan Hasil Belajar
			</Button>
			<Dialog open={open} onOpenChange={(o) => { if (!o) { setReportHtml(null); setCategory(""); setBasic(""); } setOpen(o); }}>
				<DialogContent className="sm:max-w-4xl max-h-[85vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle>Laporan Hasil Belajar</DialogTitle>
						<DialogDescription>
							Laporan resmi dengan kop bimbel: nilai per mapel dari
							semua ujian satu tipe + grafik perkembangan.
						</DialogDescription>
					</DialogHeader>
					{reportHtml ? (
						<div className="flex flex-col gap-3">
							{/* Preview di iframe — CSS global laporan terisolasi,
							    dan print langsung dari dokumen yang sama. */}
							<iframe
								ref={iframeRef}
								title="Preview laporan hasil belajar"
								srcDoc={reportHtml}
								className="h-[65vh] w-full rounded-md border bg-white"
							/>
							<div className="flex gap-2">
								<Button
									variant="outline"
									size="sm"
									onClick={() => {
										const win = iframeRef.current?.contentWindow;
										if (!win) return;
										win.focus();
										win.print();
									}}
								>
									<Printer className="mr-1.5 size-4" /> Cetak / Simpan PDF
								</Button>
								<Button variant="ghost" size="sm" onClick={() => setReportHtml(null)}>
									Kembali
								</Button>
							</div>
						</div>
					) : (
						<div className="grid gap-4 py-2">
							<div className="grid gap-1.5">
								<Label htmlFor="lr-cat">Tipe ujian utama</Label>
								<select
									id="lr-cat"
									className="h-9 rounded-md border bg-background px-3 text-sm"
									value={category}
									onChange={(e) => setCategory(e.target.value)}
								>
									<option value="">
										{catsQ.isLoading ? "Memuat…" : "— Pilih tipe (mis. TKA / TO / UTBK) —"}
									</option>
									{cats.map((c) => (
										<option key={c.code} value={c.code}>
											{c.name}
										</option>
									))}
								</select>
							</div>
							<div className="grid gap-1.5">
								<Label htmlFor="lr-basic">
									Tes Kemampuan Dasar (opsional)
								</Label>
								<select
									id="lr-basic"
									className="h-9 rounded-md border bg-background px-3 text-sm"
									value={basic}
									onChange={(e) => setBasic(e.target.value)}
								>
									<option value="">— Tidak ada —</option>
									{cats
										.filter((c) => c.code !== category)
										.map((c) => (
											<option key={c.code} value={c.code}>
												{c.name}
											</option>
										))}
								</select>
								<p className="text-xs text-muted-foreground">
									Tipe ujian ini ditampilkan sebagai tabel terpisah
									"Tes Kemampuan Dasar" di atas tabel utama.
								</p>
							</div>
							<Button
								onClick={handleShow}
								disabled={busy || !category}
							>
								<FileText className="mr-1.5 size-4" />
								{busy ? "Menyiapkan…" : "Tampilkan Laporan"}
							</Button>
						</div>
					)}
				</DialogContent>
			</Dialog>
		</>
	);
}
