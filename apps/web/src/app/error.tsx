"use client";
// Error boundary global — menangkap error render/runtime di semua route dan
// menampilkan penjelasan ramah (bukan stack trace mentah).
import { useEffect } from "react";
import { ApiErrorState } from "@/components/shared/api-error-state";

const CHUNK_RELOAD_KEY = "gfs-chunk-reload-at";
const CHUNK_RELOAD_COOLDOWN_MS = 10_000;

/** ChunkLoadError = versi build baru sudah deploy; halaman lama masih
 *  meminta file chunk ber-hash lama yang sudah tidak ada. Solusinya cukup
 *  muat ulang — lakukan otomatis sekali (dengan cooldown anti-loop). */
function isChunkLoadError(e: unknown): boolean {
	const msg = e instanceof Error ? e.message : String(e ?? "");
	return /loading chunk|chunkloaderror|dynamically imported module/i.test(msg);
}

export default function GlobalError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		// Detail teknis tetap terekam di console untuk debugging.
		console.error("[app-error]", error);
		if (!isChunkLoadError(error)) return;
		try {
			const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) ?? 0);
			if (Date.now() - last > CHUNK_RELOAD_COOLDOWN_MS) {
				sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
				window.location.reload();
			}
		} catch {
			// sessionStorage tak tersedia (mode privat) — biarkan UI error tampil.
		}
	}, [error]);

	return (
		<div className="mx-auto flex min-h-[60vh] max-w-3xl items-center justify-center p-6">
			<ApiErrorState error={error} onRetry={reset} />
		</div>
	);
}
