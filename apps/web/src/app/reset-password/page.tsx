"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, CircleCheck, Lock } from "lucide-react";
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
import { apiFetch, ApiError } from "@/lib/api-client";
import { useBranding } from "@/lib/use-branding";

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
	const branding = useBranding();
	return (
		<div
			className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden p-4"
			style={{
				backgroundImage:
					"linear-gradient(150deg, #032a41 0%, #074c74 45%, #0c5d8d 80%, #0f77b4 100%)",
			}}
		>
			<div
				aria-hidden
				className="absolute -top-32 -right-24 size-80 rounded-full bg-brand-blue-500/25 blur-3xl"
			/>
			<div
				aria-hidden
				className="absolute -bottom-32 -left-24 size-80 rounded-full bg-brand-gold-400/15 blur-3xl"
			/>
			<div
				aria-hidden
				className="absolute inset-0 opacity-[0.06]"
				style={{
					backgroundImage:
						"linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
					backgroundSize: "56px 56px",
				}}
			/>
			<div className="relative flex w-full max-w-sm flex-col gap-6">
				<div className="flex flex-col items-center gap-3 text-center">
					<Image
						src={branding.resolvedLogoUrl}
						alt={`Logo ${branding.appName}`}
						width={56}
						height={56}
						className="size-14 rounded-xl bg-white/90 p-1.5 object-contain"
						priority
						unoptimized
					/>
					<p className="text-lg font-semibold text-white">{branding.appName}</p>
				</div>
				<Card className="shadow-2xl">
					<Suspense>
						<ResetPasswordForm />
					</Suspense>
				</Card>
				<p className="text-center text-sm text-brand-blue-200">
					<Link
						href="/login"
						className="inline-flex items-center gap-1.5 hover:text-white"
					>
						<ArrowLeft className="size-4" />
						Kembali ke halaman masuk
					</Link>
				</p>
			</div>
		</div>
	);
}
