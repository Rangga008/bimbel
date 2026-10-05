import { notFound } from "next/navigation";
import { TutorsManager } from "@/components/phase1a/tutors-manager";
import { ProgramsManager } from "@/components/phase1a/programs-manager";
import { LevelsManager } from "@/components/phase1a/levels-manager";
import { AcademicEnrollments } from "@/components/enrollments/academic-enrollments";
import { GroupsManager } from "@/components/phase1b/groups-manager";
import { FacilitiesManager } from "@/components/phase1c/facilities-manager";
import { JadwalSesiManager } from "@/components/phase1c/jadwal-sesi-manager";
import { AttendanceMarker } from "@/components/phase1d/attendance-marker";
import { AttendanceRecapBox } from "@/components/phase1d/attendance-recap-box";
import { AttendanceCorrectBox } from "@/components/phase1d/attendance-correct-box";
import { MaterialsManager } from "@/components/phase3a/materials-manager";
import { QuestionsManager } from "@/components/phase3a/questions-manager";
import { LatsolPage } from "@/components/phase3b/latsol-page";
import { ExamsManager } from "@/components/phase3c/exams-manager";
import { ProctoringHubPage } from "@/components/phase3d/proctoring-hub-page";
import { PembahasanManager } from "@/components/phase3e/pembahasan-manager";
import { MediaLibraryManager } from "@/components/shared/media-library-manager";
import { MasterDataManager } from "@/components/phase1a/master-data-manager";
import { AdminAcademicAnalytics } from "@/components/phase4a/admin-academic-analytics";
import { AdminRankingPage } from "@/components/phase4b/admin-ranking";
import { AdvancedReportsManager } from "@/components/phase6/advanced-reports";
import { AccountsManager } from "@/components/phase0b/accounts-manager";
import { ProfilePage } from "@/components/shared/profile-page";
import { NotificationsInbox } from "@/components/phase1d/notifications-inbox";
import { FinanceSettings } from "@/components/shared/finance-settings";
import { SkeletonPage } from "@/components/skeleton-page";
import { findNavItem } from "@/config/role-nav";

export default async function AdminAcademicMenuPage({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = await params;
	const item = findNavItem("admin-academic", slug);
	if (!item) notFound();
	if (slug === "program") return <ProgramsManager canManage basePath="/admin-academic" />;
	if (slug === "level") return <LevelsManager canManage />;
	if (slug === "pendaftaran") return <AcademicEnrollments />;
	if (slug === "kelompok") return <GroupsManager canManage basePath="/admin-academic" />;
	if (slug === "tutor") return <TutorsManager canManage />;
	if (slug === "jadwal") return <JadwalSesiManager canManage />;
	if (slug === "fasilitas") return <FacilitiesManager />;
	if (slug === "master-data") return <MasterDataManager canManage />;
	if (slug === "absensi")
		return (
			<div className="flex flex-col gap-8">
				<AttendanceMarker sessionsEndpoint="/sessions" />
				<AttendanceRecapBox />
				<AttendanceCorrectBox />
			</div>
		);
	if (slug === "materi") return <MaterialsManager canManage basePath="/admin-academic/materi" />;
	if (slug === "soal") return <QuestionsManager canManage basePath="/admin-academic/soal" />;
	if (slug === "latsol") return <LatsolPage canManage basePath="/admin-academic/latsol" />;
	if (slug === "ujian") return <ExamsManager canManage basePath="/admin-academic/ujian" />;
	if (slug === "proctoring")
		return <ProctoringHubPage examBasePath="/admin-academic/ujian" />;
	if (slug === "pembahasan") return <PembahasanManager />;
	if (slug === "pustaka") return <MediaLibraryManager />;
	if (slug === "analisis") return <AdminAcademicAnalytics />;
	if (slug === "ranking") return <AdminRankingPage />;
	if (slug === "laporan") return <AdvancedReportsManager />;
	if (slug === "pengaturan") return <FinanceSettings />;
	if (slug === "akun") return <AccountsManager basePath="/admin-academic" />;
	if (slug === "notifikasi") return <NotificationsInbox />;
	if (slug === "profil") return <ProfilePage />;
	return <SkeletonPage role="admin-academic" title={item.label} />;
}

