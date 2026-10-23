"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Pagination modern untuk list/tabel client-side.
 * `loadMore` = mode "Muat lebih banyak" (card grid, mobile-friendly);
 * default = pager Prev/Next + indikator halaman (tabel desktop).
 * Beri `pageSize` + `onPageSizeChange` untuk menampilkan select ukuran
 * halaman (mis. 5/10/20/50).
 */
export function ListPager({
	mode = "pager",
	page,
	pageCount,
	total,
	shown,
	onPageChange,
	pageSize,
	onPageSizeChange,
	pageSizeOptions = [5, 10, 20, 50],
	className,
}: {
	mode?: "pager" | "loadMore";
	/** 0-based page index (mode pager). */
	page: number;
	pageCount: number;
	/** Total item di dataset penuh. */
	total: number;
	/** Item yang sedang terlihat (mode loadMore) atau ukuran halaman (pager). */
	shown: number;
	onPageChange: (page: number) => void;
	/** Ukuran halaman aktif — bila diisi beserta onPageSizeChange, select "Tampilkan" muncul. */
	pageSize?: number;
	onPageSizeChange?: (size: number) => void;
	pageSizeOptions?: number[];
	className?: string;
}) {
	if (total === 0) return null;

	const sizeSelect =
		pageSize && onPageSizeChange ? (
			<label className="flex items-center gap-1.5 text-xs text-muted-foreground">
				Tampilkan
				<select
					className="h-8 rounded-md border border-input bg-background px-2 text-xs"
					value={pageSize}
					onChange={(e) => onPageSizeChange(Number(e.target.value))}
				>
					{pageSizeOptions.map((s) => (
						<option key={s} value={s}>{s}</option>
					))}
				</select>
			</label>
		) : null;

	if (mode === "loadMore") {
		if (shown >= total) {
			return (
				<div className={cn("flex flex-wrap items-center justify-between gap-2", className)}>
					<p className="text-xs text-muted-foreground tabular-nums">
						Menampilkan semua {total} data
					</p>
					{sizeSelect}
				</div>
			);
		}
		return (
			<div className={cn("flex flex-col items-center gap-1.5", className)}>
				<Button variant="outline" onClick={() => onPageChange(page + 1)}>
					Muat lebih banyak
				</Button>
				<p className="text-xs text-muted-foreground tabular-nums">
					Menampilkan {shown} dari {total} data
				</p>
			</div>
		);
	}

	if (pageCount <= 1) {
		return (
			<div className={cn("flex flex-wrap items-center justify-between gap-2", className)}>
				<p className="text-xs text-muted-foreground tabular-nums">{total} data</p>
				{sizeSelect}
			</div>
		);
	}

	return (
		<div
			className={cn(
				"flex flex-wrap items-center justify-between gap-2",
				className,
			)}
		>
			<div className="flex items-center gap-3">
				<p className="text-xs text-muted-foreground tabular-nums">
					Halaman {page + 1} dari {pageCount} · {total} data
				</p>
				{sizeSelect}
			</div>
			<div className="flex items-center gap-1">
				<Button
					variant="outline"
					size="icon-sm"
					onClick={() => onPageChange(page - 1)}
					disabled={page <= 0}
					aria-label="Halaman sebelumnya"
				>
					<ChevronLeft className="size-4" />
				</Button>
				<Button
					variant="outline"
					size="icon-sm"
					onClick={() => onPageChange(page + 1)}
					disabled={page >= pageCount - 1}
					aria-label="Halaman berikutnya"
				>
					<ChevronRight className="size-4" />
				</Button>
			</div>
		</div>
	);
}
