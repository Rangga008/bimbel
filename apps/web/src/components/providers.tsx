"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export function Providers({ children }: { children: ReactNode }) {
	const [queryClient] = useState(
		() =>
			new QueryClient({
				defaultOptions: {
					queries: {
						retry: (failureCount, error: unknown) => {
							// Jangan retry error auth (401/403) — itu sesi/token,
							// bukan gangguan jaringan sesaat. Retry di sini yang
							// mengubah 1x 401 menjadi badai puluhan request.
							if (
								typeof error === "object" &&
								error !== null &&
								"status" in error &&
								(error as { status: unknown }).status !== undefined &&
								[401, 403].includes(
									Number((error as { status: unknown }).status),
								)
							) {
								return false;
							}
							return failureCount < 1;
						},
						refetchOnWindowFocus: false,
					},
				},
			}),
	);

	return (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	);
}
