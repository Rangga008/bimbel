import { AccountDetailPage } from "@/components/phase0b/account-detail-page";

export default async function AdminAcademicAccountDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	return <AccountDetailPage userId={id} basePath="/admin-academic" />;
}
