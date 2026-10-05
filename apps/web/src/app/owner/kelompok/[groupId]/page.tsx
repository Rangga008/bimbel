import { GroupDetailPage } from "@/components/phase1b/group-detail-page";

export default async function OwnerGroupDetailPage({
	params,
}: {
	params: Promise<{ groupId: string }>;
}) {
	const { groupId } = await params;
	return <GroupDetailPage groupId={groupId} basePath="/owner" canManage />;
}
