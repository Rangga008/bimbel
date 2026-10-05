import { useAuthStore } from "@/stores/auth-store";

const API_BASE_URL =
	process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api";

const API_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, "");

/**
 * Ubah path relatif API (mis. `/api/media/<id>/file` dari pustaka gambar)
 * menjadi URL absolut ke origin API. URL eksternal (http/https) apa adanya.
 */
export function resolveAssetUrl(url: string | null | undefined): string {
	if (!url) return "";
	if (url.startsWith("/api/")) return `${API_ORIGIN}${url}`;
	return url;
}

export class ApiError extends Error {
	constructor(
		message: string,
		public status: number,
	) {
		super(message);
	}
}

interface RequestOptions extends Omit<RequestInit, "body"> {
	body?: unknown;
	/** Set false untuk endpoint publik (login) supaya tidak mencoba refresh saat 401. */
	auth?: boolean;
}

async function rawRequest(path: string, options: RequestOptions = {}) {
	const { body, headers, auth = true, ...rest } = options;
	const accessToken = useAuthStore.getState().accessToken;
	const isFormData =
		typeof FormData !== "undefined" && body instanceof FormData;

	const res = await fetch(`${API_BASE_URL}${path}`, {
		...rest,
		credentials: "include",
		headers: {
			// FormData: biarkan browser set boundary multipart sendiri.
			...(isFormData ? {} : { "Content-Type": "application/json" }),
			...(auth && accessToken
				? { Authorization: `Bearer ${accessToken}` }
				: {}),
			...headers,
		},
		body:
			body === undefined
				? undefined
				: isFormData
					? (body as FormData)
					: JSON.stringify(body),
	});

	return res;
}

let refreshPromise: Promise<boolean> | null = null;

async function tryRefreshSession(): Promise<boolean> {
	if (!refreshPromise) {
		refreshPromise = (async () => {
			try {
				const res = await rawRequest("/auth/refresh", {
					method: "POST",
					auth: false,
				});
				// Refresh gagal permanen (cookie hilang/kedaluwarsa/direvoke):
				// bersihkan sesi lokal supaya tidak retry tanpa henti (badai 401).
				if (res.status === 400 || res.status === 401 || res.status === 403) {
					useAuthStore.getState().clearSession();
					return false;
				}
				if (!res.ok) return false;
				const data = await res.json();
				if (!data.accessToken) {
					useAuthStore.getState().clearSession();
					return false;
				}
				useAuthStore.getState().setSession(data.accessToken, data.user);
				return true;
			} catch {
				return false;
			} finally {
				refreshPromise = null;
			}
		})();
	}
	return refreshPromise;
}

/** Wrapper fetch ke backend: menyertakan Authorization header & auto-retry sekali setelah refresh saat 401. */
export async function apiFetch<T = unknown>(
	path: string,
	options: RequestOptions = {},
): Promise<T> {
	let res = await rawRequest(path, options);

	// Jangan mencoba refresh untuk endpoint auth sendiri (login/refresh) —
	// kalau tidak, 1x gagal login berubah jadi 2x request + potensi loop.
	const isAuthEndpoint = path.startsWith("/auth/");
	if (res.status === 401 && options.auth !== false && !isAuthEndpoint) {
		const refreshed = await tryRefreshSession();
		if (refreshed) {
			res = await rawRequest(path, options);
		}
	}

	if (!res.ok) {
		const errorBody = await res
			.json()
			.catch(() => ({ message: "Terjadi kesalahan." }));
		throw new ApiError(errorBody.message ?? "Terjadi kesalahan.", res.status);
	}

	if (res.status === 204) return undefined as T;
	return res.json() as Promise<T>;
}

/**
 * Fetch file/blob (mis. file bukti pembayaran) dengan auth header yang sama.
 * Dipakai untuk membuka lampiran terproteksi — link <a href> biasa tidak
 * membawa Authorization header.
 */
export async function apiFetchBlob(path: string): Promise<Blob> {
	let res = await rawRequest(path);
	if (res.status === 401) {
		const refreshed = await tryRefreshSession();
		if (refreshed) res = await rawRequest(path);
	}
	if (!res.ok) {
		const errorBody = await res
			.json()
			.catch(() => ({ message: "Terjadi kesalahan." }));
		throw new ApiError(errorBody.message ?? "Terjadi kesalahan.", res.status);
	}
	return res.blob();
}

export { tryRefreshSession };
