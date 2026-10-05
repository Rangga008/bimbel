"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Form ubah kata sandi mandiri (dipakai halaman Profil/Pengaturan semua role).
 * Backend merevoke semua refresh token setelah sukses — user diarahkan login ulang.
 */
export function ChangePasswordCard() {
	const router = useRouter();
	const clearSession = useAuthStore((s) => s.clearSession);
	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (newPassword.length < 8) {
			toast.error("Kata sandi baru minimal 8 karakter.");
			return;
		}
		if (newPassword !== confirmPassword) {
			toast.error("Konfirmasi kata sandi baru tidak sama.");
			return;
		}
		setIsSubmitting(true);
		try {
			await apiFetch("/auth/change-password", {
				method: "POST",
				body: { currentPassword, newPassword },
			});
			toast.success(
				"Kata sandi berhasil diubah. Silakan login ulang dengan kata sandi baru.",
			);
			clearSession();
			router.push("/login");
		} catch (error) {
			toast.error(
				error instanceof ApiError
					? error.message
					: "Gagal mengubah kata sandi.",
			);
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Ubah Kata Sandi</CardTitle>
				<CardDescription>
					Setelah berhasil, Anda akan diminta login ulang di semua perangkat.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form onSubmit={handleSubmit} className="grid max-w-md gap-4">
					<div className="grid gap-2">
						<Label htmlFor="cp-current">Kata sandi saat ini</Label>
						<Input
							id="cp-current"
							type="password"
							autoComplete="current-password"
							required
							value={currentPassword}
							onChange={(e) => setCurrentPassword(e.target.value)}
						/>
					</div>
					<div className="grid gap-2">
						<Label htmlFor="cp-new">Kata sandi baru (min. 8 karakter)</Label>
						<Input
							id="cp-new"
							type="password"
							autoComplete="new-password"
							required
							minLength={8}
							value={newPassword}
							onChange={(e) => setNewPassword(e.target.value)}
						/>
					</div>
					<div className="grid gap-2">
						<Label htmlFor="cp-confirm">Ulangi kata sandi baru</Label>
						<Input
							id="cp-confirm"
							type="password"
							autoComplete="new-password"
							required
							value={confirmPassword}
							onChange={(e) => setConfirmPassword(e.target.value)}
						/>
					</div>
					<div>
						<Button type="submit" disabled={isSubmitting}>
							{isSubmitting ? "Menyimpan..." : "Simpan Kata Sandi"}
						</Button>
					</div>
				</form>
			</CardContent>
		</Card>
	);
}
