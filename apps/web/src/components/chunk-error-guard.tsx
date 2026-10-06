"use client";

import { useEffect } from "react";

const CHUNK_RELOAD_KEY = "gfs-chunk-reload-at";
const CHUNK_RELOAD_COOLDOWN_MS = 10_000;

function isChunkLoadErrorMessage(msg: unknown): boolean {
	const s = typeof msg === "string" ? msg : msg instanceof Error ? msg.message : "";
	return /loading chunk|chunkloaderror|dynamically imported module/i.test(s);
}

/**
 * Menangkap ChunkLoadError yang TIDAK lewat React error boundary — mis.
 * kegagalan prefetch/navigasi client-side setelah deploy baru (file chunk
 * ber-hash lama sudah tidak ada di server). Auto-muat ulang sekali dengan
 * cooldown anti-loop; kalau masih gagal, error boundary akan menampilkan
 * pesan ramah seperti biasa.
 */
export function ChunkErrorGuard() {
	useEffect(() => {
		const tryReload = () => {
			try {
				const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) ?? 0);
				if (Date.now() - last > CHUNK_RELOAD_COOLDOWN_MS) {
					sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
					window.location.reload();
				}
			} catch {
				// sessionStorage tak tersedia — abaikan.
			}
		};

		const onRejection = (e: PromiseRejectionEvent) => {
			if (isChunkLoadErrorMessage(e.reason)) {
				e.preventDefault();
				tryReload();
			}
		};
		const onError = (e: ErrorEvent) => {
			if (isChunkLoadErrorMessage(e.message ?? e.error)) tryReload();
		};

		window.addEventListener("unhandledrejection", onRejection);
		window.addEventListener("error", onError);
		return () => {
			window.removeEventListener("unhandledrejection", onRejection);
			window.removeEventListener("error", onError);
		};
	}, []);

	return null;
}
