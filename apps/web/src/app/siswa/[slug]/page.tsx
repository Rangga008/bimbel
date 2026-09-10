import { notFound } from "next/navigation";
import { SkeletonPage } from "@/components/skeleton-page";
import { findNavItem } from "@/config/role-nav";

export default async function SiswaMenuPage({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = await params;
	const item = findNavItem("siswa", slug);
	if (!item) notFound();
	return <SkeletonPage role="siswa" title={item.label} />;
}
