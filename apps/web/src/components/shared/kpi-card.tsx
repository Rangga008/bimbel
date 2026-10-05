import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

type KpiTone = "default" | "success" | "warning" | "danger" | "gold";

const TONE_CHIP: Record<KpiTone, string> = {
	default: "bg-brand-blue-50 text-brand-blue-600",
	success: "bg-success-600/10 text-success-600",
	warning: "bg-warning-500/15 text-warning-600",
	danger: "bg-destructive/10 text-destructive",
	gold: "bg-brand-gold-400/15 text-brand-gold-700",
};

/** Kartu KPI dashboard — ikon relevan + angka besar (tabular-nums) + hint konteks. */
export function KpiCard({
	icon: Icon,
	label,
	value,
	hint,
	tone = "default",
}: {
	icon: LucideIcon;
	label: string;
	value: string | number;
	hint?: string;
	tone?: KpiTone;
}) {
	return (
		<Card>
			<CardContent className="flex items-center gap-3 py-4">
				<div
					className={cn(
						"flex size-10 shrink-0 items-center justify-center rounded-lg",
						TONE_CHIP[tone],
					)}
				>
					<Icon size={20} />
				</div>
				<div className="min-w-0">
					<p className="truncate text-xs text-muted-foreground">{label}</p>
					<p className="truncate text-xl font-semibold tabular-nums">{value}</p>
					{hint ? (
						<p className="truncate text-xs text-muted-foreground">{hint}</p>
					) : null}
				</div>
			</CardContent>
		</Card>
	);
}
