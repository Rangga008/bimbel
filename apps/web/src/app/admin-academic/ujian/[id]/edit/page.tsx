import { ExamEditPage } from "@/components/phase3c/exam-edit-page";

export default async function AdminAcademicUjianEditPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	return <ExamEditPage basePath="/admin-academic/ujian" examId={id} />;
}
