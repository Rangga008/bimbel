"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CircleCheck, Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { SubmitButton } from "@/components/shared/form-field";
import { AuthShell } from "@/components/shared/auth-shell";
import { apiFetch, ApiError } from "@/lib/api-client";

function ResetPasswordForm() {
	const router = useRouter();
	const params = useSearchParams();
	const token = params.get("token") ?? "";
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [done, setDone] = useState(false);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (password !== confirm) {
			toast.error("Konfirmasi kata sandi tidak sama.");
			return;
		}
		setIsSubmitting(true);
		try {
			await apiFetch("/auth/reset-password", {
				method: "POST",
				body: { token, newPassword: password },
				auth: false,
			});
			setDone(true);
			toast.success("Kata sandi berhasil diubah. Silakan masuk.");
			setTimeout(() => router.replace("/login"), 1500);
		} catch (error) {
			const message =
				error instanceof ApiError ? error.message : "Gagal memproses, coba lagi.";
			toast.error(message);
		} finally {
			setIsSubmitting(false);
		}
	}

	if (done) {
		return (
			<>
				<CardHeader className="items-center text-center">
					<span className="mb-1 flex size-12 items-center justify-center rounded-full bg-brand-gold-100 text-brand-gold-700">
						<CircleCheck className="size-6" />
					</span>
					<CardTitle className="text-xl">Kata Sandi Diperbarui</CardTitle>
					<CardDescription>
						Mengalihkan ke halaman masuk...
					</CardDescription>
				</CardHeader>
			</>
		);
	}

	if (!token) {
		return (
			<>
				<CardHeader>
					<CardTitle className="text-xl">Link Tidak Valid</CardTitle>
					<CardDescription>
						Link reset tidak membawa token. Minta link baru lewat halaman lupa
						kata sandi.
					</CardDescription>
				</CardHeader>
			</>
		);
	}

	return (
		<>
			<CardHeader>
				<CardTitle className="text-xl">Kata Sandi Baru</CardTitle>
				<CardDescription>
					Buat kata sandi baru untuk akun Anda (minimal 8 karakter).
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form className="flex flex-col gap-4" onSubmit={handleSubmit}>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="password">Kata Sandi Baru</Label>
						<div className="relative">
							<Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								id="password"
								type="password"
								autoComplete="new-password"
								className="pl-9"
								minLength={8}
								required
								value={password}
								onChange={(e) => setPassword(e.target.value)}
							/>
						</div>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="confirm">Ulangi Kata Sandi</Label>
						<div className="relative">
							<Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								id="confirm"
								type="password"
								autoComplete="new-password"
								className="pl-9"
								minLength={8}
								required
								value={confirm}
								onChange={(e) => setConfirm(e.target.value)}
							/>
						</div>
					</div>
					<SubmitButton
						loading={isSubmitting}
						loadingText="Menyimpan..."
						className="w-full"
					>
						Simpan Kata Sandi
					</SubmitButton>
				</form>
			</CardContent>
		</>
	);
}

export default function ResetPasswordPage() {
	return (
		<AuthShell
			footerLink={{ href: "/login", label: "Kembali ke halaman masuk" }}
		>
			<Card className="w-full shadow-2xl shadow-black/25">
				<Suspense>
					<ResetPasswordForm />
				</Suspense>
			</Card>
		</AuthShell>
	);
}
