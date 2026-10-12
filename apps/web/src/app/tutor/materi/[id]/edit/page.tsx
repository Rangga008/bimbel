import { MaterialEditPage } from "@/components/phase3a/material-edit-page";

export default async function TutorMateriEditPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	return <MaterialEditPage basePath="/tutor/materi" materialId={id} />;
}
