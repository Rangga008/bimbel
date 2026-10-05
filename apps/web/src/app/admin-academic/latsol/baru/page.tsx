import { LatsolPackageCreatePage } from "@/components/phase3b/latsol-package-create-page";

type SP = Promise<{ levelId?: string; subjectId?: string; category?: string }>;

export default async function AdminAcademicLatsolBaruPage({ searchParams }: { searchParams: SP }) {
	const sp = await searchParams;
	return <LatsolPackageCreatePage basePath="/admin-academic/latsol" initial={sp} />;
}
