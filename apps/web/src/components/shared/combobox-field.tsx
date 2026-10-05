"use client";

import { Combobox } from "@base-ui/react/combobox";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveAssetUrl } from "@/lib/api-client";
import { FormField } from "./form-field";

export interface ComboboxOption {
	value: string;
	label: string;
	/** Opsional: foto profil yang ditampilkan di item dropdown (picker user). */
	imageUrl?: string | null;
}

/**
 * Dropdown searchable (Base UI Combobox) — pengganti <select> untuk daftar
 * opsi yang panjang. Ketik untuk memfilter, Enter/klik untuk memilih,
 * tombol × untuk mengosongkan. Punya <input type="hidden" name={id}> supaya
 * validasi native `required` & FormData tetap bekerja seperti <select> biasa.
 */
export function ComboboxField({
	id,
	label,
	value,
	onChange,
	options,
	placeholder = "Ketik untuk mencari...",
	emptyText = "Tidak ada opsi yang cocok.",
	required = false,
	disabled = false,
	error,
	hint,
}: {
	id: string;
	label?: string;
	value: string;
	onChange: (value: string) => void;
	options: ComboboxOption[];
	placeholder?: string;
	emptyText?: string;
	required?: boolean;
	disabled?: boolean;
	error?: string | null;
	hint?: string;
}) {
	const selected = options.find((o) => o.value === value) ?? null;

	const field = (
		<Combobox.Root
			items={options}
			value={selected}
			onValueChange={(item) => onChange(item?.value ?? "")}
			disabled={disabled}
			itemToStringLabel={(item: ComboboxOption) => item.label}
			itemToStringValue={(item: ComboboxOption) => item.value}
			name={id}
			required={required}
			autoHighlight
		>
			<div className="relative">
				<Combobox.Input
					id={id}
					placeholder={selected ? selected.label : placeholder}
					aria-invalid={error ? true : undefined}
					className={cn(
						"h-9 w-full rounded-lg border border-input bg-input/30 px-3 pr-16 text-sm outline-none transition-colors",
						"placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
						"disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
						"aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20",
					)}
				/>
				<div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
					{value ? (
						<Combobox.Clear
							aria-label="Hapus pilihan"
							className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
						>
							<X className="size-3.5" />
						</Combobox.Clear>
					) : null}
					<Combobox.Trigger
						aria-label="Buka daftar"
						className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					>
						<ChevronsUpDown className="size-4" />
					</Combobox.Trigger>
				</div>
			</div>
			<Combobox.Portal>
				<Combobox.Positioner sideOffset={4} className="z-50">
					<Combobox.Popup className="max-h-80 w-(--anchor-width) overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg">
						<Combobox.Empty className="px-3 py-4 text-center text-sm text-muted-foreground">
							{emptyText}
						</Combobox.Empty>
						<Combobox.List className="max-h-80 overflow-y-auto p-1">
							{(option: ComboboxOption) => (
								<Combobox.Item
									key={option.value}
									value={option}
									className={cn(
										"flex cursor-default items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none",
										"data-highlighted:bg-muted data-selected:font-medium",
									)}
								>
									<Combobox.ItemIndicator className="flex size-4 items-center justify-center">
										<Check className="size-3.5 text-brand-blue-600" />
									</Combobox.ItemIndicator>
									{option.imageUrl ? (
										// eslint-disable-next-line @next/next/no-img-element
										<img src={resolveAssetUrl(option.imageUrl)} alt="" className="size-6 shrink-0 rounded-full object-cover" />
									) : null}
									<span className="truncate">{option.label}</span>
								</Combobox.Item>
							)}
						</Combobox.List>
					</Combobox.Popup>
				</Combobox.Positioner>
			</Combobox.Portal>
		</Combobox.Root>
	);

	if (!label) return field;
	return (
		<FormField htmlFor={id} label={label} required={required} error={error} hint={hint}>
			{field}
		</FormField>
	);
}
