"use client";

import { cn } from "@/lib/utils";

/**
 * Status pendaftaran sebagai kartu segmented — lebih mudah dipindai daripada
 * pill kecil, dan tab aktif punya penekanan jelas seperti tab browser aktif.
 */
export function EnrollmentStatusTabs({
	options,
	value,
	countOf,
	onChange,
}: {
	options: { value: string; label: string }[];
	value: string;
	countOf: (status: string) => number;
	onChange: (status: string) => void;
}) {
	return (
		<div
			className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6"
			role="tablist"
			aria-label="Filter status pendaftaran"
		>
			{options.map((option) => {
				const active = value === option.value;
				return (
					<button
						key={option.value || "all"}
						type="button"
						role="tab"
						aria-selected={active}
						onClick={() => onChange(option.value)}
						className={cn(
							"group flex min-h-16 flex-col justify-between rounded-xl border bg-card p-3 text-left shadow-sm transition-all",
							"hover:-translate-y-0.5 hover:border-primary/60 hover:shadow",
							active
								? "border-primary bg-primary/10 ring-2 ring-primary/25"
								: "border-border",
						)}
					>
						<span
							className={cn(
								"text-xs leading-snug",
								active
									? "font-semibold text-foreground"
									: "font-medium text-muted-foreground group-hover:text-foreground",
							)}
						>
							{option.label}
						</span>
						<span
							className={cn(
								"mt-2 inline-flex w-fit min-w-7 items-center justify-center rounded-full px-2 py-0.5 text-sm font-semibold tabular-nums",
								active
									? "bg-primary text-primary-foreground"
									: "bg-muted text-foreground",
							)}
						>
							{countOf(option.value)}
						</span>
					</button>
				);
			})}
		</div>
	);
}
