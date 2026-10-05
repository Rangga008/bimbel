import { notFound } from "next/navigation";
import { ArManager } from "@/components/phase2c/ar-manager";
import { ProofsManager } from "@/components/phase2b/proofs-manager";
import { KasBankManager } from "@/components/phase2c/kas-bank-manager";
import { BudgetManager } from "@/components/phase2d/budget-manager";
import { ExpenseManager } from "@/components/phase2d/expense-manager";
import { AdvancedReportsManager } from "@/components/phase6/advanced-reports";
import { ProfilePage } from "@/components/shared/profile-page";
import { NotificationsInbox } from "@/components/phase1d/notifications-inbox";
import { SkeletonPage } from "@/components/skeleton-page";
import { findNavItem } from "@/config/role-nav";

export default async function OwnerMenuPage({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = await params;
	const item = findNavItem("owner", slug);
	if (!item) notFound();
	if (slug === "notifikasi") return <NotificationsInbox />;
	if (slug === "profil") return <ProfilePage />;
	if (slug === "piutang")
		return (
			<div className="flex flex-col gap-8">
				<ArManager canRefund={false} />
				<KasBankManager />
			</div>
		);
	if (slug === "bukti") return <ProofsManager canVerify={false} />;
	if (slug === "rab-vs-actual")
		return (
			<div className="flex flex-col gap-8">
				<BudgetManager canManage={false} />
				<ExpenseManager canManage={false} />
			</div>
		);
	if (slug === "laporan") return <AdvancedReportsManager />;
	return <SkeletonPage role="owner" title={item.label} />;
}

