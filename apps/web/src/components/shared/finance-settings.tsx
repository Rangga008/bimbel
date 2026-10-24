"use client";

import { useState, type ReactNode } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Send, Trash2, ChevronRight, ArrowLeft } from "lucide-react";

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

interface HeroImageEntry {
	url: string;
	link: string;
}

interface TestimonialEntry {
	name: string;
	school: string;
	quote: string;
}

interface LocationEntry {
	name: string;
	address: string;
}

interface DisplaySettings {
	heroImages: HeroImageEntry[];
	registrationUrl: string;
	heroBadge: string;
	heroTitle: string;
	heroHighlight: string;
	heroSubtitle: string;
	aboutParagraph1: string;
	aboutParagraph2: string;
	officeAddress: string;
	officeHours: string;
	ctaTitle: string;
	ctaSubtitle: string;
	testimonials: TestimonialEntry[];
	locations: LocationEntry[];
}

/** Setting lama menyimpan heroImages sebagai array string — ubah ke bentuk
 *  {url, link} supaya form selalu konsisten. */
function normalizeDisplay(d: DisplaySettings | undefined | null) {
	if (!d) return null;
	return {
		...d,
		heroImages: ((d.heroImages ?? []) as Array<HeroImageEntry | string>).map(
			(h) => (typeof h === "string" ? { url: h, link: "" } : h),
		),
		testimonials: d.testimonials ?? [],
		locations: d.locations ?? [],
	};
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
	accountNumber?: string | null;
	holderName?: string | null;
	isActive: boolean;
}

function err(e: unknown, fb: string) {
	return e instanceof ApiError ? e.message : fb;
}

/** Sub-bagian di pengaturan landing — judul + field + pratinjau opsional. */
function LandingSubSection({
	title,
	hint,
	children,
}: {
	title: string;
	hint?: string;
	children: ReactNode;
}) {
	return (
		<div className="grid gap-3 rounded-lg border p-4">
			<div>
				<p className="text-sm font-semibold">{title}</p>
				{hint ? (
					<p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
				) : null}
			</div>
			{children}
		</div>
	);
}

/** Kotak pratinjau kecil — merender tampilan section apa adanya. */
function LandingPreview({ children }: { children: ReactNode }) {
	return (
		<div className="grid gap-1.5">
			<p className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
				Pratinjau
			</p>
			<div className="overflow-hidden rounded-lg border">{children}</div>
		</div>
	);
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
		() => normalizeDisplay(settingsQ.data?.display),
	);
	const [exam, setExam] = useState<ExamSettings | null>(
		() => settingsQ.data?.exam ?? null,
	);
	const [newAcc, setNewAcc] = useState({
		name: "",
		code: "",
		type: "CASH",
		accountNumber: "",
		holderName: "",
	});
	const [editingAcc, setEditingAcc] = useState<FinancialAccount | null>(null);
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
			setDisplay(normalizeDisplay(settingsQ.data.display));
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
		mutationFn: (body: {
			name: string;
			code?: string;
			type: string;
			accountNumber?: string;
			holderName?: string;
		}) => apiFetch("/financial-accounts", { method: "POST", body }),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["financial-accounts"] });
			qc.invalidateQueries({ queryKey: ["ledger-accounts"] });
			setNewAcc({
				name: "",
				code: "",
				type: "CASH",
				accountNumber: "",
				holderName: "",
			});
			toast.success("Akun kas/bank ditambahkan.");
		},
		onError: (e) => toast.error(err(e, "Gagal menambah akun.")),
	});

	const editAccMutation = useMutation({
		mutationFn: (args: {
			id: string;
			accountNumber: string | null;
			holderName: string | null;
		}) =>
			apiFetch(`/financial-accounts/${args.id}`, {
				method: "PATCH",
				body: {
					accountNumber: args.accountNumber,
					holderName: args.holderName,
				},
			}),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["financial-accounts"] });
			setEditingAcc(null);
			toast.success("Rekening diperbarui.");
		},
		onError: (e) => toast.error(err(e, "Gagal memperbarui rekening.")),
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
			{(section === "branding") ? (
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
								hint="Ukuran ideal: persegi 1:1, minimal 512×512 px — PNG/WebP latar transparan paling bagus (logo tampil kecil di sidebar, login, dan landing). Upload baru atau pilih dari pustaka branding. Kosongkan untuk logo default."
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
			{(section === "display") ? (
			<Card>
				<CardHeader>
					<CardTitle>Tampilan Landing</CardTitle>
					<CardDescription>
						Foto hero (bisa diklik per gambar), teks tiap section, testimoni,
						alamat, dan ajakan akhir di halaman awal — tiap bagian punya
						pratinjau langsung.
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
							{/* ---- Foto hero + link per gambar ---- */}
							<LandingSubSection
								title="Foto Hero (slider halaman awal)"
								hint="Tiap foto bisa diberi link klik sendiri — mis. ke formulir pendaftaran atau halaman program. Kosongkan link bila foto tidak perlu bisa diklik."
							>
								<div className="rounded-md border border-brand-blue-200 bg-brand-blue-50/60 px-3 py-2 text-xs text-brand-blue-900">
									<p className="font-medium">Ukuran yang direkomendasikan</p>
									<p className="mt-0.5">
										Rasio <strong>21:9</strong> (landscape lebar) — ideal{" "}
										<strong>2100&nbsp;×&nbsp;900&nbsp;px</strong>, minimal
										1600&nbsp;×&nbsp;700&nbsp;px. Format JPG/PNG/WebP.
									</p>
									<p className="mt-0.5">
										Gambar tampil crop-tengah: di layar HP rasio berubah ke
										16:10 sehingga tepi kiri-kanan terpotong — posisikan
										subjek utama di tengah foto.
									</p>
								</div>
								{display.heroImages.length > 0 ? (
									<div className="grid gap-3 sm:grid-cols-2">
										{display.heroImages.map((img, i) => (
											<div
												key={`${img.url}-${i}`}
												className="grid gap-1.5"
											>
												<div className="group relative overflow-hidden rounded-lg border bg-muted/20">
													<img
														src={resolveAssetUrl(img.url)}
														alt={`Foto hero ${i + 1}`}
														className="aspect-[21/9] w-full object-cover"
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
												<Input
													type="url"
													value={img.link}
													onChange={(e) =>
														setDisplay({
															...display,
															heroImages: display.heroImages.map(
																(h, j) =>
																	j === i
																		? { ...h, link: e.target.value }
																		: h,
															),
														})
													}
													placeholder="Link klik (opsional) https://…"
													className="h-8 text-xs"
												/>
											</div>
										))}
									</div>
								) : (
									<p className="text-xs text-muted-foreground">
										Belum ada foto — hero landing menampilkan kartu fitur saja.
									</p>
								)}
								<div className="flex items-center gap-3">
									<Button
										type="button"
										variant="outline"
										size="sm"
										disabled={display.heroImages.length >= 10}
										onClick={() => setHeroPickerOpen(true)}
									>
										<Plus className="size-4" /> Tambah Foto
									</Button>
									<p className="text-xs text-muted-foreground">
										Maks. 10 foto — urutan tampil mengikuti urutan di sini.
									</p>
								</div>
							</LandingSubSection>

							{/* ---- Link pendaftaran ---- */}
							<LandingSubSection
								title="Link Formulir Pendaftaran"
								hint="Tombol 'Info & Pendaftaran' di header, hero, dan footer mengarah ke link ini — ganti tiap tahun ajaran."
							>
								<Input
									type="url"
									value={display.registrationUrl}
									onChange={(e) =>
										setDisplay({ ...display, registrationUrl: e.target.value })
									}
									placeholder="https://s.id/info-daftarGFS2627"
								/>
							</LandingSubSection>

							{/* ---- Teks hero ---- */}
							<LandingSubSection
								title="Teks Hero"
								hint="Judul besar di halaman awal. Tulis {appName} di subjudul untuk menyisipkan nama aplikasi otomatis."
							>
								<div className="grid gap-3 sm:grid-cols-2">
									<div className="grid gap-1.5">
										<Label>Badge kecil</Label>
										<Input
											value={display.heroBadge}
											onChange={(e) =>
												setDisplay({ ...display, heroBadge: e.target.value })
											}
										/>
									</div>
									<div className="grid gap-1.5">
										<Label>Judul</Label>
										<Input
											value={display.heroTitle}
											onChange={(e) =>
												setDisplay({ ...display, heroTitle: e.target.value })
											}
										/>
									</div>
									<div className="grid gap-1.5">
										<Label>Sorotan judul (warna emas)</Label>
										<Input
											value={display.heroHighlight}
											onChange={(e) =>
												setDisplay({
													...display,
													heroHighlight: e.target.value,
												})
											}
										/>
									</div>
									<div className="grid gap-1.5 sm:col-span-2">
										<Label>Subjudul</Label>
										<Textarea
											rows={2}
											value={display.heroSubtitle}
											onChange={(e) =>
												setDisplay({
													...display,
													heroSubtitle: e.target.value,
												})
											}
										/>
									</div>
								</div>
								<LandingPreview>
									<div className="bg-gradient-to-br from-[#032a41] via-[#074c74] to-[#0f77b4] p-5 text-white">
										<span className="inline-flex items-center rounded-full border border-amber-300/40 bg-amber-300/10 px-2.5 py-0.5 text-[11px] font-medium text-amber-200">
											{display.heroBadge || "…"}
										</span>
										<p className="mt-3 text-xl font-bold tracking-tight">
											{display.heroTitle}{" "}
											<span className="text-amber-400">
												{display.heroHighlight}
											</span>
										</p>
										<p className="mt-2 max-w-lg text-xs leading-relaxed text-sky-100">
											{display.heroSubtitle.replace(
												"{appName}",
												branding?.appName || "Bimbel GFS",
											)}
										</p>
									</div>
								</LandingPreview>
							</LandingSubSection>

							{/* ---- Tentang ---- */}
							<LandingSubSection
								title="Tentang Kami"
								hint="Dua paragraf di section Tentang halaman awal."
							>
								<div className="grid gap-3">
									<div className="grid gap-1.5">
										<Label>Paragraf 1</Label>
										<Textarea
											rows={3}
											value={display.aboutParagraph1}
											onChange={(e) =>
												setDisplay({
													...display,
													aboutParagraph1: e.target.value,
												})
											}
										/>
									</div>
									<div className="grid gap-1.5">
										<Label>Paragraf 2</Label>
										<Textarea
											rows={3}
											value={display.aboutParagraph2}
											onChange={(e) =>
												setDisplay({
													...display,
													aboutParagraph2: e.target.value,
												})
											}
										/>
									</div>
								</div>
								<LandingPreview>
									<div className="p-4 text-sm leading-relaxed text-muted-foreground">
										<p>{display.aboutParagraph1}</p>
										<p className="mt-2">{display.aboutParagraph2}</p>
									</div>
								</LandingPreview>
							</LandingSubSection>

							{/* ---- Alamat & jam ---- */}
							<LandingSubSection
								title="Alamat & Jam Kantor"
								hint="Tampil di kartu 'Mau datang langsung?' dan jam operasional di footer."
							>
								<div className="grid gap-3 sm:grid-cols-2">
									<div className="grid gap-1.5">
										<Label>Alamat</Label>
										<Input
											value={display.officeAddress}
											onChange={(e) =>
												setDisplay({
													...display,
													officeAddress: e.target.value,
												})
											}
										/>
									</div>
									<div className="grid gap-1.5">
										<Label>Jam operasional</Label>
										<Input
											value={display.officeHours}
											onChange={(e) =>
												setDisplay({
													...display,
													officeHours: e.target.value,
												})
											}
										/>
									</div>
								</div>
								<LandingPreview>
									<div className="border-amber-300/50 bg-amber-50 p-4 text-sm">
										<p className="font-medium">Mau datang langsung?</p>
										<p className="text-muted-foreground">
											Kantor {branding?.appName || "Bimbel GFS"}:{" "}
											{display.officeAddress} — {display.officeHours}.
										</p>
									</div>
								</LandingPreview>
							</LandingSubSection>

							{/* ---- Lokasi footer ---- */}
							<LandingSubSection
								title="Lokasi di Footer"
								hint="Daftar lokasi & jam buka di kolom 'Lokasi & Jam Buka' footer halaman awal. Kosongkan daftar ini untuk memakai data gedung dari menu Gedung. Maksimal 10."
							>
								<div className="grid gap-3">
									{display.locations.map((loc, i) => (
										<div
											key={i}
											className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_1.4fr_auto] sm:items-center"
										>
											<Input
												placeholder="Nama lokasi — mis. Cabang Cicaheum"
												value={loc.name}
												onChange={(e) =>
													setDisplay({
														...display,
														locations: display.locations.map(
															(x, j) =>
																j === i
																	? { ...x, name: e.target.value }
																	: x,
														),
													})
												}
											/>
											<Input
												placeholder="Alamat — mis. Jl. Hj. Saodah No. 125"
												value={loc.address}
												onChange={(e) =>
													setDisplay({
														...display,
														locations: display.locations.map(
															(x, j) =>
																j === i
																	? {
																			...x,
																			address: e.target.value,
																		}
																	: x,
														),
													})
												}
											/>
											<Button
												type="button"
												variant="ghost"
												size="sm"
												className="text-destructive hover:text-destructive"
												onClick={() =>
													setDisplay({
														...display,
														locations: display.locations.filter(
															(_, j) => j !== i,
														),
													})
												}
											>
												<Trash2 className="size-3.5" /> Hapus
											</Button>
										</div>
									))}
								</div>
								<div>
									<Button
										type="button"
										variant="outline"
										size="sm"
										disabled={display.locations.length >= 10}
										onClick={() =>
											setDisplay({
												...display,
												locations: [
													...display.locations,
													{ name: "", address: "" },
												],
											})
										}
									>
										<Plus className="size-4" /> Tambah Lokasi
									</Button>
								</div>
								{display.locations.length > 0 ? (
									<LandingPreview>
										<div className="bg-[#032a41] p-4 text-sm text-sky-100">
											<p className="mb-2 text-[11px] font-semibold tracking-widest text-amber-300 uppercase">
												Lokasi &amp; Jam Buka
											</p>
											<ul className="grid gap-2">
												{display.locations.map((loc, i) => (
													<li key={i}>
														<p className="font-medium text-white">
															{loc.name || "Nama lokasi"}
														</p>
														<p className="text-xs text-sky-200">
															{loc.address || "Alamat"}
														</p>
													</li>
												))}
											</ul>
										</div>
									</LandingPreview>
								) : null}
							</LandingSubSection>

							{/* ---- Testimoni ---- */}
							<LandingSubSection
								title="Testimoni"
								hint="Kutipan alumni & siswa di section Testimoni — maksimal 12."
							>
								<div className="grid gap-3">
									{display.testimonials.map((t, i) => (
										<div
											key={i}
											className="grid gap-2 rounded-md border p-3"
										>
											<div className="grid gap-2 sm:grid-cols-2">
												<Input
													placeholder="Nama"
													value={t.name}
													onChange={(e) =>
														setDisplay({
															...display,
															testimonials: display.testimonials.map(
																(x, j) =>
																	j === i
																		? { ...x, name: e.target.value }
																		: x,
															),
														})
													}
												/>
												<Input
													placeholder="Asal / kampus — mis. UNPAD — Fisika"
													value={t.school}
													onChange={(e) =>
														setDisplay({
															...display,
															testimonials: display.testimonials.map(
																(x, j) =>
																	j === i
																		? { ...x, school: e.target.value }
																		: x,
															),
														})
													}
												/>
											</div>
											<Textarea
												rows={2}
												placeholder="Kutipan testimoni"
												value={t.quote}
												onChange={(e) =>
													setDisplay({
														...display,
														testimonials: display.testimonials.map(
															(x, j) =>
																j === i
																	? { ...x, quote: e.target.value }
																	: x,
														),
													})
												}
											/>
											<div className="flex justify-end">
												<Button
													type="button"
													variant="ghost"
													size="sm"
													className="text-destructive hover:text-destructive"
													onClick={() =>
														setDisplay({
															...display,
															testimonials: display.testimonials.filter(
																(_, j) => j !== i,
															),
														})
													}
												>
													<Trash2 className="size-3.5" /> Hapus
												</Button>
											</div>
										</div>
									))}
								</div>
								<div>
									<Button
										type="button"
										variant="outline"
										size="sm"
										disabled={display.testimonials.length >= 12}
										onClick={() =>
											setDisplay({
												...display,
												testimonials: [
													...display.testimonials,
													{ name: "", school: "", quote: "" },
												],
											})
										}
									>
										<Plus className="size-4" /> Tambah Testimoni
									</Button>
								</div>
								{display.testimonials.length > 0 ? (
									<LandingPreview>
										<div className="grid gap-3 p-4 sm:grid-cols-2">
											{display.testimonials.map((t, i) => (
												<div
													key={i}
													className="rounded-lg border bg-card p-3"
												>
													<p className="text-sm font-semibold">
														{t.name || "Nama"}
													</p>
													<p className="text-xs text-muted-foreground">
														{t.school || "Asal / kampus"}
													</p>
													<p className="mt-2 text-xs leading-relaxed text-muted-foreground italic">
														&ldquo;{t.quote || "Kutipan…"}&rdquo;
													</p>
												</div>
											))}
										</div>
									</LandingPreview>
								) : null}
							</LandingSubSection>

							{/* ---- CTA akhir ---- */}
							<LandingSubSection
								title="Ajakan Akhir (CTA)"
								hint="Banner besar di bagian bawah sebelum footer."
							>
								<div className="grid gap-3">
									<div className="grid gap-1.5">
										<Label>Judul</Label>
										<Input
											value={display.ctaTitle}
											onChange={(e) =>
												setDisplay({ ...display, ctaTitle: e.target.value })
											}
										/>
									</div>
									<div className="grid gap-1.5">
										<Label>Subjudul</Label>
										<Textarea
											rows={2}
											value={display.ctaSubtitle}
											onChange={(e) =>
												setDisplay({
													...display,
													ctaSubtitle: e.target.value,
												})
											}
										/>
									</div>
								</div>
								<LandingPreview>
									<div className="bg-gradient-to-br from-[#032a41] via-[#074c74] to-[#0c5d8d] p-6 text-center text-white">
										<p className="text-lg font-bold tracking-tight">
											{display.ctaTitle}
										</p>
										<p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-sky-100">
											{display.ctaSubtitle}
										</p>
									</div>
								</LandingPreview>
							</LandingSubSection>

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
									heroImages: [...display.heroImages, { url, link: "" }].slice(
										0,
										10,
									),
								});
							}
						}}
					/>
				</CardContent>
			</Card>
			) : null}

			{/* ---- Ujian & Proctoring ---- */}
			{(section === "exam") ? (
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
			{(section === "company") ? (
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
			{(section === "finance") ? (
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
			{(section === "whatsapp") ? (
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
			{(section === "reminders") ? (
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
			{(section === "mail") ? (
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
			{(section === "midtrans") ? (
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
			{canViewAccounts && (section === "accounts") ? (
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
					<p className="text-xs text-muted-foreground">
						Nomor rekening &amp; atas nama yang diisi di sini ditampilkan ke orang
						tua saat mereka memilih tujuan transfer.
					</p>
					<div className="grid gap-2 md:grid-cols-2">
						{accountsQ.data?.map((acc) => (
							<div
								key={acc.id}
								className="rounded-lg border p-3"
							>
								<div className="flex items-start justify-between gap-2">
									<div className="min-w-0">
										<p className="text-sm font-medium">{acc.name}</p>
										{acc.code ? (
											<p className="text-xs text-muted-foreground">{acc.code}</p>
										) : null}
										{acc.accountNumber ? (
											<p className="mt-0.5 font-mono text-xs">
												{acc.accountNumber}
												{acc.holderName ? ` — a.n. ${acc.holderName}` : ""}
											</p>
										) : (
											<p className="mt-0.5 text-xs text-muted-foreground">
												Nomor rekening belum diisi
											</p>
										)}
									</div>
									<div className="flex shrink-0 items-center gap-1">
										<Badge variant="outline">{acc.type}</Badge>
										{acc.isActive ? null : (
											<Badge variant="destructive">Nonaktif</Badge>
										)}
									</div>
								</div>
								{editingAcc?.id === acc.id ? (
									<form
										className="mt-2 flex flex-wrap items-end gap-2 border-t pt-2"
										onSubmit={(e) => {
											e.preventDefault();
											editAccMutation.mutate({
												id: acc.id,
												accountNumber: editingAcc.accountNumber || null,
												holderName: editingAcc.holderName || null,
											});
										}}
									>
										<Input
											className="h-8 w-40 text-xs"
											placeholder="Nomor rekening"
											value={editingAcc.accountNumber ?? ""}
											onChange={(e) =>
												setEditingAcc({
													...editingAcc,
													accountNumber: e.target.value,
												})
											}
										/>
										<Input
											className="h-8 w-40 text-xs"
											placeholder="Atas nama"
											value={editingAcc.holderName ?? ""}
											onChange={(e) =>
												setEditingAcc({ ...editingAcc, holderName: e.target.value })
											}
										/>
										<Button type="submit" size="sm" disabled={editAccMutation.isPending}>
											Simpan
										</Button>
										<Button
											type="button"
											size="sm"
											variant="ghost"
											onClick={() => setEditingAcc(null)}
										>
											Batal
										</Button>
									</form>
								) : null}
								<div className="mt-2 flex items-center gap-1">
									<Button
										type="button"
										variant="ghost"
										size="sm"
										onClick={() =>
											setEditingAcc(editingAcc?.id === acc.id ? null : acc)
										}
									>
										<Pencil className="size-3.5" /> Rekening
									</Button>
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
								accountNumber: newAcc.accountNumber || undefined,
								holderName: newAcc.holderName || undefined,
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
						<div className="grid gap-1.5">
							<Label htmlFor="acc-number">No. Rekening</Label>
							<Input
								id="acc-number"
								className="w-44"
								value={newAcc.accountNumber}
								onChange={(e) =>
									setNewAcc({ ...newAcc, accountNumber: e.target.value })
								}
								placeholder="cth: 1234567890"
							/>
						</div>
						<div className="grid gap-1.5">
							<Label htmlFor="acc-holder">Atas Nama</Label>
							<Input
								id="acc-holder"
								className="w-44"
								value={newAcc.holderName}
								onChange={(e) =>
									setNewAcc({ ...newAcc, holderName: e.target.value })
								}
								placeholder="cth: Bimbel GFS"
							/>
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
