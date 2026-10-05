"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";
import { ArrowLeft, Mail, MailCheck } from "lucide-react";
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

export default function ForgotPasswordPage() {
	const branding = useBranding();
	const [email, setEmail] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [sent, setSent] = useState(false);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setIsSubmitting(true);
		try {
			await apiFetch("/auth/forgot-password", {
				method: "POST",
				body: { email },
				auth: false,
			});
			setSent(true);
		} catch (error) {
			const message =
				error instanceof ApiError ? error.message : "Gagal memproses, coba lagi.";
			toast.error(message);
		} finally {
			setIsSubmitting(false);
		}
	}

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
					{sent ? (
						<>
							<CardHeader className="items-center text-center">
								<span className="mb-1 flex size-12 items-center justify-center rounded-full bg-brand-gold-100 text-brand-gold-700">
									<MailCheck className="size-6" />
								</span>
								<CardTitle className="text-xl">Cek Email Anda</CardTitle>
								<CardDescription>
									Jika email terdaftar, link reset kata sandi sudah dikirim ke{" "}
									<span className="font-medium text-foreground">{email}</span>.
									Link berlaku 30 menit.
								</CardDescription>
							</CardHeader>
							<CardContent>
								<p className="text-center text-xs text-muted-foreground">
									Tidak menerima email? Periksa folder spam atau hubungi admin.
								</p>
							</CardContent>
						</>
					) : (
						<>
							<CardHeader>
								<CardTitle className="text-xl">Lupa Kata Sandi</CardTitle>
								<CardDescription>
									Masukkan email akun Anda — kami kirim link untuk membuat kata
									sandi baru.
								</CardDescription>
							</CardHeader>
							<CardContent>
								<form className="flex flex-col gap-4" onSubmit={handleSubmit}>
									<div className="flex flex-col gap-1.5">
										<Label htmlFor="email">Email</Label>
										<div className="relative">
											<Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
											<Input
												id="email"
												type="email"
												autoComplete="username"
												placeholder="nama@email.com"
												className="pl-9"
												required
												value={email}
												onChange={(e) => setEmail(e.target.value)}
											/>
										</div>
									</div>
									<SubmitButton
										loading={isSubmitting}
										loadingText="Mengirim..."
										className="w-full"
									>
										Kirim Link Reset
									</SubmitButton>
								</form>
							</CardContent>
						</>
					)}
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
