"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
	ArrowLeft,
	Baby,
	CalendarCheck,
	FileCheck2,
	Lock,
	Mail,
	Phone,
	User,
	Wallet,
} from "lucide-react";
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
import { useAuthStore } from "@/stores/auth-store";
import { useBranding } from "@/lib/use-branding";

interface RegisterResponse {
	accessToken: string;
	user: {
		id: string;
		email: string;
		name: string;
		roles: string[];
		permissions: string[];
	};
}

const HIGHLIGHTS = [
	{ icon: Baby, text: "Daftarkan anak dan hubungkan ke program belajar" },
	{ icon: CalendarCheck, text: "Pantau jadwal & kehadiran anak real-time" },
	{ icon: FileCheck2, text: "Lihat nilai ujian dan ranking siswa" },
	{ icon: Wallet, text: "Kelola invoice, pembayaran, dan kwitansi" },
];

export default function DaftarPage() {
	const router = useRouter();
	const setSession = useAuthStore((state) => state.setSession);
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [phone, setPhone] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const branding = useBranding();

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (password !== confirmPassword) {
			toast.error("Konfirmasi kata sandi tidak sama.");
			return;
		}
		setIsSubmitting(true);
		try {
			const data = await apiFetch<RegisterResponse>("/auth/register", {
				method: "POST",
				body: {
					name,
					email,
					phone,
					password,
				},
				auth: false,
			});
			setSession(data.accessToken, data.user);
			toast.success(`Pendaftaran berhasil — selamat datang, ${data.user.name}!`);
			router.replace("/orang-tua");
		} catch (error) {
			const message =
				error instanceof ApiError
					? error.message
					: "Pendaftaran gagal, coba lagi.";
			toast.error(message);
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<div className="grid min-h-screen lg:grid-cols-2">
			{/* ---- Panel brand (desktop) ---- */}
			<div
				className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-10 xl:p-14"
				style={{
					backgroundImage:
						"linear-gradient(150deg, #032a41 0%, #074c74 45%, #0c5d8d 80%, #0f77b4 100%)",
				}}
			>
				<div
					aria-hidden
					className="absolute -top-32 -right-32 size-96 rounded-full bg-brand-blue-500/30 blur-3xl"
				/>
				<div
					aria-hidden
					className="absolute -bottom-40 -left-24 size-96 rounded-full bg-brand-gold-400/15 blur-3xl"
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
				<Link href="/" className="relative flex w-fit items-center gap-3">
					<Image
						src={branding.resolvedLogoUrl}
						alt={`Logo ${branding.appName}`}
						width={44}
						height={44}
						className="size-11 rounded-xl bg-white/90 p-1 object-contain"
						priority
						unoptimized
					/>
					<div>
						<p className="text-base font-semibold text-white">
							{branding.appName}
						</p>
						<p className="text-xs text-brand-blue-200">
							{branding.tagline || "Portal belajar terpadu"}
						</p>
					</div>
				</Link>
				<div className="relative flex flex-col gap-6">
					<span className="inline-flex w-fit items-center gap-2 rounded-full border border-brand-gold-400/40 bg-brand-gold-400/10 px-3 py-1 text-xs font-medium text-brand-gold-200">
						Pendaftaran Orang Tua
					</span>
					<h1 className="max-w-md text-3xl font-bold tracking-tight text-white xl:text-4xl">
						Satu akun untuk{" "}
						<span className="bg-gradient-to-r from-brand-gold-300 via-brand-gold-400 to-brand-gold-500 bg-clip-text text-transparent">
							memantau seluruh proses belajar anak
						</span>
						.
					</h1>
					<div className="grid max-w-md gap-3">
						{HIGHLIGHTS.map((h) => (
							<div
								key={h.text}
								className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-3 backdrop-blur-sm"
							>
								<span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-gold-400/15 text-brand-gold-300">
									<h.icon className="size-4.5" />
								</span>
								<p className="text-sm text-brand-blue-50">{h.text}</p>
							</div>
						))}
					</div>
				</div>
				<p className="relative text-xs text-brand-blue-300">
					© {new Date().getFullYear()} {branding.appName}
					{branding.tagline ? ` — ${branding.tagline}` : ""}
				</p>
			</div>

			{/* ---- Form ---- */}
			<div className="relative flex flex-col items-center justify-center p-4 sm:p-8">
				<div
					aria-hidden
					className="absolute inset-0 bg-gradient-to-b from-brand-blue-50/80 via-background to-background"
				/>
				<div
					aria-hidden
					className="absolute -top-24 right-0 size-72 rounded-full bg-brand-blue-100/50 blur-3xl"
				/>
				<div
					aria-hidden
					className="absolute -bottom-24 left-0 size-72 rounded-full bg-brand-gold-100/40 blur-3xl"
				/>
				<div className="relative flex w-full max-w-sm flex-col gap-6">
					<div className="flex flex-col items-center gap-3 text-center lg:hidden">
						<Image
							src={branding.resolvedLogoUrl}
							alt={`Logo ${branding.appName}`}
							width={56}
							height={56}
							className="size-14 object-contain"
							priority
							unoptimized
						/>
						<div>
							<p className="text-lg font-semibold">{branding.appName}</p>
							{branding.tagline ? (
								<p className="text-xs text-muted-foreground">
									{branding.tagline}
								</p>
							) : null}
						</div>
					</div>
					<Card className="shadow-xl">
						<CardHeader>
							<CardTitle className="text-xl">Daftar Akun Orang Tua</CardTitle>
							<CardDescription>
								Buat akun untuk mendaftarkan &amp; memantau anak Anda.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<form className="flex flex-col gap-4" onSubmit={handleSubmit}>
								<div className="flex flex-col gap-1.5">
									<Label htmlFor="name">Nama Lengkap</Label>
									<div className="relative">
										<User className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
										<Input
											id="name"
											autoComplete="name"
											placeholder="Nama orang tua/wali"
											className="pl-9"
											required
											minLength={3}
											value={name}
											onChange={(e) => setName(e.target.value)}
										/>
									</div>
								</div>
								<div className="flex flex-col gap-1.5">
									<Label htmlFor="email">Email</Label>
									<div className="relative">
										<Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
										<Input
											id="email"
											type="email"
											autoComplete="email"
											placeholder="nama@email.com"
											className="pl-9"
											required
											value={email}
											onChange={(e) => setEmail(e.target.value)}
										/>
									</div>
								</div>
								<div className="flex flex-col gap-1.5">
									<Label htmlFor="phone">No. HP / WhatsApp *</Label>
									<div className="relative">
										<Phone className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
										<Input
											id="phone"
											type="tel"
											autoComplete="tel"
											placeholder="08..."
											className="pl-9"
											required
											minLength={9}
											value={phone}
											onChange={(e) => setPhone(e.target.value)}
										/>
									</div>
									<p className="text-xs text-muted-foreground">
										Bisa dipakai untuk masuk &amp; notifikasi WhatsApp.
									</p>
								</div>
								<div className="flex flex-col gap-1.5">
									<Label htmlFor="password">Kata Sandi</Label>
									<div className="relative">
										<Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
										<Input
											id="password"
											type="password"
											autoComplete="new-password"
											placeholder="Minimal 8 karakter"
											className="pl-9"
											required
											minLength={8}
											value={password}
											onChange={(e) => setPassword(e.target.value)}
										/>
									</div>
								</div>
								<div className="flex flex-col gap-1.5">
									<Label htmlFor="confirmPassword">Konfirmasi Kata Sandi</Label>
									<div className="relative">
										<Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
										<Input
											id="confirmPassword"
											type="password"
											autoComplete="new-password"
											placeholder="Ulangi kata sandi"
											className="pl-9"
											required
											value={confirmPassword}
											onChange={(e) => setConfirmPassword(e.target.value)}
										/>
									</div>
								</div>
								<SubmitButton
									loading={isSubmitting}
									loadingText="Mendaftarkan..."
									className="mt-2 w-full"
								>
									Daftar &amp; Masuk
								</SubmitButton>
								<p className="text-center text-xs text-muted-foreground">
									Sudah punya akun?{" "}
									<Link
										href="/login"
										className="font-medium underline-offset-4 hover:text-foreground hover:underline"
									>
										Masuk di sini
									</Link>
								</p>
							</form>
						</CardContent>
					</Card>
					<p className="text-center text-sm text-muted-foreground">
						<Link
							href="/"
							className="inline-flex items-center gap-1.5 hover:text-foreground"
						>
							<ArrowLeft className="size-4" />
							Kembali ke beranda
						</Link>
					</p>
				</div>
			</div>
		</div>
	);
}
