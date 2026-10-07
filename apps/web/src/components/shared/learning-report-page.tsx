"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Printer } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, apiFetchBlob, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

interface ContentCategoryItem {
	id: string;
	code: string;
	name: string;
	isActive?: boolean;
}

interface StudentOption {
	id: string;
	user?: { name: string };
	name?: string;
}

interface ReportExam {
	id: string;
	title: string;
	category: string | null;
	scheduledStartAt: string;
}

function fmtDateShort(iso: string) {
	const d = new Date(iso);
	return Number.isNaN(d.getTime())
		? ""
		: d.toLocaleDateString("id-ID", {
				day: "numeric",
				month: "short",
				year: "numeric",
			});
}

/**
 * Halaman "Laporan Hasil Belajar" — dokumen resmi bergaya kop bimbel:
 * matriks nilai per mapel dari satu/beberapa ujian terpilih (checkbox),
 * tabel Tes Kemampuan Dasar opsional + grafik + tanda tangan.
 * audience:
 *  - "self"   : siswa — laporan diri sendiri.
 *  - "parent" : ortu — pilih anak dulu.
 *  - "staff"  : admin akademik/owner — pilih siswa.
 *  - "tutor"  : tutor — pilih siswa dari kelompok yang dia ampu.
 */
export function LearningReportPage({
	audience,
}: {
	audience: "self" | "parent" | "staff" | "tutor";
}) {
	const [studentId, setStudentId] = useState("");
	const [category, setCategory] = useState("");
	const [basic, setBasic] = useState("");
	// null = semua ujian kategori tsb disertakan (default).
	const [excluded, setExcluded] = useState<Set<string>>(new Set());
	const [busy, setBusy] = useState(false);

	const catsQ = useQuery({
		queryKey: ["content-categories"],
		queryFn: () => apiFetch<ContentCategoryItem[]>("/content-categories"),
	});
	const cats = (catsQ.data ?? []).filter((c) => c.isActive !== false);

	const studentsQ = useQuery({
		queryKey: ["learning-report-students", audience],
		queryFn: () =>
			apiFetch<StudentOption[]>(
				audience === "parent"
					? "/me/children"
					: audience === "tutor"
						? "/analytics/my-students"
						: "/students",
			),
		enabled: audience !== "self",
	});
	const students = studentsQ.data ?? [];

	// Ujian yang pernah dikerjakan — untuk checkbox "ujian yang disertakan".
	const examsQ = useQuery({
		queryKey: ["learning-report-exams", audience, studentId],
		queryFn: () =>
			apiFetch<ReportExam[]>(
				audience === "self"
					? "/analytics/my-report-exams"
					: audience === "parent"
						? `/analytics/parent/child/${studentId}/report-exams`
						: `/analytics/student/${studentId}/report-exams`,
			),
		enabled: audience === "self" || !!studentId,
	});
	const exams = examsQ.data ?? [];
	const catExams = exams.filter((e) => e.category === category);
	const includedIds = catExams
		.filter((e) => !excluded.has(e.id))
		.map((e) => e.id);

	const endpoint =
		audience === "self"
			? "/analytics/my-learning-report/print"
			: audience === "parent"
				? `/analytics/parent/child/${studentId}/learning-report/print`
				: `/analytics/student/${studentId}/learning-report/print`;

	async function handlePrint() {
		if (audience !== "self" && !studentId) {
			toast.error(
				audience === "parent" ? "Pilih anak dulu." : "Pilih siswa dulu.",
			);
			return;
		}
		if (!category) {
			toast.error("Pilih tipe ujian utama dulu (mis. TKA / Try Out).");
			return;
		}
		if (examsQ.isSuccess && catExams.length > 0 && includedIds.length === 0) {
			toast.error("Centang minimal satu ujian yang disertakan.");
			return;
		}
		const params = new URLSearchParams({ category });
		if (basic && basic !== category) params.set("basic", basic);
		// Kirim subset id kalau ada yang di-uncheck; kosong = semua.
		if (includedIds.length > 0 && includedIds.length < catExams.length) {
			params.set("exams", includedIds.join(","));
		}
		setBusy(true);
		try {
			const blob = await apiFetchBlob(`${endpoint}?${params}`);
			const url = URL.createObjectURL(blob);
			window.open(url, "_blank", "noopener");
		} catch (e) {
			toast.error(e instanceof ApiError ? e.message : "Gagal memuat laporan.");
		} finally {
			setBusy(false);
		}
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-base">
					<FileText className="size-4.5 text-brand-blue-600" />
					Laporan Hasil Belajar
				</CardTitle>
				<CardDescription>
					Laporan resmi dengan kop bimbel — pilih tipe ujian lalu centang
					tes/ujian yang disertakan (bisa beberapa), nilai per mapel dijumlah
					dalam satu matriks + tabel Tes Kemampuan Dasar, grafik, dan tanda
					tangan. Terbuka siap cetak / simpan PDF.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{audience !== "self" ? (
						<div className="grid gap-1.5">
							<Label htmlFor="lrp-student">
								{audience === "parent" ? "Anak" : "Siswa"}
							</Label>
							<select
								id="lrp-student"
								className="h-9 rounded-md border bg-background px-3 text-sm"
								value={studentId}
								onChange={(e) => {
									setStudentId(e.target.value);
									setExcluded(new Set());
								}}
							>
								<option value="">
									{studentsQ.isLoading ? "Memuat…" : "— Pilih —"}
								</option>
								{students.map((s) => (
									<option key={s.id} value={s.id}>
										{s.user?.name ?? s.name ?? s.id}
									</option>
								))}
							</select>
						</div>
					) : null}
					<div className="grid gap-1.5">
						<Label htmlFor="lrp-cat">Tipe ujian utama</Label>
						<select
							id="lrp-cat"
							className="h-9 rounded-md border bg-background px-3 text-sm"
							value={category}
							onChange={(e) => {
								setCategory(e.target.value);
								setExcluded(new Set());
							}}
						>
							<option value="">
								{catsQ.isLoading
									? "Memuat…"
									: "— Pilih tipe (mis. TKA / TO / UTBK) —"}
							</option>
							{cats.map((c) => (
								<option key={c.code} value={c.code}>
									{c.name}
								</option>
							))}
						</select>
					</div>
					<div className="grid gap-1.5">
						<Label htmlFor="lrp-basic">
							Tes Kemampuan Dasar (opsional)
						</Label>
						<select
							id="lrp-basic"
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
					</div>
				</div>

				{category ? (
					<div className="grid gap-2">
						<Label>Ujian yang disertakan</Label>
						{examsQ.isLoading ? (
							<p className="text-sm text-muted-foreground">
								Memuat daftar ujian…
							</p>
						) : catExams.length === 0 ? (
							<p className="text-sm text-muted-foreground">
								Belum ada ujian bertipe ini yang sudah dikerjakan — laporan
								akan kosong untuk tabel utama.
							</p>
						) : (
							<div className="flex max-h-44 flex-col gap-1.5 overflow-y-auto rounded-md border p-3">
								{catExams.map((e) => {
									const checked = !excluded.has(e.id);
									return (
										<label
											key={e.id}
											className="flex cursor-pointer items-center gap-2 text-sm"
										>
											<input
												type="checkbox"
												className="size-4 accent-brand-blue-600"
												checked={checked}
												onChange={() => {
													const next = new Set(excluded);
													if (checked) next.add(e.id);
													else next.delete(e.id);
													setExcluded(next);
												}}
											/>
											<span className="min-w-0 flex-1 truncate">
												{e.title}
											</span>
											<Badge variant="outline" className="shrink-0">
												{fmtDateShort(e.scheduledStartAt)}
											</Badge>
										</label>
									);
								})}
							</div>
						)}
						{catExams.length > 0 ? (
							<p className="text-xs text-muted-foreground">
								{includedIds.length} dari {catExams.length} ujian disertakan.
							</p>
						) : null}
					</div>
				) : null}

				<div>
					<Button
						onClick={handlePrint}
						disabled={
							busy ||
							!category ||
							(audience !== "self" && !studentId)
						}
					>
						<Printer className="mr-1.5 size-4" />
						{busy ? "Menyiapkan…" : "Cetak / Unduh PDF"}
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
