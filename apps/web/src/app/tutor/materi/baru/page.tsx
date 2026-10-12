import { MaterialCreatePage } from "@/components/phase3a/material-create-page";

type SP = Promise<{ levelId?: string; subjectId?: string; category?: string }>;

export default async function TutorMateriBaruPage({ searchParams }: { searchParams: SP }) {
	const sp = await searchParams;
	return <MaterialCreatePage basePath="/tutor/materi" initial={sp} />;
}
