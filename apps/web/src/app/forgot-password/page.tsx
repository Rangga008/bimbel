"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
	CircleCheck,
	KeyRound,
	Lock,
	Mail,
	MessageCircle,
	ShieldCheck,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
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

interface RequestResetResponse {
	sent: boolean;
	channel: "EMAIL" | "WHATSAPP";
	destination: string;
	expiresInMinutes: number;
}

function errorMessage(error: unknown, fallback: string) {
	return error instanceof ApiError ? error.message : fallback;
}

export default function ForgotPasswordPage() {
	const router = useRouter();
	const [identifier, setIdentifier] = useState("");
	const [otp, setOtp] = useState("");
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [sentInfo, setSentInfo] = useState<RequestResetResponse | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isResending, setIsResending] = useState(false);
	const [done, setDone] = useState(false);

	async function requestCode() {
		const res = await apiFetch<RequestResetResponse>("/auth/forgot-password", {
			method: "POST",
			body: { identifier },
			auth: false,
		});
		setSentInfo(res);
	}

	async function handleRequest(e: React.FormEvent) {
		e.preventDefault();
		setIsSubmitting(true);
		try {
			await requestCode();
		} catch (error) {
			toast.error(errorMessage(error, "Gagal mengirim kode OTP, coba lagi."));
		} finally {
			setIsSubmitting(false);
		}
	}

	async function handleResend() {
		setIsResending(true);
		try {
			await requestCode();
			toast.success("Kode OTP baru dikirim bila akun terdaftar.");
		} catch (error) {
			toast.error(errorMessage(error, "Gagal mengirim ulang kode."));
		} finally {
			setIsResending(false);
		}
	}

	async function handleReset(e: React.FormEvent) {
		e.preventDefault();
		if (password !== confirm) {
			toast.error("Konfirmasi kata sandi tidak sama.");
			return;
		}
		setIsSubmitting(true);
		try {
			await apiFetch("/auth/reset-password", {
				method: "POST",
				body: { identifier, otp, newPassword: password },
				auth: false,
			});
			setDone(true);
			toast.success("Kata sandi berhasil diubah. Silakan masuk.");
			setTimeout(() => router.replace("/login"), 1400);
		} catch (error) {
			toast.error(errorMessage(error, "Gagal mereset kata sandi."));
		} finally {
			setIsSubmitting(false);
		}
	}

	const ChannelIcon = sentInfo?.channel === "EMAIL" ? Mail : MessageCircle;

	return (
		<AuthShell footerLink={{ href: "/login", label: "Kembali ke halaman masuk" }}>
			<Card className="w-full shadow-2xl shadow-black/25">
				{done ? (
					<CardHeader className="items-center text-center">
						<span className="mb-1 flex size-12 items-center justify-center rounded-full bg-brand-gold-100 text-brand-gold-700">
							<CircleCheck className="size-6" />
						</span>
						<CardTitle className="text-xl">Kata Sandi Diperbarui</CardTitle>
						<CardDescription>Mengalihkan ke halaman masuk...</CardDescription>
					</CardHeader>
				) : sentInfo ? (
					<>
						<CardHeader className="items-center text-center">
							<span className="mb-1 flex size-12 items-center justify-center rounded-full bg-brand-gold-100 text-brand-gold-700">
								<ChannelIcon className="size-6" />
							</span>
							<CardTitle className="text-xl">Masukkan Kode OTP</CardTitle>
							<CardDescription>
								Jika akun terdaftar, kode {sentInfo.expiresInMinutes} menit sudah
								dikirim ke{" "}
								<span className="font-medium text-foreground">
									{sentInfo.destination}
								</span>{" "}
								melalui {sentInfo.channel === "EMAIL" ? "email" : "WhatsApp"}.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<form className="flex flex-col gap-4" onSubmit={handleReset}>
								<div className="flex flex-col gap-1.5">
									<Label htmlFor="otp">Kode OTP</Label>
									<div className="relative">
										<ShieldCheck className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
										<Input
											id="otp"
											type="text"
											inputMode="numeric"
											autoComplete="one-time-code"
											placeholder="6 digit"
											minLength={6}
											maxLength={6}
											className="pl-9 text-center tracking-[0.4em]"
											required
											value={otp}
											onChange={(e) =>
												setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
											}
										/>
									</div>
								</div>
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
								<div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
									<button
										type="button"
										className="hover:text-foreground hover:underline"
										onClick={() => {
											setSentInfo(null);
											setOtp("");
										}}
									>
										Ganti email / nomor HP
									</button>
									<button
										type="button"
										className="hover:text-foreground hover:underline disabled:opacity-50"
										disabled={isResending}
										onClick={handleResend}
									>
										{isResending ? "Mengirim..." : "Kirim ulang kode"}
									</button>
								</div>
							</form>
						</CardContent>
					</>
				) : (
					<>
						<CardHeader>
							<CardTitle className="text-xl">Lupa Kata Sandi</CardTitle>
							<CardDescription>
								Masukkan email atau nomor HP akun Anda — kami kirim kode OTP
								untuk membuat kata sandi baru.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<form className="flex flex-col gap-4" onSubmit={handleRequest}>
								<div className="flex flex-col gap-1.5">
									<Label htmlFor="identifier">Email atau Nomor HP</Label>
									<div className="relative">
										<KeyRound className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
										<Input
											id="identifier"
											type="text"
											autoComplete="username"
											placeholder="nama@email.com atau 08xxxxxxxxxx"
											className="pl-9"
											required
											value={identifier}
											onChange={(e) => setIdentifier(e.target.value)}
										/>
									</div>
								</div>
								<SubmitButton
									loading={isSubmitting}
									loadingText="Mengirim..."
									className="w-full"
								>
									Kirim Kode OTP
								</SubmitButton>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="w-full text-xs"
									onClick={() => router.push("/reset-password")}
								>
									Punya link reset lama?
								</Button>
							</form>
						</CardContent>
					</>
				)}
			</Card>
		</AuthShell>
	);
}
