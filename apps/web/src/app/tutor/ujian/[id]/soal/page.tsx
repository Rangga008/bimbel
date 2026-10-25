import { ExamQuestionsPage } from "@/components/phase3c/exam-questions-page";

export default async function TutorUjianSoalPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	return <ExamQuestionsPage basePath="/tutor/ujian" examId={id} />;
}
