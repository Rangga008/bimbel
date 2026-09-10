import { RoleHome } from "@/components/role-home";

export default function AdminAcademicDashboardPage() {
	return (
		<RoleHome
			role="admin-academic"
			apiPath="/dashboard/admin-academic"
			title="Dashboard Admin Academic"
		/>
	);
}
