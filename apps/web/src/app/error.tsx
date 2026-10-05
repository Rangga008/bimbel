"use client";
// Error boundary global — menangkap error render/runtime di semua route dan
// menampilkan penjelasan ramah (bukan stack trace mentah).
import { useEffect } from "react";
import { ApiErrorState } from "@/components/shared/api-error-state";

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
	}, [error]);

	return (
		<div className="mx-auto flex min-h-[60vh] max-w-3xl items-center justify-center p-6">
			<ApiErrorState error={error} onRetry={reset} />
		</div>
	);
}
