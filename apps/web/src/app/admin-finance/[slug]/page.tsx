import { notFound } from "next/navigation";
import { StudentsManager } from "@/components/phase1a/students-manager";
import { ParentsManager } from "@/components/phase1a/parents-manager";
import { InvoicesManager } from "@/components/phase2a/invoices-manager";
import { PaymentsManager } from "@/components/phase2b/payments-manager";
import { DailyTransactions } from "@/components/phase2b/daily-transactions";
import { ProofsManager } from "@/components/phase2b/proofs-manager";
import { ReceiptsManager } from "@/components/phase2b/receipts-manager";
import { ArManager } from "@/components/phase2c/ar-manager";
import { KasBankManager } from "@/components/phase2c/kas-bank-manager";
import { BudgetManager } from "@/components/phase2d/budget-manager";
import { ExpenseManager } from "@/components/phase2d/expense-manager";
import { AdvancedReportsManager } from "@/components/phase6/advanced-reports";
import { PayrollManager } from "@/components/phase5a/payroll-manager";
import { FinanceSettings } from "@/components/shared/finance-settings";
import { AccountsManager } from "@/components/phase0b/accounts-manager";
import { ProfilePage } from "@/components/shared/profile-page";
import { NotificationsInbox } from "@/components/phase1d/notifications-inbox";
import { MediaLibraryManager } from "@/components/shared/media-library-manager";
import { FinanceEnrollments } from "@/components/enrollments/finance-enrollments";
import { GroupsManager } from "@/components/phase1b/groups-manager";
import { SkeletonPage } from "@/components/skeleton-page";
import { findNavItem } from "@/config/role-nav";

export default async function AdminFinanceMenuPage({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = await params;
	const item = findNavItem("admin-finance", slug);
	if (!item) notFound();
	if (slug === "pendaftaran") return <FinanceEnrollments />;
	if (slug === "kelompok")
		return <GroupsManager canManage={false} basePath="/admin-finance" />;
	if (slug === "siswa") return <StudentsManager canManage basePath="/admin-finance" />;
	if (slug === "orang-tua") return <ParentsManager canManage basePath="/admin-finance" />;
	if (slug === "invoice") return <InvoicesManager canManage />;
	if (slug === "transaksi-harian") return <DailyTransactions />;
	if (slug === "pembayaran")
		return (
			<div className="flex flex-col gap-8">
				<PaymentsManager canVerify />
				<ReceiptsManager title="Kwitansi" />
			</div>
		);
	if (slug === "bukti") return <ProofsManager canVerify />;
	if (slug === "piutang") return <ArManager canRefund />;
	if (slug === "kas-bank") return <KasBankManager />;
	if (slug === "pustaka") return <MediaLibraryManager category="FINANCE" />;
	if (slug === "rab") return <BudgetManager canManage />;
	if (slug === "pengeluaran") return <ExpenseManager canManage />;
	if (slug === "payroll") return <PayrollManager canManage />;
	if (slug === "laporan") return <AdvancedReportsManager />;
	if (slug === "pengaturan") return <FinanceSettings />;
	if (slug === "akun") return <AccountsManager basePath="/admin-finance" />;
	if (slug === "notifikasi") return <NotificationsInbox />;
	if (slug === "profil") return <ProfilePage />;
	return <SkeletonPage role="admin-finance" title={item.label} />;
}
