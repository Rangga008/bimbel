import { ExamCreatePage } from "@/components/phase3c/exam-create-page";

type SP = Promise<{ levelId?: string; subjectId?: string; category?: string }>;

export default async function AdminAcademicUjianBaruPage({ searchParams }: { searchParams: SP }) {
	const sp = await searchParams;
	return <ExamCreatePage basePath="/admin-academic/ujian" initial={sp} />;
}
