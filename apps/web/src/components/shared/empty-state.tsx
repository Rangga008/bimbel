import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Empty state informatif — ikon besar + judul + penjelasan (lihat kaidah UI 05). */
export function EmptyState({
	icon: Icon,
	title,
	description,
	action,
	className,
}: {
	icon: LucideIcon;
	title: string;
	description?: string;
	action?: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"flex flex-col items-center justify-center gap-2 py-10 text-center",
				className,
			)}
		>
			<div className="mb-1 flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
				<Icon size={24} />
			</div>
			<p className="text-sm font-medium">{title}</p>
			{description ? (
				<p className="max-w-sm text-sm text-muted-foreground">{description}</p>
			) : null}
			{action ? <div className="mt-2">{action}</div> : null}
		</div>
	);
}
