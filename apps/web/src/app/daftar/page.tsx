"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
	Baby,
	CalendarCheck,
	Eye,
	EyeOff,
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
import { AuthShell } from "@/components/shared/auth-shell";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";

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
	{ icon: Baby, text: "Daftarkan anak ke program belajar" },
	{ icon: CalendarCheck, text: "Pantau jadwal & kehadiran" },
	{ icon: FileCheck2, text: "Nilai ujian & ranking siswa" },
	{ icon: Wallet, text: "Invoice, pembayaran, kwitansi" },
];

export default function DaftarPage() {
	const router = useRouter();
	const setSession = useAuthStore((state) => state.setSession);
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [phone, setPhone] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);

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
					<CardTitle className="text-xl">Daftar Akun Orang Tua</CardTitle>
					<CardDescription>
						Buat akun untuk mendaftarkan &amp; memantau anak Anda.
					</CardDescription>
				</CardHeader>
				<CardContent className="pb-6">
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
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
								<Label htmlFor="phone">No. HP / WhatsApp</Label>
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
							</div>
						</div>
						<p className="-mt-2 text-xs text-muted-foreground">
							No. HP bisa dipakai untuk masuk &amp; notifikasi WhatsApp.
						</p>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="password">Kata Sandi</Label>
							<div className="relative">
								<Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
								<Input
									id="password"
									type={showPassword ? "text" : "password"}
									autoComplete="new-password"
									placeholder="Minimal 8 karakter"
									className="pr-10 pl-9"
									required
									minLength={8}
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
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="confirmPassword">Konfirmasi Kata Sandi</Label>
							<div className="relative">
								<Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
								<Input
									id="confirmPassword"
									type={showPassword ? "text" : "password"}
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
						<p className="border-t pt-4 text-center text-xs text-muted-foreground">
							Sudah punya akun?{" "}
							<Link
								href="/login"
								className="font-medium text-brand-blue-600 underline-offset-4 hover:text-brand-blue-700 hover:underline"
							>
								Masuk di sini
							</Link>
						</p>
					</form>
				</CardContent>
			</Card>
		</AuthShell>
	);
}
