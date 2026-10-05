"use client";

import { LoaderCircle, TriangleAlert, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Fase 7d — dialog konfirmasi aksi berisiko.
 * tone "destructive": tombol merah + ikon warning (hapus, void, lock).
 * tone "primary": tombol biru + ikon info (kumpulkan ujian, dsb).
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Ya, lanjutkan",
  cancelLabel = "Batal",
  tone = "destructive",
  pending = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "destructive" | "primary";
  pending?: boolean;
  onConfirm: () => void;
}) {
  const destructive = tone === "destructive";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-xl",
              destructive ? "bg-destructive/10 text-destructive" : "bg-brand-blue-50 text-brand-blue-600",
            )}
          >
            {destructive ? (
              <TriangleAlert className="size-5" aria-hidden />
            ) : (
              <Info className="size-5" aria-hidden />
            )}
          </div>
          <DialogHeader className="gap-1 text-left">
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={pending}
            aria-busy={pending}
          >
            {pending ? (
              <>
                <LoaderCircle className="size-4 animate-spin" aria-hidden />
                Memproses...
              </>
            ) : (
              confirmLabel
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
