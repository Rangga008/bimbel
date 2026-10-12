import { ParentDetailPage } from "@/components/phase1a/parent-detail-page";

export default async function AdminAcademicParentDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	return <ParentDetailPage parentId={id} basePath="/admin-academic" canManage />;
}
