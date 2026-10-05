import { StudentDetailPage } from "@/components/phase1a/student-detail-page";

export default async function OwnerStudentDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	return <StudentDetailPage studentId={id} basePath="/owner" canManage />;
}
