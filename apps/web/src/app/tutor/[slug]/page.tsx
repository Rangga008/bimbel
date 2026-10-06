import { notFound } from "next/navigation";
import { SkeletonPage } from "@/components/skeleton-page";
import { TutorGroupsList } from "@/components/phase1b/tutor-groups-list";
import { SessionsList } from "@/components/phase1c/sessions-list";
import { AttendanceMarker } from "@/components/phase1d/attendance-marker";
import { AttendanceRecapBox } from "@/components/phase1d/attendance-recap-box";
import { MaterialsManager } from "@/components/phase3a/materials-manager";
import { QuestionsManager } from "@/components/phase3a/questions-manager";
import { LatsolPage } from "@/components/phase3b/latsol-page";
import { ExamsManager } from "@/components/phase3c/exams-manager";
import { ProctoringHubPage } from "@/components/phase3d/proctoring-hub-page";
import { PembahasanManager } from "@/components/phase3e/pembahasan-manager";
import { MediaLibraryManager } from "@/components/shared/media-library-manager";
import { TutorGroupGrades } from "@/components/phase4a/tutor-group-grades";
import { FeedbackMatrix } from "@/components/feedback/feedback-matrix";
import { TutorRankingPage } from "@/components/phase4b/tutor-ranking";
import { TutorHonorPanel } from "@/components/phase5a/tutor-honor-panel";
import { ProfilePage } from "@/components/shared/profile-page";
import { NotificationsInbox } from "@/components/phase1d/notifications-inbox";
import { findNavItem } from "@/config/role-nav";

export default async function TutorMenuPage({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = await params;
	const item = findNavItem("tutor", slug);
	if (!item) notFound();
	if (slug === "kelompok") return <TutorGroupsList />;
	if (slug === "jadwal-sesi")
		return (
			<SessionsList
				endpoint="/sessions/mine"
				title="Jadwal / Sesi Saya"
				subtitle="Sesi yang Anda ampu — tutor per sesi bisa berbeda."
				hideList
			/>
		);
	if (slug === "absensi")
		return (
			<div className="flex flex-col gap-8">
				<AttendanceMarker sessionsEndpoint="/sessions/mine" />
				<AttendanceRecapBox />
			</div>
		);
	if (slug === "feedback")
		return (
			<FeedbackMatrix
				showGroupPicker
				title="Feedback Siswa Mingguan"
			/>
		);
	if (slug === "materi")
		return <MaterialsManager canManage={false} basePath="/tutor/materi" />;
	if (slug === "soal") return <QuestionsManager canManage basePath="/tutor/soal" />;
	if (slug === "latsol") return <LatsolPage canManage basePath="/tutor/latsol" />;
	if (slug === "ujian") return <ExamsManager canManage={false} basePath="/tutor/ujian" />;
	if (slug === "proctoring")
		return <ProctoringHubPage examBasePath="/tutor/ujian" />;
	if (slug === "nilai") return <TutorGroupGrades />;
	if (slug === "ranking") return <TutorRankingPage />;
	if (slug === "notifikasi") return <NotificationsInbox />;
	if (slug === "profil")
		return (
			<div className="flex flex-col gap-8">
				<TutorHonorPanel />
				<ProfilePage />
			</div>
		);
	if (slug === "pembahasan") return <PembahasanManager />;
	if (slug === "pustaka") return <MediaLibraryManager />;
	return <SkeletonPage role="tutor" title={item.label} />;
}

