"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Mail, MailCheck } from "lucide-react";
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

export default function ForgotPasswordPage() {
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
		<AuthShell
			footerLink={{ href: "/login", label: "Kembali ke halaman masuk" }}
		>
			<Card className="w-full shadow-2xl shadow-black/25">
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
		</AuthShell>
	);
}
