import type { IconSvgElement } from "@hugeicons/react";
import {
	Analytics01Icon,
	Award01Icon,
	BankIcon,
	BookOpen01Icon,
	Calendar01Icon,
	ChartHistogramIcon,
	ChartLineIcon,
	CheckListIcon,
	Coins01Icon,
	DashboardSquare01Icon,
	FileValidationIcon,
	Home01Icon,
	InvoiceIcon,
	Megaphone01Icon,
	Money01Icon,
	Notebook01Icon,
	Setting07Icon,
	TaskDaily01Icon,
	User02Icon,
	UserAccountIcon,
	UserGroupIcon,
	Wallet01Icon,
} from "@hugeicons/core-free-icons";

export type RoleKey =
	| "siswa"
	| "orang-tua"
	| "tutor"
	| "admin-finance"
	| "admin-academic"
	| "owner";

/** Nama role di backend (tabel `roles`), dipakai untuk cek `user.roles.includes(...)`. */
export const ROLE_BACKEND_NAME: Record<RoleKey, string> = {
	siswa: "SISWA",
	"orang-tua": "ORANG_TUA",
	tutor: "TUTOR",
	"admin-finance": "ADMIN_FINANCE",
	"admin-academic": "ADMIN_ACADEMIC",
	owner: "OWNER",
};

export const ROLE_LABELS: Record<RoleKey, string> = {
	siswa: "Siswa",
	"orang-tua": "Orang Tua",
	tutor: "Tutor",
	"admin-finance": "Admin Finance",
	"admin-academic": "Admin Academic",
	owner: "Owner",
};

/** Kebalikan dari ROLE_BACKEND_NAME, dipakai untuk redirect setelah login. */
export const ROLE_KEY_BY_BACKEND_NAME: Record<string, RoleKey> =
	Object.fromEntries(
		(Object.entries(ROLE_BACKEND_NAME) as [RoleKey, string][]).map(
			([key, name]) => [name, key],
		),
	);

export interface NavItem {
	slug: string;
	label: string;
	icon: IconSvgElement;
	/** [nav] = bottom nav utama mobile, [lainnya] = masuk drawer "Lainnya" (lihat docs/ROLE_PAGES.md). */
	placement: "nav" | "lainnya";
}

/** Sumber: docs/ROLE_PAGES.md. Item pertama tiap role adalah Beranda/Dashboard (root path role). */
export const ROLE_NAV: Record<RoleKey, NavItem[]> = {
	siswa: [
		{ slug: "", label: "Beranda", icon: Home01Icon, placement: "nav" },
		{ slug: "jadwal", label: "Jadwal", icon: Calendar01Icon, placement: "nav" },
		{
			slug: "ujian",
			label: "Ujian",
			icon: FileValidationIcon,
			placement: "nav",
		},
		{ slug: "latsol", label: "Latsol", icon: Notebook01Icon, placement: "nav" },
		{
			slug: "performa",
			label: "Performa",
			icon: ChartLineIcon,
			placement: "lainnya",
		},
		{
			slug: "ranking",
			label: "Ranking",
			icon: Award01Icon,
			placement: "lainnya",
		},
		{
			slug: "pengumuman",
			label: "Pengumuman",
			icon: Megaphone01Icon,
			placement: "lainnya",
		},
		{ slug: "profil", label: "Profil", icon: User02Icon, placement: "lainnya" },
	],
	"orang-tua": [
		{ slug: "", label: "Beranda", icon: Home01Icon, placement: "nav" },
		{ slug: "anak", label: "Anak", icon: UserGroupIcon, placement: "nav" },
		{
			slug: "pembayaran",
			label: "Pembayaran",
			icon: Wallet01Icon,
			placement: "nav",
		},
		{ slug: "jadwal", label: "Jadwal", icon: Calendar01Icon, placement: "nav" },
		{
			slug: "kehadiran",
			label: "Kehadiran",
			icon: CheckListIcon,
			placement: "lainnya",
		},
		{
			slug: "program",
			label: "Program",
			icon: BookOpen01Icon,
			placement: "lainnya",
		},
		{
			slug: "performa-anak",
			label: "Performa Anak",
			icon: ChartLineIcon,
			placement: "lainnya",
		},
		{
			slug: "pengumuman",
			label: "Pengumuman",
			icon: Megaphone01Icon,
			placement: "lainnya",
		},
		{ slug: "profil", label: "Profil", icon: User02Icon, placement: "lainnya" },
	],
	tutor: [
		{ slug: "", label: "Beranda", icon: Home01Icon, placement: "nav" },
		{
			slug: "kelompok",
			label: "Kelompok",
			icon: UserGroupIcon,
			placement: "nav",
		},
		{
			slug: "jadwal-sesi",
			label: "Jadwal/Sesi",
			icon: Calendar01Icon,
			placement: "nav",
		},
		{
			slug: "absensi",
			label: "Absensi",
			icon: CheckListIcon,
			placement: "nav",
		},
		{
			slug: "latsol",
			label: "Latsol",
			icon: Notebook01Icon,
			placement: "lainnya",
		},
		{
			slug: "ujian",
			label: "Ujian",
			icon: FileValidationIcon,
			placement: "lainnya",
		},
		{
			slug: "nilai",
			label: "Nilai",
			icon: TaskDaily01Icon,
			placement: "lainnya",
		},
		{
			slug: "pembahasan",
			label: "Pembahasan",
			icon: BookOpen01Icon,
			placement: "lainnya",
		},
		{
			slug: "profil",
			label: "Profil & Status Kepegawaian",
			icon: User02Icon,
			placement: "lainnya",
		},
	],
	"admin-finance": [
		{
			slug: "",
			label: "Dashboard",
			icon: DashboardSquare01Icon,
			placement: "nav",
		},
		{ slug: "siswa", label: "Siswa", icon: UserGroupIcon, placement: "nav" },
		{
			slug: "pendaftaran",
			label: "Pendaftaran",
			icon: UserAccountIcon,
			placement: "nav",
		},
		{
			slug: "invoice",
			label: "Invoice",
			icon: InvoiceIcon,
			placement: "lainnya",
		},
		{
			slug: "pembayaran",
			label: "Pembayaran",
			icon: Wallet01Icon,
			placement: "lainnya",
		},
		{
			slug: "bukti",
			label: "Bukti",
			icon: FileValidationIcon,
			placement: "lainnya",
		},
		{
			slug: "kas-bank",
			label: "Kas/Bank",
			icon: BankIcon,
			placement: "lainnya",
		},
		{
			slug: "rab",
			label: "RAB",
			icon: ChartHistogramIcon,
			placement: "lainnya",
		},
		{
			slug: "pengeluaran",
			label: "Pengeluaran",
			icon: Money01Icon,
			placement: "lainnya",
		},
		{
			slug: "payroll",
			label: "Payroll",
			icon: Coins01Icon,
			placement: "lainnya",
		},
		{
			slug: "laporan",
			label: "Laporan",
			icon: Analytics01Icon,
			placement: "lainnya",
		},
		{
			slug: "pengaturan",
			label: "Pengaturan",
			icon: Setting07Icon,
			placement: "lainnya",
		},
	],
	"admin-academic": [
		{
			slug: "",
			label: "Dashboard",
			icon: DashboardSquare01Icon,
			placement: "nav",
		},
		{
			slug: "program",
			label: "Program",
			icon: BookOpen01Icon,
			placement: "nav",
		},
		{
			slug: "kelompok",
			label: "Kelompok",
			icon: UserGroupIcon,
			placement: "nav",
		},
		{
			slug: "level",
			label: "Level",
			icon: TaskDaily01Icon,
			placement: "lainnya",
		},
		{
			slug: "tutor",
			label: "Tutor",
			icon: UserAccountIcon,
			placement: "lainnya",
		},
		{
			slug: "jadwal",
			label: "Jadwal",
			icon: Calendar01Icon,
			placement: "lainnya",
		},
		{
			slug: "materi",
			label: "Materi",
			icon: Notebook01Icon,
			placement: "lainnya",
		},
		{
			slug: "soal",
			label: "Soal (Bank Soal)",
			icon: FileValidationIcon,
			placement: "lainnya",
		},
		{
			slug: "latsol",
			label: "Latsol",
			icon: Notebook01Icon,
			placement: "lainnya",
		},
		{
			slug: "ujian",
			label: "Ujian",
			icon: FileValidationIcon,
			placement: "lainnya",
		},
		{
			slug: "analisis",
			label: "Analisis",
			icon: ChartLineIcon,
			placement: "lainnya",
		},
		{
			slug: "ranking",
			label: "Ranking",
			icon: Award01Icon,
			placement: "lainnya",
		},
		{
			slug: "laporan",
			label: "Laporan",
			icon: Analytics01Icon,
			placement: "lainnya",
		},
	],
	owner: [
		{
			slug: "",
			label: "Dashboard KPI",
			icon: DashboardSquare01Icon,
			placement: "nav",
		},
		{ slug: "siswa", label: "Siswa", icon: UserGroupIcon, placement: "nav" },
		{
			slug: "akademik",
			label: "Akademik",
			icon: BookOpen01Icon,
			placement: "nav",
		},
		{
			slug: "tutor",
			label: "Tutor",
			icon: UserAccountIcon,
			placement: "lainnya",
		},
		{
			slug: "keuangan",
			label: "Keuangan",
			icon: Wallet01Icon,
			placement: "lainnya",
		},
		{
			slug: "piutang",
			label: "Piutang",
			icon: Money01Icon,
			placement: "lainnya",
		},
		{
			slug: "rab-vs-actual",
			label: "RAB vs Actual",
			icon: ChartHistogramIcon,
			placement: "lainnya",
		},
		{
			slug: "payroll",
			label: "Payroll",
			icon: Coins01Icon,
			placement: "lainnya",
		},
		{
			slug: "laporan",
			label: "Laporan",
			icon: Analytics01Icon,
			placement: "lainnya",
		},
		{
			slug: "audit",
			label: "Audit (Log)",
			icon: CheckListIcon,
			placement: "lainnya",
		},
	],
};

export function findNavItem(role: RoleKey, slug: string): NavItem | undefined {
	return ROLE_NAV[role].find((item) => item.slug === slug);
}
