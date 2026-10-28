import { LatsolQuestionsPage } from "@/components/phase3b/latsol-questions-page";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	return <LatsolQuestionsPage basePath="/tutor/latsol" packageId={id} />;
}
