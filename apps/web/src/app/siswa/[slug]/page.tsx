import { notFound } from "next/navigation";
import { SessionsList } from "@/components/phase1c/sessions-list";
import { NotificationsInbox } from "@/components/phase1d/notifications-inbox";
import { MaterialsManager } from "@/components/phase3a/materials-manager";
import { LatsolPage } from "@/components/phase3b/latsol-page";
import { ExamListStudent } from "@/components/phase3c/exam-list-student";
import { StudentPerformance } from "@/components/phase4a/student-performance";
import { StudentRankingPage } from "@/components/phase4b/student-ranking";
import { FeedbackForm } from "@/components/feedback/feedback-form";
import { ProfilePage } from "@/components/shared/profile-page";
import { SkeletonPage } from "@/components/skeleton-page";
import { findNavItem } from "@/config/role-nav";

export default async function SiswaMenuPage({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = await params;
	const item = findNavItem("siswa", slug);
	if (!item) notFound();
	if (slug === "jadwal")
		return (
			<SessionsList
				endpoint="/sessions/mine-student"
				title="Jadwal Saya"
				subtitle="Jadwal sesi kelompok Anda, termasuk susulan per-siswa bila ada."
				hideList
			/>
		);
	if (slug === "materi")
		return <MaterialsManager canManage={false} basePath="/siswa/materi" />;
	if (slug === "ujian") return <ExamListStudent />;
	if (slug === "latsol")
		return <LatsolPage canManage={false} basePath="/siswa/latsol" />;
	if (slug === "performa") return <StudentPerformance />;
	if (slug === "feedback") return <FeedbackForm />;
	if (slug === "ranking") return <StudentRankingPage />;
	if (slug === "pengumuman") return <NotificationsInbox />;
	if (slug === "profil") return <ProfilePage />;
	return <SkeletonPage role="siswa" title={item.label} />;
}

