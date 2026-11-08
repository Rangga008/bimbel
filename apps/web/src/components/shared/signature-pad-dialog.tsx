"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eraser, LoaderCircle, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch, ApiError } from "@/lib/api-client";
import type { MediaAssetItem, MediaCategory } from "./image-picker-field";

const CANVAS_W = 640;
const CANVAS_H = 220;

/**
 * Dialog "tulis tanda tangan" — kanvas untuk menggambar TTD dengan
 * mouse/touch, hasilnya diupload sebagai PNG ke pustaka media dan URL-nya
 * dipakai seperti gambar TTD hasil scan (satu sumber: media FINANCE).
 */
export function SignaturePadDialog({
	open,
	onOpenChange,
	category = "FINANCE",
	onPick,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	category?: MediaCategory;
	onPick: (url: string) => void;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const drawing = useRef(false);
	const last = useRef<{ x: number; y: number } | null>(null);
	const [dirty, setDirty] = useState(false);

	// Cat latar putih agar PNG tidak transparan-hitam saat dicetak — TTD
	// tetap terlihat di atas kertas putih/kwitansi.
	useEffect(() => {
		if (!open) return;
		const cv = canvasRef.current;
		if (!cv) return;
		const ctx = cv.getContext("2d");
		if (!ctx) return;
		ctx.fillStyle = "#ffffff";
		ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
		ctx.lineWidth = 2.5;
		ctx.lineCap = "round";
		ctx.lineJoin = "round";
		ctx.strokeStyle = "#0f172a";
		setDirty(false);
	}, [open]);

	function pos(e: React.PointerEvent<HTMLCanvasElement>) {
		const cv = canvasRef.current!;
		const r = cv.getBoundingClientRect();
		return {
			x: ((e.clientX - r.left) / r.width) * CANVAS_W,
			y: ((e.clientY - r.top) / r.height) * CANVAS_H,
		};
	}

	function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
		e.currentTarget.setPointerCapture(e.pointerId);
		drawing.current = true;
		last.current = pos(e);
	}
	function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
		if (!drawing.current || !last.current) return;
		const ctx = canvasRef.current?.getContext("2d");
		if (!ctx) return;
		const p = pos(e);
		ctx.beginPath();
		ctx.moveTo(last.current.x, last.current.y);
		ctx.lineTo(p.x, p.y);
		ctx.stroke();
		last.current = p;
		setDirty(true);
	}
	function onUp() {
		drawing.current = false;
		last.current = null;
	}

	function clear() {
		const ctx = canvasRef.current?.getContext("2d");
		if (!ctx) return;
		ctx.fillStyle = "#ffffff";
		ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
		setDirty(false);
	}

	const saveM = useMutation({
		mutationFn: async () => {
			const cv = canvasRef.current;
			if (!cv) throw new Error("Kanvas tidak tersedia.");
			const blob = await new Promise<Blob | null>((res) =>
				cv.toBlob(res, "image/png"),
			);
			if (!blob) throw new Error("Gagal membaca gambar tanda tangan.");
			const fd = new FormData();
			fd.append("file", new File([blob], "tanda-tangan.png", { type: "image/png" }));
			fd.append("category", category);
			return apiFetch<MediaAssetItem>("/media", { method: "POST", body: fd });
		},
		onSuccess: (asset) => {
			toast.success("Tanda tangan tersimpan.");
			onPick(asset.url);
			onOpenChange(false);
		},
		onError: (e) =>
			toast.error(
				e instanceof ApiError ? e.message : "Gagal menyimpan tanda tangan.",
			),
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<PenLine className="size-4" /> Tulis Tanda Tangan
					</DialogTitle>
					<DialogDescription>
						Gambar tanda tangan di kotak di bawah (mouse/jari), lalu simpan —
						otomatis tercetak di semua kwitansi seperti TTD hasil scan.
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-3">
					<canvas
						ref={canvasRef}
						width={CANVAS_W}
						height={CANVAS_H}
						onPointerDown={onDown}
						onPointerMove={onMove}
						onPointerUp={onUp}
						onPointerLeave={onUp}
						className="w-full cursor-crosshair rounded-lg border bg-white touch-none"
					/>
					<div className="flex justify-between gap-2">
						<Button type="button" variant="outline" size="sm" onClick={clear}>
							<Eraser className="size-4" /> Bersihkan
						</Button>
						<Button
							type="button"
							size="sm"
							disabled={!dirty || saveM.isPending}
							onClick={() => saveM.mutate()}
						>
							{saveM.isPending ? (
								<LoaderCircle className="size-4 animate-spin" />
							) : (
								<PenLine className="size-4" />
							)}
							Simpan &amp; Pakai
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
