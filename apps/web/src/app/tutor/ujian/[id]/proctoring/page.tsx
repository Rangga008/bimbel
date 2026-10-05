import { ExamProctoringPage } from "@/components/phase3d/exam-proctoring-page";

export default async function TutorUjianProctoringPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	return <ExamProctoringPage examId={id} basePath="/tutor/ujian" />;
}
