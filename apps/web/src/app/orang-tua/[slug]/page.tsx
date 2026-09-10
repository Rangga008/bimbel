import { notFound } from "next/navigation";
import { SkeletonPage } from "@/components/skeleton-page";
import { findNavItem } from "@/config/role-nav";

export default async function OrangTuaMenuPage({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = await params;
	const item = findNavItem("orang-tua", slug);
	if (!item) notFound();
	return <SkeletonPage role="orang-tua" title={item.label} />;
}
