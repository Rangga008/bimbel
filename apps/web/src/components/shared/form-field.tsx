"use client";

import type { ComponentProps, ReactNode } from "react";
import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
import { Button, type buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { VariantProps } from "class-variance-authority";

/**
 * Fase 7d — pola field konsisten: label di atas input, tanda * untuk wajib,
 * pesan error inline dengan ikon, hint opsional di bawah input.
 */
export function FormField({
  htmlFor,
  label,
  required = false,
  error,
  hint,
  className,
  children,
}: {
  htmlFor?: string;
  label: string;
  required?: boolean;
  /** Pesan error inline — tampil dengan ikon + warna destructive. */
  error?: string | null;
  /** Catatan kecil di bawah input (tampil kalau tidak ada error). */
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? (
          <span className="ml-0.5 text-destructive" aria-hidden>
            *
          </span>
        ) : null}
      </Label>
      {children}
      {error ? (
        <p role="alert" className="flex items-center gap-1.5 text-xs text-destructive">
          <CircleAlert className="size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/** Indikator valid (✓) di samping kanan input — dipakai saat field sudah terisi valid. */
export function FieldValidIcon({ show }: { show: boolean }) {
  if (!show) return null;
  return <CircleCheck className="size-4 shrink-0 text-success-600" aria-hidden />;
}

/**
 * Tombol submit konsisten: disabled + spinner saat loading.
 * `loadingText` default "Menyimpan...".
 */
export function SubmitButton({
  loading = false,
  loadingText = "Menyimpan...",
  children,
  disabled,
  variant,
  size,
  className,
  ...props
}: Omit<ComponentProps<typeof Button>, "variant" | "size"> &
  VariantProps<typeof buttonVariants> & {
    loading?: boolean;
    loadingText?: string;
  }) {
  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      className={className}
      disabled={disabled || loading}
      aria-busy={loading}
      {...props}
    >
      {loading ? (
        <>
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
          {loadingText}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
