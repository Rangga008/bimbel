"use client";

import { cn } from "@/lib/utils";

interface BarDatum {
	label: string;
	value: number;
	/** Nilai opsional bar kedua (mis. kas keluar vs masuk). */
	value2?: number;
	title?: string;
}

/**
 * Grafik batang mini murni CSS/SVG — ringan, tanpa dependensi chart.
 * Dipakai dashboard untuk tren nilai, kas masuk/keluar, kehadiran mingguan.
 */
export function MiniBars({
	data,
	suffix = "",
	height = 96,
	colorClass = "bg-brand-blue-500",
	color2Class = "bg-neutral-300",
	legend,
	formatValue,
}: {
	data: BarDatum[];
	suffix?: string;
	height?: number;
	colorClass?: string;
	color2Class?: string;
	legend?: [string, string];
	/** Format label nilai di atas bar — default Math.round+suffix. */
	formatValue?: (v: number) => string;
}) {
	if (data.length === 0) return null;
	const max = Math.max(
		...data.flatMap((d) => [d.value, d.value2 ?? 0]),
		1,
	);
	return (
		<div className="flex flex-col gap-1">
			{legend ? (
				<div className="flex gap-3 text-[10px] text-muted-foreground">
					<span className="flex items-center gap-1">
						<span className={cn("inline-block size-2 rounded-sm", colorClass)} />
						{legend[0]}
					</span>
					<span className="flex items-center gap-1">
						<span className={cn("inline-block size-2 rounded-sm", color2Class)} />
						{legend[1]}
					</span>
				</div>
			) : null}
			<div
				className="flex items-end gap-1.5"
				style={{ height }}
			>
				{data.map((d, i) => (
					<div
						key={i}
						className="flex min-w-0 flex-1 flex-col items-center gap-0.5"
						title={d.title ?? `${d.label}: ${formatValue ? formatValue(d.value) : `${Math.round(d.value)}${suffix}`}`}
					>
						<span className="text-[9px] tabular-nums text-muted-foreground">
							{formatValue
								? formatValue(d.value)
								: `${Math.round(d.value)}${suffix}`}
						</span>
						<div className="flex h-full w-full items-end justify-center gap-0.5">
							<div
								className={cn("w-3 max-w-5 rounded-t", colorClass)}
								style={{ height: `${(d.value / max) * 100}%` }}
							/>
							{d.value2 !== undefined ? (
								<div
									className={cn("w-3 max-w-5 rounded-t", color2Class)}
									style={{ height: `${(d.value2 / max) * 100}%` }}
								/>
							) : null}
						</div>
						<span className="max-w-full truncate text-[9px] text-muted-foreground">
							{d.label}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}
