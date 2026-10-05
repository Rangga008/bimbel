import { useEffect, useState } from "react";

/**
 * Kembalikan nilai yang baru berubah setelah user berhenti mengetik `delay` ms.
 * Dipakai untuk query server-side agar tidak request di tiap keystroke —
 * input tetap terasa instan, fetch-nya yang di-debounce.
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
	const [debounced, setDebounced] = useState(value);

	useEffect(() => {
		const t = setTimeout(() => setDebounced(value), delay);
		return () => clearTimeout(t);
	}, [value, delay]);

	return debounced;
}
