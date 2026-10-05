"use client";
// Penjelasan error HTTP yang ramah pengguna — penyebab + saran perbaikan.
import Link from "next/link";
import { AlertTriangle, Ban, Lock, RefreshCw, SearchX, ServerCrash, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ApiError } from "@/lib/api-client";

interface ErrorInfo {
	title: string;
	cause: string;
	hint: string;
}

export function apiErrorInfo(e: unknown): ErrorInfo & { status?: number } {
	const status = e instanceof ApiError ? e.status : e instanceof TypeError ? 0 : undefined;
	const serverMsg = e instanceof ApiError ? e.message : "";
	switch (status) {
		case 0:
			return {
				status,
				title: "Tidak bisa terhubung ke server",
				cause: "Koneksi internet terputus, atau server API sedang tidak berjalan.",
				hint: "Periksa koneksi internet Anda, lalu coba lagi. Bila masih gagal, hubungi admin.",
			};
		case 400:
			return {
				status,
				title: "Data tidak valid",
				cause: serverMsg || "Permintaan ditolak karena data yang dikirim tidak lengkap atau tidak sesuai aturan.",
				hint: "Periksa kembali isian Anda — kolom wajib, format tanggal/jam, dan nilai yang dipilih.",
			};
		case 401:
			return {
				status,
				title: "Sesi berakhir",
				cause: "Anda belum masuk atau sesi login sudah kedaluwarsa.",
				hint: "Silakan masuk kembali dengan akun Anda.",
			};
		case 403:
			return {
				status,
				title: "Akses ditolak",
				cause: "Akun Anda tidak memiliki izin untuk melihat atau mengubah data ini.",
				hint: "Masuk dengan akun yang sesuai (admin/tutor/ortu), atau minta admin menambahkan izin pada peran Anda.",
			};
		case 404:
			return {
				status,
				title: "Data tidak ditemukan",
				cause: "Data yang diminta sudah dihapus, dipindah, atau tautannya salah.",
				hint: "Kembali ke halaman sebelumnya dan muat ulang daftarnya.",
			};
		case 409:
			return {
				status,
				title: "Bentrok dengan data lain",
				cause: serverMsg || "Aksi ini bentrok dengan data yang sudah ada — mis. tutor/ruangan sudah dipakai di jam yang sama.",
				hint: "Pilih jam, tutor, atau ruangan lain, lalu coba lagi.",
			};
		case 422:
			return {
				status,
				title: "Validasi gagal",
				cause: serverMsg || "Sebagian isian belum memenuhi aturan.",
				hint: "Periksa kembali kolom yang ditandai, lalu kirim ulang.",
			};
		default:
			if (status && status >= 500) {
				return {
					status,
					title: "Gangguan pada server",
					cause: `Server mengembalikan error ${status}${serverMsg ? `: ${serverMsg}` : "."}`,
					hint: "Coba lagi beberapa saat. Bila terus berulang, laporkan ke admin beserta halaman yang sedang dibuka.",
				};
			}
			return {
				status,
				title: "Terjadi kesalahan",
				cause: e instanceof Error ? e.message : "Kesalahan tak terduga pada aplikasi.",
				hint: "Muat ulang halaman. Bila berulang, laporkan ke admin.",
			};
	}
}

const STATUS_ICON: Record<string, typeof Ban> = {
	"0": WifiOff,
	"401": Lock,
	"403": Ban,
	"404": SearchX,
	"409": AlertTriangle,
};

/** Tampilan error siap pakai — judul + penyebab + saran + aksi muat ulang. */
export function ApiErrorState({
	error,
	onRetry,
	homeHref = "/",
}: {
	error: unknown;
	onRetry?: () => void;
	homeHref?: string;
}) {
	const info = apiErrorInfo(error);
	const Icon =
		STATUS_ICON[String(info.status)] ??
		(info.status && info.status >= 500 ? ServerCrash : AlertTriangle);
	return (
		<Card className="mx-auto max-w-lg">
			<CardContent className="flex flex-col items-center gap-3 py-10 text-center">
				<span className="rounded-full bg-destructive/10 p-3 text-destructive">
					<Icon className="size-6" />
				</span>
				<div>
					<p className="text-lg font-semibold">
						{info.status ? `Error ${info.status} — ` : ""}
						{info.title}
					</p>
					<p className="mt-1 text-sm text-muted-foreground">{info.cause}</p>
					<p className="mt-1 text-xs text-muted-foreground">{info.hint}</p>
				</div>
				<div className="flex gap-2">
					{onRetry ? (
						<Button size="sm" variant="outline" onClick={onRetry}>
							<RefreshCw className="size-4" /> Coba Lagi
						</Button>
					) : (
						<Button
							size="sm"
							variant="outline"
							onClick={() => window.location.reload()}
						>
							<RefreshCw className="size-4" /> Muat Ulang
						</Button>
					)}
					<Link href={homeHref}>
						<Button size="sm" variant="ghost">Ke Beranda</Button>
					</Link>
				</div>
			</CardContent>
		</Card>
	);
}
