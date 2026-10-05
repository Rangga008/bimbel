"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
	ArrowLeft,
	CalendarCheck,
	ChartLine,
	FileCheck2,
	Lock,
	Mail,
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
import { ROLE_KEY_BY_BACKEND_NAME } from "@/config/role-nav";

interface LoginResponse {
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
	{ icon: CalendarCheck, text: "Jadwal & kehadiran terpantau real-time" },
	{ icon: FileCheck2, text: "Ujian online dan latihan soal terkelola" },
	{ icon: Wallet, text: "Invoice dan pembayaran transparan" },
	{ icon: ChartLine, text: "Laporan perkembangan untuk orang tua" },
];

export default function LoginPage() {
	const router = useRouter();
	const setSession = useAuthStore((state) => state.setSession);
	const [identifier, setIdentifier] = useState("");
	const [password, setPassword] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const branding = useBranding();

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setIsSubmitting(true);
		try {
			const data = await apiFetch<LoginResponse>("/auth/login", {
				method: "POST",
				body: { identifier, password },
				auth: false,
			});
			setSession(data.accessToken, data.user);
			const roleKey = ROLE_KEY_BY_BACKEND_NAME[data.user.roles[0]];
			router.replace(roleKey ? `/${roleKey}` : "/");
		} catch (error) {
			const message =
				error instanceof ApiError ? error.message : "Gagal masuk, coba lagi.";
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
						Selamat datang kembali
					</span>
					<h1 className="max-w-md text-3xl font-bold tracking-tight text-white xl:text-4xl">
						Portal belajar terpadu untuk{" "}
						<span className="bg-gradient-to-r from-brand-gold-300 via-brand-gold-400 to-brand-gold-500 bg-clip-text text-transparent">
							siswa, orang tua, dan tutor
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
							<CardTitle className="text-xl">Masuk ke Akun</CardTitle>
							<CardDescription>
								Gunakan email atau nomor HP terdaftar &amp; kata sandi Anda.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<form className="flex flex-col gap-4" onSubmit={handleSubmit}>
								<div className="flex flex-col gap-1.5">
									<Label htmlFor="identifier">Email atau No. HP</Label>
									<div className="relative">
										<Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
										<Input
											id="identifier"
											autoComplete="username"
											placeholder="nama@email.com atau 08..."
											className="pl-9"
											required
											value={identifier}
											onChange={(e) => setIdentifier(e.target.value)}
										/>
									</div>
								</div>
								<div className="flex flex-col gap-1.5">
									<Label htmlFor="password">Kata Sandi</Label>
									<div className="relative">
										<Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
										<Input
											id="password"
											type="password"
											autoComplete="current-password"
											placeholder="••••••••"
											className="pl-9"
											required
											value={password}
											onChange={(e) => setPassword(e.target.value)}
										/>
									</div>
								</div>
								<SubmitButton
									loading={isSubmitting}
									loadingText="Memproses..."
									className="mt-2 w-full"
								>
									Masuk
								</SubmitButton>
								<p className="text-center text-xs text-muted-foreground">
									<Link
										href="/forgot-password"
										className="underline-offset-4 hover:text-foreground hover:underline"
									>
										Lupa kata sandi?
									</Link>
								</p>
								<p className="border-t pt-3 text-center text-xs text-muted-foreground">
									Orang tua baru?{" "}
									<Link
										href="/daftar"
										className="font-medium underline-offset-4 hover:text-foreground hover:underline"
									>
										Daftar akun di sini
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
