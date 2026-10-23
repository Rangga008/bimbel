"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch, ApiError, resolveAssetUrl } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Send, Trash2, ChevronRight, ArrowLeft } from "lucide-react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
	ImagePickerField,
	MediaLibraryDialog,
} from "@/components/shared/image-picker-field";

interface CompanySettings {
	name: string;
	address: string;
	phone: string;
	email: string;
}

interface FinanceSettingsData {
	invoiceDueDays: number;
	receiptSignerName: string;
	receiptSignerTitle: string;
	receiptSignatureUrl: string;
}

interface WhatsAppSettings {
	provider: string;
	apiUrl: string;
	apiToken: string;
	senderNumber: string;
	adminPhone: string;
	notifyInvoiceIssued: boolean;
	notifyPaymentVerified: boolean;
	notifyPaymentRejected: boolean;
	notifyPaymentProof: boolean;
	notifyPayrollPaid: boolean;
}

interface BrandingSettings {
	appName: string;
	tagline: string;
	logoUrl: string;
	appUrl: string;
}

interface MailSettings {
	host: string;
	port: number;
	secure: boolean;
	user: string;
	pass: string;
	from: string;
}

interface MidtransSettings {
	enabled: boolean;
	isProduction: boolean;
	serverKey: string;
	clientKey: string;
}

interface ReminderTemplates {
	paymentDue: string;
	weeklySchedule: string;
	monthlyPerformance: string;
	feedback: string;
	tutorAbsence: string;
}

interface DisplaySettings {
	heroImages: string[];
	registrationUrl: string;
}

interface ExamSettings {
	violationLimit: number;
}

interface AppSettings {
	company: CompanySettings;
	finance: FinanceSettingsData;
	whatsapp: WhatsAppSettings;
	branding: BrandingSettings;
	mail: MailSettings;
	midtrans: MidtransSettings;
	reminders: ReminderTemplates;
	display: DisplaySettings;
	exam: ExamSettings;
}

interface FinancialAccount {
	id: string;
	name: string;
	code: string | null;
	type: string;
	isActive: boolean;
}

function err(e: unknown, fb: string) {
	return e instanceof ApiError ? e.message : fb;
}

const WA_TOGGLES: Array<{
	key: keyof Pick<
		WhatsAppSettings,
		| "notifyInvoiceIssued"
		| "notifyPaymentVerified"
		| "notifyPaymentRejected"
		| "notifyPaymentProof"
		| "notifyPayrollPaid"
	>;
	label: string;
	hint: string;
}> = [
	{ key: "notifyInvoiceIssued", label: "Invoice diterbitkan", hint: "WA ke orang tua saat tagihan baru" },
	{ key: "notifyPaymentVerified", label: "Pembayaran terverifikasi", hint: "WA ke orang tua saat pembayaran disetujui" },
	{ key: "notifyPaymentRejected", label: "Pembayaran ditolak", hint: "WA ke orang tua saat pembayaran ditolak" },
	{ key: "notifyPaymentProof", label: "Bukti pembayaran masuk", hint: "WA ke nomor admin di atas" },
	{ key: "notifyPayrollPaid", label: "Payroll dibayarkan", hint: "WA ke tutor saat honor dibayarkan" },
];

/** Daftar bagian pengaturan — halaman utama menampilkan menu ini, tiap
 * bagian dibuka di tampilan lanjutan sendiri agar form tidak saling
 * mengganggu. `key` dipakai untuk meng-filter card yang dirender. */
const SETTING_SECTIONS = [
	{ key: "branding", title: "Identitas Aplikasi", desc: "Nama & logo aplikasi di sidebar, login, landing, dan email." },
	{ key: "display", title: "Tampilan Landing", desc: "Foto hero & tampilan halaman depan publik." },
	{ key: "exam", title: "Ujian & Perlindungan", desc: "Aturan durasi, pengacakan, dan anti-curang ujian." },
	{ key: "company", title: "Identitas Bimbel", desc: "Nama lembaga, alamat, dan kontak resmi." },
	{ key: "finance", title: "Parameter Keuangan", desc: "Prefix nomor, jatuh tempo, dan parameter tagihan." },
	{ key: "whatsapp", title: "Notifikasi WhatsApp Otomatis", desc: "Nomor admin & toggle WA otomatis per kejadian." },
	{ key: "reminders", title: "Template Reminder WhatsApp", desc: "Template pesan reminder tagihan & jadwal." },
	{ key: "mail", title: "Email (SMTP)", desc: "Server email untuk notifikasi & reset password." },
	{ key: "midtrans", title: "Payment Gateway (Midtrans)", desc: "Kunci server/client & mode sandbox/produksi." },
	{ key: "accounts", title: "Akun Kas / Bank", desc: "Rekening & kas yang menerima pembayaran." },
] as const;

/**
 * Halaman "Pengaturan" (Admin Finance): identitas bimbel, parameter keuangan,
 * nomor WA & toggle notifikasi otomatis, akun kas/bank — tiap bagian dibuka
 * di tampilan lanjutan sendiri (menu → bagian), tidak semua di satu halaman.
 */
export function FinanceSettings() {
	const [section, setSection] = useState<string | null>(null);
	const qc = useQueryClient();
	// Halaman ini dipakai admin finance & admin akademik — bagian kas/bank dan
	// outbox WA butuh permission finance yang tidak dimiliki admin akademik,
	// jadi query & kartunya digate supaya tidak memicu 403.
	const canViewAccounts =
		useAuthStore((s) => s.user?.permissions.includes("invoice.view")) ??
		false;

	const settingsQ = useQuery({
		queryKey: ["app-settings"],
		queryFn: () => apiFetch<AppSettings>("/settings"),
	});
	const accountsQ = useQuery({
		queryKey: ["financial-accounts"],
		queryFn: () => apiFetch<FinancialAccount[]>("/financial-accounts"),
		enabled: canViewAccounts,
	});

	// Lazy-init dari cache: saat kembali ke halaman ini React Query bisa
	// langsung punya data — tanpa init ini semua form akan tetap null.
	const [company, setCompany] = useState<CompanySettings | null>(
		() => settingsQ.data?.company ?? null,
	);
	const [finance, setFinance] = useState<FinanceSettingsData | null>(
		() => settingsQ.data?.finance ?? null,
	);
	const [whatsapp, setWhatsapp] = useState<WhatsAppSettings | null>(
		() => settingsQ.data?.whatsapp ?? null,
	);
	const [branding, setBranding] = useState<BrandingSettings | null>(
		() => settingsQ.data?.branding ?? null,
	);
	const [mail, setMail] = useState<MailSettings | null>(
		() => settingsQ.data?.mail ?? null,
	);
	const [midtrans, setMidtrans] = useState<MidtransSettings | null>(
		() => settingsQ.data?.midtrans ?? null,
	);
	const [reminders, setReminders] = useState<ReminderTemplates | null>(
		() => settingsQ.data?.reminders ?? null,
	);
	const [display, setDisplay] = useState<DisplaySettings | null>(
		() => settingsQ.data?.display ?? null,
	);
	const [exam, setExam] = useState<ExamSettings | null>(
		() => settingsQ.data?.exam ?? null,
	);
	const [newAcc, setNewAcc] = useState({ name: "", code: "", type: "CASH" });
	const [accToDelete, setAccToDelete] = useState<FinancialAccount | null>(null);
	const [heroPickerOpen, setHeroPickerOpen] = useState(false);

	// Sinkronkan hasil query ke state form saat data berubah —
	// pola "adjust state during render" (pengganti setState di dalam effect).
	const [prevSettings, setPrevSettings] = useState(settingsQ.data);
	if (settingsQ.data !== prevSettings) {
		setPrevSettings(settingsQ.data);
		if (settingsQ.data) {
			setCompany(settingsQ.data.company);
			setFinance(settingsQ.data.finance);
			setWhatsapp(settingsQ.data.whatsapp);
			setBranding(settingsQ.data.branding);
			setMail(settingsQ.data.mail);
			setMidtrans(settingsQ.data.midtrans);
			setReminders(settingsQ.data.reminders);
			setDisplay(settingsQ.data.display);
			setExam(settingsQ.data.exam);
		}
	}

	const waTestM = useMutation({
		mutationFn: (phone: string) =>
			apiFetch("/whatsapp-outbox/test", {
				method: "POST",
				body: {
					phone,
					message: "Tes koneksi WhatsApp — konfigurasi gateway di Pengaturan berfungsi.",
				},
			}),
		onSuccess: () => {
			toast.success(
				"Pesan uji masuk antrean — status terlihat di tabel Outbox di bawah (±10 detik).",
			);
			qc.invalidateQueries({ queryKey: ["wa-outbox"] });
			qc.invalidateQueries({ queryKey: ["wa-outbox-stats"] });
		},
		onError: (e) => toast.error(err(e, "Gagal mengirim pesan uji.")),
	});

	const saveMutation = useMutation({
		mutationFn: (args: { key: string; value: unknown }) =>
			apiFetch(`/settings/${args.key}`, {
				method: "PUT",
				body: { value: args.value },
			}),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["app-settings"] });
			qc.invalidateQueries({ queryKey: ["company-info"] });
			toast.success("Pengaturan tersimpan.");
		},
		onError: (e) => toast.error(err(e, "Gagal menyimpan pengaturan.")),
	});

	const createAccMutation = useMutation({
		mutationFn: (body: { name: string; code?: string; type: string }) =>
			apiFetch("/financial-accounts", { method: "POST", body }),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["financial-accounts"] });
			qc.invalidateQueries({ queryKey: ["ledger-accounts"] });
			setNewAcc({ name: "", code: "", type: "CASH" });
			toast.success("Akun kas/bank ditambahkan.");
		},
		onError: (e) => toast.error(err(e, "Gagal menambah akun.")),
	});

	const deleteAccMutation = useMutation({
		mutationFn: (id: string) =>
			apiFetch(`/financial-accounts/${id}`, { method: "DELETE" }),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["financial-accounts"] });
			qc.invalidateQueries({ queryKey: ["ledger-accounts"] });
			setAccToDelete(null);
			toast.success("Akun kas/bank dihapus.");
		},
		onError: (e) => {
			setAccToDelete(null);
			toast.error(err(e, "Gagal menghapus akun."));
		},
	});

	const toggleAccMutation = useMutation({
		mutationFn: (args: { id: string; isActive: boolean }) =>
			apiFetch(`/financial-accounts/${args.id}`, {
				method: "PATCH",
				body: { isActive: args.isActive },
			}),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["financial-accounts"] });
			qc.invalidateQueries({ queryKey: ["ledger-accounts"] });
			toast.success("Status akun diperbarui.");
		},
		onError: (e) => toast.error(err(e, "Gagal memperbarui akun.")),
	});

	const saving = saveMutation.isPending;

	// Kartu hanya dirender setelah data settings siap — sebelumnya saat query
	// gagal/lambat halaman menampilkan kartu kosong yang membingungkan.
	if (settingsQ.isLoading) {
		return (
			<div className="flex flex-col gap-8">
				<h1 className="text-2xl font-semibold tracking-tight">Pengaturan</h1>
				{[0, 1, 2, 3].map((i) => (
					<Skeleton key={i} className="h-40 w-full" />
				))}
			</div>
		);
	}
	if (settingsQ.isError) {
		return (
			<div className="flex flex-col gap-8">
				<h1 className="text-2xl font-semibold tracking-tight">Pengaturan</h1>
				<Card>
					<CardContent className="flex flex-col items-center gap-3 py-10 text-center">
						<p className="text-sm text-destructive">
							{err(settingsQ.error, "Gagal memuat pengaturan.")}
						</p>
						<Button
							variant="outline"
							onClick={() => settingsQ.refetch()}
						>
							Coba Lagi
						</Button>
					</CardContent>
				</Card>
			</div>
		);
	}

	const currentSection = SETTING_SECTIONS.find((s) => s.key === section);

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-wrap items-center gap-3">
				{section ? (
					<Button variant="outline" size="sm" onClick={() => setSection(null)}>
						<ArrowLeft className="size-4" /> Semua Pengaturan
					</Button>
				) : null}
				<h1 className="text-2xl font-semibold tracking-tight">
					Pengaturan{currentSection ? ` — ${currentSection.title}` : ""}
				</h1>
			</div>

			{!section ? (
				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{SETTING_SECTIONS.filter(
						(s) => s.key !== "accounts" || canViewAccounts,
					).map((s) => (
						<button
							key={s.key}
							type="button"
							onClick={() => setSection(s.key)}
							className="group flex items-center justify-between gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-accent/40"
						>
							<div className="min-w-0">
								<p className="font-medium">{s.title}</p>
								<p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
									{s.desc}
								</p>
							</div>
							<ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
						</button>
					))}
				</div>
			) : null}

			{/* ---- Identitas Aplikasi ---- */}
			{(!section || section === "branding") ? (
			<Card>
				<CardHeader>
					<CardTitle>Identitas Aplikasi</CardTitle>
					<CardDescription>
						Nama &amp; logo aplikasi di sidebar, halaman login, landing, dan
						email yang dikirim ke pengguna.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{branding ? (
						<form
							className="grid gap-4"
							onSubmit={(e) => {
								e.preventDefault();
								saveMutation.mutate({ key: "branding", value: branding });
							}}
						>
							<div className="grid gap-4 sm:grid-cols-2">
								<div className="grid gap-1.5">
									<Label htmlFor="app-name">Nama Aplikasi</Label>
									<Input
										id="app-name"
										value={branding.appName}
										onChange={(e) =>
											setBranding({ ...branding, appName: e.target.value })
										}
										placeholder="Bimbel GFS"
									/>
								</div>
								<div className="grid gap-1.5">
									<Label htmlFor="app-tagline">Tagline</Label>
									<Input
										id="app-tagline"
										value={branding.tagline}
										onChange={(e) =>
											setBranding({ ...branding, tagline: e.target.value })
										}
										placeholder="cth: Great Formula Solution"
									/>
								</div>
							</div>
							<ImagePickerField
								id="app-logo"
								label="Logo Aplikasi"
								value={branding.logoUrl}
								onChange={(url) => setBranding({ ...branding, logoUrl: url })}
								category="BRANDING"
								hint="Upload baru atau pilih dari pustaka branding. Kosongkan untuk logo default."
							/>
							<div className="grid max-w-md gap-1.5">
								<Label htmlFor="app-url">URL Aplikasi (Publik)</Label>
								<Input
									id="app-url"
									type="url"
									value={branding.appUrl}
									onChange={(e) =>
										setBranding({ ...branding, appUrl: e.target.value })
									}
									placeholder="cth: http://localhost:3001"
								/>
								<p className="text-xs text-muted-foreground">
									Dipakai sebagai basis tautan di pesan WhatsApp/email (mis.
									tautan kwitansi setelah pembayaran). Kosongkan bila belum
									punya domain publik — pesan tetap terkirim tanpa tautan.
								</p>
							</div>
							<div>
								<Button type="submit" disabled={saving}>
									{saving ? "Menyimpan…" : "Simpan Identitas Aplikasi"}
								</Button>
							</div>
						</form>
					) : null}
				</CardContent>
			</Card>
			) : null}

			{/* ---- Tampilan Landing ---- */}
			{(!section || section === "display") ? (
			<Card>
				<CardHeader>
					<CardTitle>Tampilan Landing</CardTitle>
					<CardDescription>
						Foto-foto siswa yang tampil sebagai slider di bagian atas halaman
						awal, dan link formulir info/pendaftaran (buku tamu).
					</CardDescription>
				</CardHeader>
				<CardContent>
					{display ? (
						<form
							className="grid gap-4"
							onSubmit={(e) => {
								e.preventDefault();
								saveMutation.mutate({ key: "display", value: display });
							}}
						>
							<div className="grid gap-2">
								<Label>Foto Hero (slider halaman awal)</Label>
								{display.heroImages.length > 0 ? (
									<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
										{display.heroImages.map((url, i) => (
											<div
												key={`${url}-${i}`}
												className="group relative overflow-hidden rounded-lg border bg-muted/20"
											>
												<img
													src={resolveAssetUrl(url)}
													alt={`Foto hero ${i + 1}`}
													className="aspect-[4/3] w-full object-cover"
												/>
												<button
													type="button"
													aria-label={`Hapus foto ${i + 1}`}
													onClick={() =>
														setDisplay({
															...display,
															heroImages: display.heroImages.filter(
																(_, j) => j !== i,
															),
														})
													}
													className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-md bg-background/90 text-destructive shadow transition-opacity hover:bg-destructive hover:text-white"
												>
													<Trash2 className="size-3.5" />
												</button>
											</div>
										))}
									</div>
								) : (
									<p className="text-xs text-muted-foreground">
										Belum ada foto — hero landing menampilkan kartu fitur saja.
									</p>
								)}
								<div>
									<Button
										type="button"
										variant="outline"
										size="sm"
										disabled={display.heroImages.length >= 10}
										onClick={() => setHeroPickerOpen(true)}
									>
										<Plus className="size-4" /> Tambah Foto
									</Button>
								</div>
								<p className="text-xs text-muted-foreground">
									Maksimal 10 foto — urutan tampil mengikuti urutan di sini.
								</p>
							</div>
							<div className="grid max-w-md gap-1.5">
								<Label htmlFor="reg-url">Link Formulir Pendaftaran</Label>
								<Input
									id="reg-url"
									type="url"
									value={display.registrationUrl}
									onChange={(e) =>
										setDisplay({ ...display, registrationUrl: e.target.value })
									}
									placeholder="https://s.id/info-daftarGFS2627"
								/>
								<p className="text-xs text-muted-foreground">
									Tombol &quot;Info &amp; Pendaftaran&quot; di halaman awal
									mengarah ke link ini (mis. Google Form buku tamu).
								</p>
							</div>
							<div>
								<Button type="submit" disabled={saving}>
									{saving ? "Menyimpan…" : "Simpan Tampilan Landing"}
								</Button>
							</div>
						</form>
					) : null}
					<MediaLibraryDialog
						open={heroPickerOpen}
						onOpenChange={setHeroPickerOpen}
						category="BRANDING"
						onPick={(url) => {
							if (display) {
								setDisplay({
									...display,
									heroImages: [...display.heroImages, url].slice(0, 10),
								});
							}
						}}
					/>
				</CardContent>
			</Card>
			) : null}

			{/* ---- Ujian & Proctoring ---- */}
			{(!section || section === "exam") ? (
			<Card>
				<CardHeader>
					<CardTitle>Ujian &amp; Perlindungan</CardTitle>
					<CardDescription>
						Batas pelanggaran proctoring (keluar halaman/tab/fullscreen).
						Pelanggaran di bawah batas mengunci attempt sebagai peringatan;
						pelanggaran ke-N mengumpulkan jawaban otomatis.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{exam ? (
						<form
							className="grid gap-4"
							onSubmit={(e) => {
								e.preventDefault();
								saveMutation.mutate({ key: "exam", value: exam });
							}}
						>
							<div className="grid max-w-md gap-1.5">
								<Label htmlFor="exam-violation-limit">
									Batas pelanggaran sebelum auto-submit
								</Label>
								<Input
									id="exam-violation-limit"
									type="number"
									min={1}
									max={10}
									value={exam.violationLimit}
									onChange={(e) =>
										setExam({
											...exam,
											violationLimit: Number(e.target.value),
										})
									}
								/>
								<p className="text-xs text-muted-foreground">
									Contoh: 3 = peringatan ke-1 &amp; ke-2 mengunci attempt
									(bisa dibuka pengawas), pelanggaran ke-3 langsung
									mengumpulkan jawaban.
								</p>
							</div>
							<div>
								<Button type="submit" disabled={saving}>
									{saving ? "Menyimpan…" : "Simpan Pengaturan Ujian"}
								</Button>
							</div>
						</form>
					) : null}
				</CardContent>
			</Card>
			) : null}

			{/* ---- Identitas Bimbel ---- */}
			{(!section || section === "company") ? (
			<Card>
				<CardHeader>
					<CardTitle>Identitas Bimbel</CardTitle>
					<CardDescription>
						Dipakai sebagai header pada laporan &amp; kwitansi.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{company ? (
						<form
							className="grid gap-4 md:grid-cols-2"
							onSubmit={(e) => {
								e.preventDefault();
								saveMutation.mutate({ key: "company", value: company });
							}}
						>
							<div className="grid gap-1.5">
								<Label htmlFor="co-name">Nama</Label>
								<Input
									id="co-name"
									value={company.name}
									onChange={(e) => setCompany({ ...company, name: e.target.value })}
								/>
							</div>
							<div className="grid gap-1.5">
								<Label htmlFor="co-email">Email</Label>
								<Input
									id="co-email"
									type="email"
									value={company.email}
									onChange={(e) => setCompany({ ...company, email: e.target.value })}
								/>
							</div>
							<div className="grid gap-1.5">
								<Label htmlFor="co-phone">Telepon</Label>
								<Input
									id="co-phone"
									value={company.phone}
									onChange={(e) => setCompany({ ...company, phone: e.target.value })}
								/>
							</div>
							<div className="grid gap-1.5">
								<Label htmlFor="co-address">Alamat</Label>
								<Input
									id="co-address"
									value={company.address}
									onChange={(e) => setCompany({ ...company, address: e.target.value })}
								/>
							</div>
							<div className="md:col-span-2">
								<Button type="submit" disabled={saving}>
									{saving ? "Menyimpan…" : "Simpan Identitas"}
								</Button>
							</div>
						</form>
					) : null}
				</CardContent>
			</Card>
			) : null}

			{/* ---- Parameter Keuangan ---- */}
			{(!section || section === "finance") ? (
			<Card>
				<CardHeader>
					<CardTitle>Parameter Keuangan</CardTitle>
					<CardDescription>
						Default jatuh tempo invoice saat diterbitkan tanpa tanggal
						eksplisit, dan penandatangan kwitansi.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{finance ? (
						<form
							className="grid gap-4"
							onSubmit={(e) => {
								e.preventDefault();
								saveMutation.mutate({ key: "finance", value: finance });
							}}
						>
							<div className="grid gap-1.5">
								<Label htmlFor="fin-due">Jatuh tempo default (hari)</Label>
								<Input
									id="fin-due"
									type="number"
									min={0}
									max={365}
									className="w-40"
									value={finance.invoiceDueDays}
									onChange={(e) =>
										setFinance({
											...finance,
											invoiceDueDays: Number(e.target.value),
										})
									}
								/>
							</div>
							<div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
								<div className="grid gap-1.5">
									<Label htmlFor="fin-signer">Nama penandatangan kwitansi</Label>
									<Input
										id="fin-signer"
										value={finance.receiptSignerName}
										onChange={(e) =>
											setFinance({
												...finance,
												receiptSignerName: e.target.value,
											})
										}
										placeholder="cth: Dra. Hj. Aminah"
									/>
								</div>
								<div className="grid gap-1.5">
									<Label htmlFor="fin-signer-title">Jabatan penandatangan</Label>
									<Input
										id="fin-signer-title"
										value={finance.receiptSignerTitle}
										onChange={(e) =>
											setFinance({
												...finance,
												receiptSignerTitle: e.target.value,
											})
										}
										placeholder="cth: Bendahara"
									/>
								</div>
							</div>
							<ImagePickerField
								id="fin-signature"
								label="Gambar tanda tangan kwitansi"
								value={finance.receiptSignatureUrl}
								onChange={(url) =>
									setFinance({ ...finance, receiptSignatureUrl: url })
								}
								category="FINANCE"
								hint="Scan/foto tanda tangan (PNG latar transparan paling bagus). Otomatis tercetak di semua kwitansi; kosongkan untuk tanpa gambar."
							/>
							<Button
								type="submit"
								className="w-fit"
								disabled={saving}
							>
								{saving ? "Menyimpan…" : "Simpan"}
							</Button>
						</form>
					) : null}
				</CardContent>
			</Card>
			) : null}

			{/* ---- Notifikasi WhatsApp ---- */}
			{(!section || section === "whatsapp") ? (
			<Card>
				<CardHeader>
					<CardTitle>Notifikasi WhatsApp Otomatis</CardTitle>
					<CardDescription>
						Nomor WA admin penerima notifikasi otomatis (mis. bukti pembayaran
						baru) dan jenis event yang mengirim WA.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{whatsapp ? (
						<form
							className="grid gap-4"
							onSubmit={(e) => {
								e.preventDefault();
								saveMutation.mutate({ key: "whatsapp", value: whatsapp });
							}}
						>
							<div className="grid gap-4 rounded-lg border p-4">
								<p className="text-sm font-medium">Gateway Pengiriman</p>
								<div className="grid gap-4 sm:grid-cols-2">
									<div className="grid gap-1.5">
										<Label htmlFor="wa-provider">Provider</Label>
										<select
											id="wa-provider"
											className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
											value={whatsapp.provider}
											onChange={(e) =>
												setWhatsapp({
													...whatsapp,
													provider: e.target.value,
												})
											}
										>
											<option value="log">Log (uji coba — tidak kirim nyata)</option>
											<option value="fonnte">Fonnte (kirim WA sungguhan)</option>
										</select>
									</div>
									<div className="grid gap-1.5">
										<Label htmlFor="wa-sender">Nomor WA Pengirim</Label>
										<Input
											id="wa-sender"
											placeholder="cth: 081234567890"
											value={whatsapp.senderNumber}
											onChange={(e) =>
												setWhatsapp({
													...whatsapp,
													senderNumber: e.target.value,
												})
											}
										/>
										<p className="text-xs text-muted-foreground">
											Harus nomor yang dipairing sebagai device di akun
											gateway (Fonnte).
										</p>
									</div>
									<div className="grid gap-1.5">
										<Label htmlFor="wa-token">Token API</Label>
										<Input
											id="wa-token"
											type="password"
											autoComplete="new-password"
											placeholder={
												whatsapp.apiToken === "********"
													? "Sudah tersimpan — isi untuk ganti"
													: "Token dari dashboard gateway"
											}
											value={whatsapp.apiToken}
											onChange={(e) =>
												setWhatsapp({
													...whatsapp,
													apiToken: e.target.value,
												})
											}
										/>
										<p className="text-xs text-muted-foreground">
											{whatsapp.apiToken === "********"
												? "Token tersimpan dan disamarkan (******** bukan token asli). Kosongkan lalu isi token baru bila ingin mengganti."
												: "Token dari menu Token pada device di dashboard Fonnte."}
										</p>
									</div>
									<div className="grid gap-1.5">
										<Label htmlFor="wa-apiurl">URL API</Label>
										<Input
											id="wa-apiurl"
											value={whatsapp.apiUrl}
											onChange={(e) =>
												setWhatsapp({
													...whatsapp,
													apiUrl: e.target.value,
												})
											}
										/>
									</div>
								</div>
								<div>
									<Button
										type="button"
										variant="outline"
										size="sm"
										disabled={
											waTestM.isPending ||
											!whatsapp.adminPhone.trim() ||
											saveMutation.isPending
										}
										onClick={() =>
											waTestM.mutate(whatsapp.adminPhone.trim())
										}
									>
										<Send className="size-4" />
										{waTestM.isPending
											? "Mengirim…"
											: "Kirim WA Tes ke Nomor Admin"}
									</Button>
									<p className="mt-1 text-xs text-muted-foreground">
										Simpan pengaturan dulu, lalu kirim tes — pantau statusnya di
										tabel Outbox di bawah.
									</p>
								</div>
							</div>
							<div className="grid gap-1.5 max-w-sm">
								<Label htmlFor="wa-admin">Nomor WA Admin</Label>
								<Input
									id="wa-admin"
									placeholder="cth: 081234567890"
									value={whatsapp.adminPhone}
									onChange={(e) =>
										setWhatsapp({ ...whatsapp, adminPhone: e.target.value })
									}
								/>
								<p className="text-xs text-muted-foreground">
									Kosongkan untuk menonaktifkan notifikasi WA ke admin.
								</p>
							</div>
							<div className="grid gap-3">
								{WA_TOGGLES.map((t) => (
									<label
										key={t.key}
										className="flex items-start gap-3 rounded-lg border p-3"
									>
										<Checkbox
											checked={whatsapp[t.key]}
											onCheckedChange={(v) =>
												setWhatsapp({ ...whatsapp, [t.key]: v === true })
											}
										/>
										<span>
											<span className="block text-sm font-medium">{t.label}</span>
											<span className="block text-xs text-muted-foreground">
												{t.hint}
											</span>
										</span>
									</label>
								))}
							</div>
							<div>
								<Button type="submit" disabled={saving}>
									{saving ? "Menyimpan…" : "Simpan Notifikasi"}
								</Button>
							</div>
						</form>
					) : null}
				</CardContent>
			</Card>
			) : null}

			{/* ---- Template Reminder WhatsApp ---- */}
			{(!section || section === "reminders") ? (
			<Card>
				<CardHeader>
					<CardTitle>Template Reminder WhatsApp</CardTitle>
					<CardDescription>
						Format pesan yang dikirim lewat tombol Reminder di halaman kelompok
						dan laporan tutor berhalangan. Pakai placeholder {"{{nama}}"} untuk
						data otomatis.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{reminders ? (
						<form
							className="grid gap-4"
							onSubmit={(e) => {
								e.preventDefault();
								saveMutation.mutate({ key: "reminders", value: reminders });
							}}
						>
							{(
								[
									{
										key: "paymentDue",
										label: "Reminder Pembayaran",
										hint: "Placeholder: {{children}} nama anak · {{group}} kelompok · {{detail}} daftar tagihan (no. invoice, sisa, program, jatuh tempo)",
									},
									{
										key: "weeklySchedule",
										label: "Reminder Jadwal Mingguan",
										hint: "Placeholder: {{children}} · {{group}} · {{week}} rentang minggu · {{days}} jadwal per-hari termasuk libur",
									},
									{
										key: "monthlyPerformance",
										label: "Reminder Performa Bulanan",
										hint: "Placeholder: {{children}} · {{group}} · {{month}} nama bulan · {{detail}} rekap absensi + ujian + peringkat",
									},
									{
										key: "feedback",
										label: "Reminder Feedback Mingguan",
										hint: "Placeholder: {{children}} · {{group}}",
									},
									{
										key: "tutorAbsence",
										label: "Info Tutor Berhalangan",
										hint: "Placeholder: {{children}} · {{tutor}} · {{datetime}} · {{subject}} · {{group}} · {{reason}}",
									},
								] as Array<{ key: keyof ReminderTemplates; label: string; hint: string }>
							).map((f) => (
								<div key={f.key} className="grid gap-1.5 rounded-lg border p-3">
									<Label htmlFor={`tpl-${f.key}`}>{f.label}</Label>
									<textarea
										id={`tpl-${f.key}`}
										rows={5}
										className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
										value={reminders[f.key]}
										onChange={(e) =>
											setReminders({ ...reminders, [f.key]: e.target.value })
										}
									/>
									<p className="text-xs text-muted-foreground">{f.hint}</p>
								</div>
							))}
							<div>
								<Button type="submit" disabled={saving}>
									{saving ? "Menyimpan…" : "Simpan Template"}
								</Button>
							</div>
						</form>
					) : null}
				</CardContent>
			</Card>
			) : null}

			{/* ---- Email / SMTP ---- */}
			{(!section || section === "mail") ? (
			<Card>
				<CardHeader>
					<CardTitle>Email (SMTP)</CardTitle>
					<CardDescription>
						Dipakai untuk mengirim link reset kata sandi dan email
						transaksional lain. Kosongkan host untuk mode log (email dicetak
						di log API, tanpa pengiriman nyata).
					</CardDescription>
				</CardHeader>
				<CardContent>
					{mail ? (
						<form
							className="grid gap-4"
							onSubmit={(e) => {
								e.preventDefault();
								saveMutation.mutate({ key: "mail", value: mail });
							}}
						>
							<div className="grid gap-4 sm:grid-cols-3">
								<div className="grid gap-1.5 sm:col-span-2">
									<Label htmlFor="mail-host">Host SMTP</Label>
									<Input
										id="mail-host"
										value={mail.host}
										onChange={(e) =>
											setMail({ ...mail, host: e.target.value })
										}
										placeholder="cth: smtp.gmail.com"
									/>
								</div>
								<div className="grid gap-1.5">
									<Label htmlFor="mail-port">Port</Label>
									<Input
										id="mail-port"
										type="number"
										min={1}
										max={65535}
										value={mail.port}
										onChange={(e) =>
											setMail({ ...mail, port: Number(e.target.value) })
										}
									/>
								</div>
							</div>
							<div className="grid gap-4 sm:grid-cols-2">
								<div className="grid gap-1.5">
									<Label htmlFor="mail-user">Username</Label>
									<Input
										id="mail-user"
										autoComplete="off"
										value={mail.user}
										onChange={(e) =>
											setMail({ ...mail, user: e.target.value })
										}
										placeholder="email pengirim"
									/>
								</div>
								<div className="grid gap-1.5">
									<Label htmlFor="mail-pass">Password / App Password</Label>
									<Input
										id="mail-pass"
										type="password"
										autoComplete="new-password"
										value={mail.pass}
										onChange={(e) =>
											setMail({ ...mail, pass: e.target.value })
										}
										placeholder={
											mail.pass === "********"
												? "Sudah tersimpan — isi untuk ganti"
												: "••••••••"
										}
									/>
								</div>
							</div>
							<div className="grid gap-4 sm:grid-cols-2">
								<div className="grid gap-1.5">
									<Label htmlFor="mail-from">Alamat Pengirim (From)</Label>
									<Input
										id="mail-from"
										value={mail.from}
										onChange={(e) =>
											setMail({ ...mail, from: e.target.value })
										}
										placeholder='cth: "Bimbel GFS &lt;no-reply@gfs.id&gt;"'
									/>
								</div>
								<label className="flex items-center gap-3 rounded-lg border p-3 self-end">
									<Checkbox
										checked={mail.secure}
										onCheckedChange={(v) =>
											setMail({ ...mail, secure: v === true })
										}
									/>
									<span className="text-sm">
										<span className="block font-medium">SSL/TLS langsung</span>
										<span className="block text-xs text-muted-foreground">
											Aktifkan untuk port 465; biarkan mati untuk 587 (STARTTLS)
										</span>
									</span>
								</label>
							</div>
							<div>
								<Button type="submit" disabled={saving}>
									{saving ? "Menyimpan…" : "Simpan Email"}
								</Button>
							</div>
						</form>
					) : null}
				</CardContent>
			</Card>
			) : null}

			{/* ---- Payment Gateway (Midtrans) ---- */}
			{(!section || section === "midtrans") ? (
			<Card>
				<CardHeader>
					<CardTitle>Payment Gateway (Midtrans)</CardTitle>
					<CardDescription>
						Pembayaran online untuk orang tua via Midtrans Snap (QRIS, VA,
						e-wallet, kartu). Nonaktif = mode sandbox lokal (provider DUMMY)
						untuk pengujian.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{midtrans ? (
						<form
							className="grid gap-4"
							onSubmit={(e) => {
								e.preventDefault();
								saveMutation.mutate({ key: "midtrans", value: midtrans });
							}}
						>
							<div className="grid gap-4 sm:grid-cols-2">
								<label className="flex items-center gap-3 rounded-lg border p-3">
									<Checkbox
										checked={midtrans.enabled}
										onCheckedChange={(v) =>
											setMidtrans({ ...midtrans, enabled: v === true })
										}
									/>
									<span className="text-sm">
										<span className="block font-medium">
											Aktifkan Midtrans
										</span>
										<span className="block text-xs text-muted-foreground">
											Pembayaran online lewat Snap Midtrans
										</span>
									</span>
								</label>
								<label className="flex items-center gap-3 rounded-lg border p-3">
									<Checkbox
										checked={midtrans.isProduction}
										onCheckedChange={(v) =>
											setMidtrans({ ...midtrans, isProduction: v === true })
										}
									/>
									<span className="text-sm">
										<span className="block font-medium">
											Mode Produksi
										</span>
										<span className="block text-xs text-muted-foreground">
											Mati = sandbox.midtrans.com (untuk uji coba)
										</span>
									</span>
								</label>
							</div>
							<div className="grid gap-4 sm:grid-cols-2">
								<div className="grid gap-1.5">
									<Label htmlFor="mt-server">Server Key</Label>
									<Input
										id="mt-server"
										type="password"
										autoComplete="new-password"
										value={midtrans.serverKey}
										onChange={(e) =>
											setMidtrans({ ...midtrans, serverKey: e.target.value })
										}
										placeholder={
											midtrans.serverKey === "********"
												? "Sudah tersimpan — isi untuk ganti"
												: "cth: Mid-server-xxxx"
										}
									/>
								</div>
								<div className="grid gap-1.5">
									<Label htmlFor="mt-client">Client Key</Label>
									<Input
										id="mt-client"
										value={midtrans.clientKey}
										onChange={(e) =>
											setMidtrans({ ...midtrans, clientKey: e.target.value })
										}
										placeholder="cth: Mid-client-xxxx"
									/>
								</div>
							</div>
							<p className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
								Setelah aktif, daftarkan URL notifikasi berikut di dashboard
								Midtrans → Settings → Configuration →{" "}
								<strong>Payment Notification URL</strong>:{" "}
								<code>{settingsQ.data?.branding?.appUrl || "{URL-API-ANDA}"}/api/webhooks/midtrans</code>
								{" "}(ganti dengan alamat API publik bila berbeda). Server Key
								tersimpan ter-mask — kosongkan lalu isi key baru bila ingin
								mengganti.
							</p>
							<div>
								<Button type="submit" disabled={saving}>
									{saving ? "Menyimpan…" : "Simpan Payment Gateway"}
								</Button>
							</div>
						</form>
					) : null}
				</CardContent>
			</Card>
			) : null}

			{/* ---- Akun Kas / Bank ---- */}
			{canViewAccounts && (!section || section === "accounts") ? (
			<Card>
				<CardHeader>
					<CardTitle>Akun Kas / Bank</CardTitle>
					<CardDescription>
						Akun penerimaan pembayaran &amp; pengeluaran.
					</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-4">
					{accountsQ.isLoading ? <Skeleton className="h-16 w-full" /> : null}
					{accountsQ.isError ? (
						<p className="text-sm text-destructive">
							{err(accountsQ.error, "Gagal memuat akun kas/bank.")}
						</p>
					) : null}
					{accountsQ.data?.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							Belum ada akun kas/bank terdaftar.
						</p>
					) : null}
					<div className="grid gap-2 md:grid-cols-2">
						{accountsQ.data?.map((acc) => (
							<div
								key={acc.id}
								className="flex items-center justify-between rounded-lg border p-3"
							>
								<div>
									<p className="text-sm font-medium">{acc.name}</p>
									{acc.code ? (
										<p className="text-xs text-muted-foreground">{acc.code}</p>
									) : null}
								</div>
								<div className="flex items-center gap-1">
									<Badge variant="outline">{acc.type}</Badge>
									{acc.isActive ? null : (
										<Badge variant="destructive">Nonaktif</Badge>
									)}
									<Button
										type="button"
										variant="ghost"
										size="sm"
										disabled={toggleAccMutation.isPending}
										onClick={() =>
											toggleAccMutation.mutate({
												id: acc.id,
												isActive: !acc.isActive,
											})
										}
									>
										{acc.isActive ? "Nonaktifkan" : "Aktifkan"}
									</Button>
									<Button
										type="button"
										variant="ghost"
										size="sm"
										disabled={deleteAccMutation.isPending}
										onClick={() => setAccToDelete(acc)}
										aria-label={`Hapus ${acc.name}`}
									>
										<Trash2 className="size-4 text-destructive" />
									</Button>
								</div>
							</div>
						))}
					</div>
					<form
						className="flex flex-wrap items-end gap-3 rounded-lg border border-dashed p-3"
						onSubmit={(e) => {
							e.preventDefault();
							createAccMutation.mutate({
								name: newAcc.name,
								code: newAcc.code || undefined,
								type: newAcc.type,
							});
						}}
					>
						<div className="grid gap-1.5">
							<Label htmlFor="acc-name">Nama akun</Label>
							<Input
								id="acc-name"
								value={newAcc.name}
								onChange={(e) => setNewAcc({ ...newAcc, name: e.target.value })}
								placeholder="cth: Kas Kecil"
							/>
						</div>
						<div className="grid gap-1.5">
							<Label htmlFor="acc-code">Kode</Label>
							<Input
								id="acc-code"
								className="w-28"
								value={newAcc.code}
								onChange={(e) => setNewAcc({ ...newAcc, code: e.target.value })}
								placeholder="KAS2"
							/>
						</div>
						<div className="grid gap-1.5">
							<Label htmlFor="acc-type">Tipe</Label>
							<select
								id="acc-type"
								className="h-9 rounded-md border bg-background px-3 text-sm"
								value={newAcc.type}
								onChange={(e) => setNewAcc({ ...newAcc, type: e.target.value })}
							>
								<option value="CASH">CASH</option>
								<option value="BANK">BANK</option>
							</select>
						</div>
						<Button
							type="submit"
							variant="secondary"
							disabled={createAccMutation.isPending || !newAcc.name.trim()}
						>
							Tambah Akun
						</Button>
					</form>
				</CardContent>
			</Card>

			) : null}


			<ConfirmDialog
				open={accToDelete !== null}
				onOpenChange={(open) => {
					if (!open) setAccToDelete(null);
				}}
				title="Hapus akun kas/bank?"
				description={`Akun "${accToDelete?.name}" akan dihapus permanen. Akun yang sudah dipakai di transaksi tidak bisa dihapus — nonaktifkan saja.`}
				confirmLabel="Ya, hapus"
				pending={deleteAccMutation.isPending}
				onConfirm={() => {
					if (accToDelete) deleteAccMutation.mutate(accToDelete.id);
				}}
			/>
		</div>
	);
}
