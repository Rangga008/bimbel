import { useAuthStore } from "@/stores/auth-store";

const API_BASE_URL =
	process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api";

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

	const res = await fetch(`${API_BASE_URL}${path}`, {
		...rest,
		credentials: "include",
		headers: {
			"Content-Type": "application/json",
			...(auth && accessToken
				? { Authorization: `Bearer ${accessToken}` }
				: {}),
			...headers,
		},
		body: body !== undefined ? JSON.stringify(body) : undefined,
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
				if (!res.ok) return false;
				const data = await res.json();
				if (!data.accessToken) return false;
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

	if (res.status === 401 && options.auth !== false) {
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

export { tryRefreshSession };
