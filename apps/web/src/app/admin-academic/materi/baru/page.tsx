import { MaterialCreatePage } from "@/components/phase3a/material-create-page";

type SP = Promise<{ levelId?: string; subjectId?: string; category?: string }>;

export default async function AdminAcademicMateriBaruPage({ searchParams }: { searchParams: SP }) {
	const sp = await searchParams;
	return <MaterialCreatePage basePath="/admin-academic/materi" initial={sp} />;
}
