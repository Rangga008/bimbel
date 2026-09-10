import { RoleHome } from "@/components/role-home";

export default function AdminFinanceDashboardPage() {
	return (
		<RoleHome
			role="admin-finance"
			apiPath="/dashboard/admin-finance"
			title="Dashboard Admin Finance"
		/>
	);
}
