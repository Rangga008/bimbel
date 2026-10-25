import { ProgramDetailPage } from "@/components/phase1a/program-detail-page";

export default async function AdminFinanceProgramDetailPage({
	params,
}: {
	params: Promise<{ programId: string }>;
}) {
	const { programId } = await params;
	return (
		<ProgramDetailPage
			programId={programId}
			basePath="/admin-finance"
			canManage
		/>
	);
}
