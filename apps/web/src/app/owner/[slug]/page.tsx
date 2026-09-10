import { notFound } from "next/navigation";
import { SkeletonPage } from "@/components/skeleton-page";
import { findNavItem } from "@/config/role-nav";

export default async function OwnerMenuPage({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = await params;
	const item = findNavItem("owner", slug);
	if (!item) notFound();
	return <SkeletonPage role="owner" title={item.label} />;
}
