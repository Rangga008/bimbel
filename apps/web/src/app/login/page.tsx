"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
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

export default function LoginPage() {
	const router = useRouter();
	const setSession = useAuthStore((state) => state.setSession);
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setIsSubmitting(true);
		try {
			const data = await apiFetch<LoginResponse>("/auth/login", {
				method: "POST",
				body: { email, password },
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
		<div className="flex min-h-svh items-center justify-center p-4">
			<Card className="w-full max-w-sm">
				<CardHeader>
					<CardTitle>Masuk ke Bimbel</CardTitle>
					<CardDescription>
						Gunakan akun yang sudah didaftarkan admin.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form className="flex flex-col gap-4" onSubmit={handleSubmit}>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="email">Email</Label>
							<Input
								id="email"
								type="email"
								autoComplete="username"
								required
								value={email}
								onChange={(e) => setEmail(e.target.value)}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="password">Kata Sandi</Label>
							<Input
								id="password"
								type="password"
								autoComplete="current-password"
								required
								value={password}
								onChange={(e) => setPassword(e.target.value)}
							/>
						</div>
						<Button type="submit" disabled={isSubmitting} className="mt-2">
							{isSubmitting ? "Memproses..." : "Masuk"}
						</Button>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
