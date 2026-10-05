import { QuestionCreatePage } from "@/components/phase3a/question-create-page";

type SP = Promise<{ levelId?: string; subjectId?: string; category?: string }>;

export default async function AdminAcademicSoalBaruPage({ searchParams }: { searchParams: SP }) {
	const sp = await searchParams;
	return <QuestionCreatePage basePath="/admin-academic/soal" initial={sp} />;
}
