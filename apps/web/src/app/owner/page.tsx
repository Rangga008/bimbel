import { RoleHome } from "@/components/role-home";

export default function OwnerDashboardPage() {
	return (
		<RoleHome
			role="owner"
			apiPath="/dashboard/owner"
			title="Dashboard KPI Owner"
		/>
	);
}
