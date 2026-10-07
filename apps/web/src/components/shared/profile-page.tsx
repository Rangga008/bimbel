"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch, ApiError, resolveAssetUrl } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { ROLE_KEY_BY_BACKEND_NAME, ROLE_LABELS } from "@/config/role-nav";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ChangePasswordCard } from "./change-password-card";

interface ProfileData {
	id: string;
	email: string;
	name: string;
	phone: string | null;
	avatarUrl: string | null;
	roles: string[];
	/** Ada hanya untuk akun siswa — dipakai di laporan hasil belajar. */
	student?: {
		nis: string | null;
		majorChoice1: string | null;
		majorChoice2: string | null;
	};
}

/** Saran pilihan "Jurusan — PTN" untuk datalist siswa (bisa tetap ketik bebas). */
const MAJOR_SUGGESTIONS = [
	"Teknik Informatika — Universitas Indonesia",
	"Sistem Informasi — Universitas Indonesia",
	"Teknik Elektro — Institut Teknologi Bandung",
	"Teknik Informatika — Institut Teknologi Bandung",
	"Teknik Industri — Institut Teknologi Bandung",
	"Teknik Sipil — Universitas Gadjah Mada",
	"Ilmu Komputer — Universitas Gadjah Mada",
	"Kedokteran — Universitas Gadjah Mada",
	"Kedokteran — Universitas Indonesia",
	"Manajemen — Universitas Gadjah Mada",
	"Akuntansi — Universitas Gadjah Mada",
	"Hukum — Universitas Indonesia",
	"Hukum — Universitas Padjadjaran",
	"Psikologi — Universitas Indonesia",
	"Psikologi — Universitas Padjadjaran",
	"Agroteknologi — Institut Pertanian Bogor",
	"Statistika — Institut Pertanian Bogor",
	"Teknik Komputer — Universitas Diponegoro",
	"Teknik Informatika — Universitas Diponegoro",
	"Teknik Mesin — Universitas Diponegoro",
	"Informatika — Institut Teknologi Sepuluh Nopember",
	"Teknik Elektro — Institut Teknologi Sepuluh Nopember",
	"Teknik Industri — Institut Teknologi Sepuluh Nopember",
	"Desain Komunikasi Visual — Institut Teknologi Bandung",
	"Pendidikan Dokter — Universitas Airlangga",
	"Farmasi — Universitas Airlangga",
	"Teknik Informatika — Universitas Brawijaya",
	"Pendidikan Guru — Universitas Pendidikan Indonesia",
	"Ilmu Komunikasi — Universitas Padjadjaran",
	"Manajemen — Universitas Airlangga",
	"Ekonomi Pembangunan — Universitas Indonesia",
	"Arsitektur — Institut Teknologi Bandung",
	"Matematika — Institut Teknologi Bandung",
];

/**
 * Halaman Profil untuk semua role (sesuai docs/ROLE_PAGES.md):
 * info akun (bisa edit nama + nomor HP), ubah kata sandi,
 * preferensi & inbox notifikasi, logout.
 */
export function ProfilePage() {
	const router = useRouter();
	const user = useAuthStore((s) => s.user);
	const accessToken = useAuthStore((s) => s.accessToken);
	const setSession = useAuthStore((s) => s.setSession);
	const clearSession = useAuthStore((s) => s.clearSession);

	const profileQ = useQuery<ProfileData>({
		queryKey: ["my-profile"],
		queryFn: () => apiFetch<ProfileData>("/auth/profile"),
	});
	const [form, setForm] = useState<{ name: string; phone: string } | null>(null);
	const [majors, setMajors] = useState<{
		majorChoice1: string;
		majorChoice2: string;
	} | null>(null);
	const [logoutOpen, setLogoutOpen] = useState(false);
	const fileRef = useRef<HTMLInputElement>(null);

	const uploadPhotoM = useMutation({
		mutationFn: (file: File) => {
			const fd = new FormData();
			fd.append("file", file);
			return apiFetch<ProfileData>("/auth/profile/photo", {
				method: "POST",
				body: fd,
			});
		},
		onSuccess: (updated) => {
			toast.success("Foto profil diperbarui.");
			if (user && accessToken) {
				setSession(accessToken, { ...user, avatarUrl: updated.avatarUrl });
			}
			void profileQ.refetch();
		},
		onError: (e) =>
			toast.error(e instanceof ApiError ? e.message : "Gagal mengupload foto."),
	});

	const removePhotoM = useMutation({
		mutationFn: () =>
			apiFetch<ProfileData>("/auth/profile/photo", { method: "DELETE" }),
		onSuccess: (updated) => {
			toast.success("Foto profil dihapus.");
			if (user && accessToken) {
				setSession(accessToken, { ...user, avatarUrl: updated.avatarUrl });
			}
			void profileQ.refetch();
		},
		onError: (e) =>
			toast.error(e instanceof ApiError ? e.message : "Gagal menghapus foto."),
	});

	const saveM = useMutation({
		mutationFn: (body: { name?: string; phone?: string }) =>
			apiFetch<ProfileData>("/auth/profile", { method: "PATCH", body }),
		onSuccess: (updated) => {
			toast.success("Profil diperbarui.");
			setForm(null);
			// Sinkronkan nama baru ke sesi lokal (header/sidebar membacanya).
			if (user && accessToken) {
				setSession(accessToken, { ...user, name: updated.name });
			}
			void profileQ.refetch();
		},
		onError: (e) =>
			toast.error(
				e instanceof ApiError ? e.message : "Gagal menyimpan profil.",
			),
	});

	// Pilihan kampus/jurusan (khusus siswa) — tercetak di laporan hasil belajar.
	const saveMajorsM = useMutation({
		mutationFn: (body: { majorChoice1?: string; majorChoice2?: string }) =>
			apiFetch<ProfileData>("/auth/profile", { method: "PATCH", body }),
		onSuccess: () => {
			toast.success("Pilihan kampus/jurusan disimpan.");
			setMajors(null);
			void profileQ.refetch();
		},
		onError: (e) =>
			toast.error(
				e instanceof ApiError ? e.message : "Gagal menyimpan pilihan.",
			),
	});

	async function handleLogout() {
		await apiFetch("/auth/logout", { method: "POST" }).catch(() => undefined);
		clearSession();
		router.push("/login");
	}

	const p = profileQ.data;

	return (
		<div className="flex flex-col gap-8">
			<h1 className="text-2xl font-semibold tracking-tight">Profil</h1>

			<Card>
				<CardHeader>
					<CardTitle>Akun</CardTitle>
					<CardDescription>
						Informasi akun Anda — nama dan nomor HP bisa diubah sendiri.
						Nomor HP dipakai untuk notifikasi WhatsApp.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					{profileQ.isLoading ? (
						<Skeleton className="h-24 w-full max-w-md" />
					) : profileQ.isError ? (
						<p className="text-sm text-destructive">
							Gagal memuat profil.{" "}
							<button
								type="button"
								className="underline"
								onClick={() => profileQ.refetch()}
							>
								Coba lagi
							</button>
						</p>
					) : p ? (
						<>
							<div className="flex items-center gap-4">
								<div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-2xl font-semibold text-muted-foreground">
									{p.avatarUrl ? (
										// eslint-disable-next-line @next/next/no-img-element -- avatar dinamis dari API
										<img
											src={resolveAssetUrl(p.avatarUrl)}
											alt={p.name}
											className="size-full object-cover"
										/>
									) : (
										p.name.slice(0, 2).toUpperCase()
									)}
								</div>
								<div className="flex flex-col gap-1.5">
									<input
										ref={fileRef}
										type="file"
										accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
										className="hidden"
										onChange={(e) => {
											const f = e.target.files?.[0];
											if (f) uploadPhotoM.mutate(f);
											e.target.value = "";
										}}
									/>
									<Button
										variant="outline"
										size="sm"
										disabled={uploadPhotoM.isPending}
										onClick={() => fileRef.current?.click()}
									>
										{uploadPhotoM.isPending ? "Mengupload…" : "Ganti Foto"}
									</Button>
									{p.avatarUrl ? (
										<Button
											variant="ghost"
											size="sm"
											disabled={removePhotoM.isPending}
											onClick={() => removePhotoM.mutate()}
										>
											Hapus Foto
										</Button>
									) : null}
									<p className="text-xs text-muted-foreground">
										JPG/PNG/WebP/GIF/SVG — maks 2MB.
									</p>
								</div>
							</div>
							<div className="grid max-w-md gap-3">
								<div className="grid gap-1.5">
									<Label htmlFor="profile-name">Nama</Label>
									<Input
										id="profile-name"
										value={form?.name ?? p.name}
										onChange={(e) =>
											setForm({
												name: e.target.value,
												phone: form?.phone ?? p.phone ?? "",
											})
										}
									/>
								</div>
								<div className="grid gap-1.5">
									<Label htmlFor="profile-phone">Nomor HP / WhatsApp</Label>
									<Input
										id="profile-phone"
										value={form?.phone ?? p.phone ?? ""}
										onChange={(e) =>
											setForm({
												name: form?.name ?? p.name,
												phone: e.target.value,
											})
										}
										placeholder="cth: 081234567890"
									/>
								</div>
								<div className="grid gap-1.5">
									<Label>Email</Label>
									<Input value={p.email} disabled />
									<p className="text-xs text-muted-foreground">
										Email hanya bisa diubah oleh admin.
									</p>
								</div>
							</div>
							<div className="flex flex-wrap gap-1">
								{user?.roles.map((role) => {
									const key = ROLE_KEY_BY_BACKEND_NAME[role];
									return (
										<Badge key={role} variant="outline">
											{key ? ROLE_LABELS[key] : role}
										</Badge>
									);
								})}
							</div>
							<div className="flex gap-2">
								<Button
									disabled={
										saveM.isPending ||
										!form ||
										(form.name === p.name && form.phone === (p.phone ?? ""))
									}
									onClick={() =>
										saveM.mutate({
											name: form?.name.trim() || undefined,
											phone: form?.phone.trim(),
										})
									}
								>
									{saveM.isPending ? "Menyimpan…" : "Simpan Perubahan"}
								</Button>
								<Button
									variant="destructive"
									onClick={() => setLogoutOpen(true)}
								>
									Logout
								</Button>
							</div>
						</>
					) : null}
				</CardContent>
			</Card>

			{p?.student ? (
				<Card>
					<CardHeader>
						<CardTitle>Pilihan Kampus / Jurusan</CardTitle>
						<CardDescription>
							Pilihan 1 &amp; 2 tercetak di Laporan Hasil Belajar (Pil. 1 /
							Pil. 2) — diisi untuk jenjang SMA/UTBK, boleh dikosongkan.
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-4">
						<div className="grid max-w-md gap-3">
							<div className="grid gap-1.5">
								<Label htmlFor="profile-major1">Pilihan 1</Label>
								<Input
									id="profile-major1"
									list="major-suggestions"
									placeholder="cth: Teknik Informatika — Universitas Indonesia"
									value={
										majors?.majorChoice1 ?? p.student.majorChoice1 ?? ""
									}
									onChange={(e) =>
										setMajors({
											majorChoice1: e.target.value,
											majorChoice2:
												majors?.majorChoice2 ??
												p.student!.majorChoice2 ??
												"",
										})
									}
								/>
							</div>
							<div className="grid gap-1.5">
								<Label htmlFor="profile-major2">Pilihan 2</Label>
								<Input
									id="profile-major2"
									list="major-suggestions"
									placeholder="cth: Sistem Informasi — ITS"
									value={
										majors?.majorChoice2 ?? p.student.majorChoice2 ?? ""
									}
									onChange={(e) =>
										setMajors({
											majorChoice1:
												majors?.majorChoice1 ??
												p.student!.majorChoice1 ??
												"",
											majorChoice2: e.target.value,
										})
									}
								/>
							</div>
							<datalist id="major-suggestions">
								{MAJOR_SUGGESTIONS.map((s) => (
									<option key={s} value={s} />
								))}
							</datalist>
						</div>
						<div>
							<Button
								disabled={
									saveMajorsM.isPending ||
									!majors ||
									(majors.majorChoice1 === (p.student.majorChoice1 ?? "") &&
										majors.majorChoice2 === (p.student.majorChoice2 ?? ""))
								}
								onClick={() =>
									saveMajorsM.mutate({
										majorChoice1: majors?.majorChoice1.trim(),
										majorChoice2: majors?.majorChoice2.trim(),
									})
								}
							>
								{saveMajorsM.isPending ? "Menyimpan…" : "Simpan Pilihan"}
							</Button>
						</div>
					</CardContent>
				</Card>
			) : null}

			<ChangePasswordCard />

			<ConfirmDialog
				open={logoutOpen}
				onOpenChange={setLogoutOpen}
				title="Keluar dari akun?"
				description="Anda perlu login ulang untuk mengakses aplikasi lagi."
				confirmLabel="Ya, Logout"
				onConfirm={() => void handleLogout()}
			/>
		</div>
	);
}
