"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

/** Badge status verifikasi No. HP + tombol "Verifikasi" manual untuk admin —
 *  dipakai saat OTP WhatsApp tidak sampai. Render null bila user tanpa HP. */
export function PhoneVerifyBadge({
	userId,
	phone,
	phoneVerifiedAt,
	invalidateKey,
	canManage,
}: {
	userId: string;
	phone: string | null;
	phoneVerifiedAt?: string | null;
	/** Query key yang di-invalidate setelah verifikasi — mis. ['students', id]. */
	invalidateKey: unknown[];
	canManage: boolean;
}) {
	const qc = useQueryClient();
	const [open, setOpen] = useState(false);
	const m = useMutation({
		mutationFn: () =>
			apiFetch(`/users/${userId}/verify-phone`, { method: "POST" }),
		onSuccess: () => {
			toast.success("Nomor HP ditandai terverifikasi.");
			setOpen(false);
			qc.invalidateQueries({ queryKey: invalidateKey });
		},
		onError: (e) =>
			toast.error(
				e instanceof ApiError
					? e.message
					: "Gagal memverifikasi nomor HP.",
			),
	});

	if (!phone) return null;

	if (phoneVerifiedAt) {
		return (
			<Badge
				variant="secondary"
				className="gap-1 border border-emerald-200 bg-emerald-50 text-emerald-700"
			>
				<ShieldCheck className="size-3" /> HP terverifikasi
			</Badge>
		);
	}

	return (
		<span className="inline-flex items-center gap-1.5">
			<Badge
				variant="outline"
				className="gap-1 border-amber-300 bg-amber-50 text-amber-700"
			>
				<ShieldAlert className="size-3" /> HP belum terverifikasi
			</Badge>
			{canManage ? (
				<>
					<Button
						type="button"
						size="sm"
						variant="outline"
						className="h-6 px-2 text-[11px]"
						onClick={() => setOpen(true)}
					>
						Verifikasi
					</Button>
					<ConfirmDialog
						open={open}
						onOpenChange={setOpen}
						title="Verifikasi nomor HP?"
						description={`Nomor ${phone} akan ditandai terverifikasi secara manual — dipakai saat OTP WhatsApp tidak sampai. Pastikan nomor sudah dikonfirmasi ke pemiliknya.`}
						confirmLabel="Ya, verifikasi"
						tone="primary"
						pending={m.isPending}
						onConfirm={() => m.mutate()}
					/>
				</>
			) : null}
		</span>
	);
}
