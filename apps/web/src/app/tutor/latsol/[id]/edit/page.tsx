import { LatsolPackageEditPage } from "@/components/phase3b/latsol-package-edit-page";

export default async function TutorLatsolEditPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	return <LatsolPackageEditPage basePath="/tutor/latsol" packageId={id} />;
}
