import { notFound } from "next/navigation";
import { SkeletonPage } from "@/components/skeleton-page";
import { findNavItem } from "@/config/role-nav";

export default async function AdminAcademicMenuPage({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = await params;
	const item = findNavItem("admin-academic", slug);
	if (!item) notFound();
	return <SkeletonPage role="admin-academic" title={item.label} />;
}
