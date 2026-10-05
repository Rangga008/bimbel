import { RoleHome } from "@/components/role-home";
import { OwnerAnalytics } from "@/components/shared/owner-analytics";

export default function OwnerDashboardPage() {
	return (
		<div className="flex flex-col gap-8">
			<RoleHome
				role="owner"
				apiPath="/dashboard/owner"
				title="Dashboard KPI Owner"
			/>
			<OwnerAnalytics />
		</div>
	);
}
