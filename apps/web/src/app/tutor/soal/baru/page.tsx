import { QuestionCreatePage } from "@/components/phase3a/question-create-page";

type SP = Promise<{ levelId?: string; subjectId?: string; category?: string }>;

export default async function TutorSoalBaruPage({ searchParams }: { searchParams: SP }) {
	const sp = await searchParams;
	return <QuestionCreatePage basePath="/tutor/soal" initial={sp} />;
}
