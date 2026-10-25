import { ExamQuestionsPage } from "@/components/phase3c/exam-questions-page";

export default async function AdminAcademicUjianSoalPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	return <ExamQuestionsPage basePath="/admin-academic/ujian" examId={id} />;
}
