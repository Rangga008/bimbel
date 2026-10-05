"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Pagination modern untuk list/tabel client-side.
 * `loadMore` = mode "Muat lebih banyak" (card grid, mobile-friendly);
 * default = pager Prev/Next + indikator halaman (tabel desktop).
 */
export function ListPager({
	mode = "pager",
	page,
	pageCount,
	total,
	shown,
	onPageChange,
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
	className?: string;
}) {
	if (total === 0) return null;

	if (mode === "loadMore") {
		if (shown >= total) {
			return (
				<p
					className={cn(
						"text-center text-xs text-muted-foreground tabular-nums",
						className,
					)}
				>
					Menampilkan semua {total} data
				</p>
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
			<p
				className={cn(
					"text-xs text-muted-foreground tabular-nums",
					className,
				)}
			>
				{total} data
			</p>
		);
	}

	return (
		<div
			className={cn(
				"flex flex-wrap items-center justify-between gap-2",
				className,
			)}
		>
			<p className="text-xs text-muted-foreground tabular-nums">
				Halaman {page + 1} dari {pageCount} · {total} data
			</p>
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
