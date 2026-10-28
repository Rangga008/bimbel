import { TutorDetailPage } from "@/components/phase1a/tutor-detail-page";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	return <TutorDetailPage tutorId={id} basePath="/admin-academic" />;
}
