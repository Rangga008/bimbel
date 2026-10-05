import { QuestionEditPage } from "@/components/phase3a/question-edit-page";

export default async function AdminAcademicSoalEditPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	return <QuestionEditPage basePath="/admin-academic/soal" questionId={id} />;
}
