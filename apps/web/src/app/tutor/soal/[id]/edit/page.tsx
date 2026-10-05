import { QuestionEditPage } from "@/components/phase3a/question-edit-page";

export default async function TutorSoalEditPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	return <QuestionEditPage basePath="/tutor/soal" questionId={id} />;
}
