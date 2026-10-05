import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Fase 7d — skeleton loading yang menyerupai konten asli.
 * `SkeletonCards` untuk grid kartu, `SkeletonRows` untuk list/tabel.
 */
export function SkeletonCards({
  count = 6,
  className,
  cardClassName,
}: {
  count?: number;
  className?: string;
  cardClassName?: string;
}) {
  return (
    <div className={cn("grid gap-3 md:grid-cols-2 xl:grid-cols-3", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={cn("rounded-xl border bg-card p-4", cardClassName)}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="mt-3 h-6 w-28" />
          <Skeleton className="mt-2 h-3 w-40" />
        </div>
      ))}
    </div>
  );
}

/** Baris skeleton menyerupai tabel data (dipakai di dalam container bordered). */
export function SkeletonTableRows({
  rows = 6,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("overflow-hidden rounded-xl border", className)}>
      <div className="flex items-center gap-4 border-b bg-muted px-3 py-2.5">
        <Skeleton className="h-3 w-10" />
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="ml-auto h-3 w-16" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b px-3 py-3 last:border-0">
          <Skeleton className="size-8 rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-36" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}
