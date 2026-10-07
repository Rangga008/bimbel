"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Printer } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, apiFetchBlob, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
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

	const catsQ = useQuery({
		queryKey: ["content-categories"],
		queryFn: () => apiFetch<ContentCategoryItem[]>("/content-categories"),
		enabled: open,
	});
	const cats = (catsQ.data ?? []).filter((c) => c.isActive !== false);

	async function handlePrint() {
		if (!category) {
			toast.error("Pilih tipe ujian utama dulu (mis. TKA / Try Out).");
			return;
		}
		const params = new URLSearchParams({ category });
		if (basic && basic !== category) params.set("basic", basic);
		setBusy(true);
		try {
			const blob = await apiFetchBlob(`${endpoint}?${params}`);
			const url = URL.createObjectURL(blob);
			window.open(url, "_blank", "noopener");
			setOpen(false);
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
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Cetak Laporan Hasil Belajar</DialogTitle>
						<DialogDescription>
							Laporan resmi dengan kop bimbel: nilai per mapel dari
							semua ujian satu tipe + grafik perkembangan — siap
							cetak / simpan PDF.
						</DialogDescription>
					</DialogHeader>
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
					</div>
					<DialogFooter>
						<Button
							onClick={handlePrint}
							disabled={busy || !category}
						>
							<Printer className="mr-1.5 size-4" />
							{busy ? "Menyiapkan…" : "Cetak / Unduh PDF"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
