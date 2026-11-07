"use client";

import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function formatRupiah(value: string | number | null | undefined) {
	if (value === null || value === undefined || value === "") return "";
	const n = Number(String(value).replace(/\./g, ""));
	if (Number.isNaN(n)) return "";
	return `Rp${n.toLocaleString("id-ID")}`;
}

function sanitizeAmount(value: string, allowNegative: boolean) {
	const negative = allowNegative && value.trimStart().startsWith("-");
	const digits = value.replace(/\D/g, "");
	return `${negative ? "-" : ""}${digits}`;
}

function displayAmount(value: string | number | undefined, allowNegative: boolean) {
	const raw = sanitizeAmount(String(value ?? ""), allowNegative);
	if (!raw || raw === "-") return raw;
	const negative = raw.startsWith("-");
	const digits = raw.replace(/\D/g, "");
	return `${negative ? "-" : ""}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

/**
 * Input nominal uang: pengguna mengetik angka seperti biasa, tampilan otomatis
 * diberi pemisah ribuan dan nilai terformat Rupiah ditampilkan di bawahnya.
 * Nilai yang dikirim ke parent tetap digit murni ("2000000").
 */
export function CurrencyInput({
	id,
	label,
	value,
	onChange,
	className,
	allowNegative = false,
	showPreview = true,
	...props
}: Omit<ComponentProps<typeof Input>, "value" | "onChange" | "type"> & {
	label?: string;
	value: string | number;
	onChange: (value: string) => void;
	allowNegative?: boolean;
	showPreview?: boolean;
}) {
	const raw = sanitizeAmount(String(value ?? ""), allowNegative);
	const preview = formatRupiah(raw);
	return (
		<div className="flex flex-col gap-1.5">
			{label ? (
				<label htmlFor={id} className="text-sm font-medium leading-none">
					{label}
				</label>
			) : null}
			<div className="flex flex-col gap-1">
				<div className="relative">
					<span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
						Rp
					</span>
					<Input
						id={id}
						type="text"
						inputMode="numeric"
						value={displayAmount(raw, allowNegative)}
						onChange={(e) => onChange(sanitizeAmount(e.target.value, allowNegative))}
						className={cn("pl-10", className)}
						{...props}
					/>
				</div>
				{showPreview && preview ? (
					<p className="text-xs text-muted-foreground">Terbaca: {preview}</p>
				) : null}
			</div>
		</div>
	);
}
