"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageCircle, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch, ApiError } from "@/lib/api-client";

interface VerificationStatus {
	verified: boolean;
	phone: string | null;
}

function err(e: unknown, fb: string) {
	return e instanceof ApiError ? e.message : fb;
}

function maskPhone(phone: string) {
	const digits = phone.replace(/\D/g, "");
	if (digits.length <= 4) return phone;
	return `${digits.slice(0, 4)}••••${digits.slice(-3)}`;
}

/**
 * Banner "verifikasi nomor HP" — tampil di shell untuk akun daftar-mandiri
 * (siswa luar/ortu) yang belum membuktikan nomornya lewat OTP WhatsApp.
 * Akun buatan admin/ortu otomatis terverifikasi sehingga banner tak muncul.
 */
export function PhoneVerificationBanner() {
	const qc = useQueryClient();
	const [open, setOpen] = useState(false);
	const [code, setCode] = useState("");
	const [sentTo, setSentTo] = useState<string | null>(null);

	const statusQ = useQuery({
		queryKey: ["phone-verification-status"],
		queryFn: () =>
			apiFetch<VerificationStatus>("/auth/phone-verification/status"),
	});

	const sendM = useMutation({
		mutationFn: () =>
			apiFetch<{ sentTo: string }>("/auth/phone-verification/send", {
				method: "POST",
			}),
		onSuccess: (d) => {
			setSentTo(d.sentTo);
			toast.success("Kode verifikasi dikirim ke WhatsApp Anda.");
		},
		onError: (e) => toast.error(err(e, "Gagal mengirim kode.")),
	});

	const confirmM = useMutation({
		mutationFn: () =>
			apiFetch<{ verified: boolean }>("/auth/phone-verification/confirm", {
				method: "POST",
				body: { code },
			}),
		onSuccess: () => {
			toast.success("Nomor HP terverifikasi — semua fitur aktif.");
			setOpen(false);
			setCode("");
			setSentTo(null);
			qc.invalidateQueries({ queryKey: ["phone-verification-status"] });
			qc.invalidateQueries({ queryKey: ["profile"] });
		},
		onError: (e) => toast.error(err(e, "Kode salah — coba lagi.")),
	});

	const status = statusQ.data;
	if (!status || status.verified) return null;

	return (
		<>
			<div className="mb-4 flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400">
				<ShieldAlert className="mt-0.5 size-4 shrink-0" />
				<div className="flex-1">
					<p className="font-medium">Nomor HP belum terverifikasi</p>
					<p className="text-xs">
						{status.phone
							? "Verifikasi nomor HP Anda lewat kode yang dikirim ke WhatsApp — wajib sebelum bisa mengerjakan ujian/latsol, mendaftarkan anak, atau membayar."
							: "Isi nomor HP Anda di halaman Profil, lalu verifikasi lewat WhatsApp — wajib sebelum bisa mengerjakan ujian/latsol, mendaftarkan anak, atau membayar."}
					</p>
				</div>
				{status.phone ? (
					<Button
						size="sm"
						variant="outline"
						className="shrink-0 border-amber-400"
						onClick={() => setOpen(true)}
					>
						Verifikasi Sekarang
					</Button>
				) : null}
			</div>

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							<ShieldCheck className="size-5" />
							Verifikasi Nomor HP
						</DialogTitle>
						<DialogDescription>
							Kode 6 digit dikirim ke WhatsApp{" "}
							<strong>{sentTo ?? (status.phone ? maskPhone(status.phone) : "")}</strong>.
							Berlaku 10 menit.
						</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-3">
						{sentTo === null ? (
							<p className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
								Tekan tombol di bawah untuk mengirim kode verifikasi ke WhatsApp nomor{" "}
								{status.phone ? maskPhone(status.phone) : "Anda"}. Pastikan nomor
								benar — ganti nomor di Profil bila perlu.
							</p>
						) : (
							<>
								<Input
									value={code}
									onChange={(e) =>
										setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
									}
									placeholder="Masukkan kode 6 digit"
									inputMode="numeric"
									className="text-center text-lg tracking-[0.5em]"
									maxLength={6}
								/>
								<button
									type="button"
									className="self-center text-xs text-muted-foreground underline-offset-4 hover:underline"
									onClick={() => sendM.mutate()}
									disabled={sendM.isPending}
								>
									{sendM.isPending ? "Mengirim…" : "Kirim ulang kode"}
								</button>
							</>
						)}
					</div>
					<DialogFooter>
						{sentTo === null ? (
							<Button onClick={() => sendM.mutate()} disabled={sendM.isPending}>
								<MessageCircle />
								{sendM.isPending ? "Mengirim…" : "Kirim Kode ke WhatsApp"}
							</Button>
						) : (
							<Button
								onClick={() => confirmM.mutate()}
								disabled={code.length !== 6 || confirmM.isPending}
							>
								{confirmM.isPending ? "Memeriksa…" : "Verifikasi"}
							</Button>
						)}
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
