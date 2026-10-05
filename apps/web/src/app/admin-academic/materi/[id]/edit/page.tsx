import { MaterialEditPage } from "@/components/phase3a/material-edit-page";

export default async function AdminAcademicMateriEditPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	return <MaterialEditPage basePath="/admin-academic/materi" materialId={id} />;
}
