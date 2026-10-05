import { notFound } from "next/navigation";
import { ParentEnrollments } from "@/components/enrollments/parent-enrollments";
import { SessionsList } from "@/components/phase1c/sessions-list";
import { ParentAttendanceView } from "@/components/phase1d/parent-attendance-view";
import { NotificationsInbox } from "@/components/phase1d/notifications-inbox";
import { ParentPayments } from "@/components/phase2b/parent-payments";
import { ParentPerformancePage } from "@/components/phase4a/parent-performance-page";
import { ParentRankingPage } from "@/components/phase4b/parent-ranking";
import { FeedbackForm } from "@/components/feedback/feedback-form";
import { ProgramCatalog } from "@/components/shared/program-catalog";
import { ProfilePage } from "@/components/shared/profile-page";
import { SkeletonPage } from "@/components/skeleton-page";
import { findNavItem } from "@/config/role-nav";

export default async function OrangTuaMenuPage({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = await params;
	const item = findNavItem("orang-tua", slug);
	if (!item) notFound();
	if (slug === "pendaftaran") return <ParentEnrollments />;
	if (slug === "pembayaran") return <ParentPayments />;
	if (slug === "jadwal")
		return (
			<SessionsList
				endpoint="/sessions/mine-children"
				title="Jadwal Anak"
				subtitle="Jadwal sesi semua anak yang terhubung ke akun ini."
				hideList
			/>
		);
	if (slug === "kehadiran") return <ParentAttendanceView />;
	if (slug === "feedback") return <FeedbackForm />;
	if (slug === "program") return <ProgramCatalog />;
	if (slug === "performa-anak") return <ParentPerformancePage />;
	if (slug === "ranking") return <ParentRankingPage />;
	if (slug === "pengumuman") return <NotificationsInbox />;
	if (slug === "profil") return <ProfilePage />;
	return <SkeletonPage role="orang-tua" title={item.label} />;
}

