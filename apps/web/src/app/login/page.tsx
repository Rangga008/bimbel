"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
	ArrowRight,
	CalendarCheck,
	ChartLine,
	Eye,
	EyeOff,
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
import { AuthShell } from "@/components/shared/auth-shell";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
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
	{ icon: CalendarCheck, text: "Jadwal & kehadiran real-time" },
	{ icon: FileCheck2, text: "Ujian & latihan soal online" },
	{ icon: Wallet, text: "Invoice & pembayaran transparan" },
	{ icon: ChartLine, text: "Laporan perkembangan belajar" },
];

export default function LoginPage() {
	const router = useRouter();
	const setSession = useAuthStore((state) => state.setSession);
	const [identifier, setIdentifier] = useState("");
	const [password, setPassword] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);

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
		<AuthShell
			highlights={HIGHLIGHTS}
			footerLink={{ href: "/", label: "Kembali ke beranda" }}
		>
			<Card className="w-full gap-0 overflow-hidden border-white/10 py-0 shadow-2xl shadow-black/25">
				<div
					aria-hidden
					className="h-1 w-full"
					style={{
						backgroundImage:
							"linear-gradient(to right, #0c5d8d, #1283c4 55%, #f2b441)",
					}}
				/>
				<CardHeader className="pt-6">
					<CardTitle className="text-xl">Masuk ke Akun</CardTitle>
					<CardDescription>
						Gunakan email atau nomor HP terdaftar &amp; kata sandi Anda.
					</CardDescription>
				</CardHeader>
				<CardContent className="pb-6">
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
							<div className="flex items-center justify-between">
								<Label htmlFor="password">Kata Sandi</Label>
								<Link
									href="/forgot-password"
									tabIndex={-1}
									className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
								>
									Lupa kata sandi?
								</Link>
							</div>
							<div className="relative">
								<Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
								<Input
									id="password"
									type={showPassword ? "text" : "password"}
									autoComplete="current-password"
									placeholder="••••••••"
									className="pr-10 pl-9"
									required
									value={password}
									onChange={(e) => setPassword(e.target.value)}
								/>
								<button
									type="button"
									onClick={() => setShowPassword((v) => !v)}
									aria-label={
										showPassword
											? "Sembunyikan kata sandi"
											: "Tampilkan kata sandi"
									}
									className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
								>
									{showPassword ? (
										<EyeOff className="size-4" />
									) : (
										<Eye className="size-4" />
									)}
								</button>
							</div>
						</div>
						<SubmitButton
							loading={isSubmitting}
							loadingText="Memproses..."
							className="group mt-2 w-full"
						>
							Masuk
							<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
						</SubmitButton>
						<p className="border-t pt-4 text-center text-xs text-muted-foreground">
							Orang tua baru?{" "}
							<Link
								href="/daftar"
								className="font-medium text-brand-blue-600 underline-offset-4 hover:text-brand-blue-700 hover:underline"
							>
								Daftar akun di sini
							</Link>
						</p>
					</form>
				</CardContent>
			</Card>
		</AuthShell>
	);
}
