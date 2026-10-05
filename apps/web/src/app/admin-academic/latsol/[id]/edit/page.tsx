import { LatsolPackageEditPage } from "@/components/phase3b/latsol-package-edit-page";

export default async function AdminAcademicLatsolEditPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	return <LatsolPackageEditPage basePath="/admin-academic/latsol" packageId={id} />;
}
