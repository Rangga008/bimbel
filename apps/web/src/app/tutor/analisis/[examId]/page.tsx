import { Suspense } from "react";
import { TutorExamAnalysis } from "@/components/phase4a/tutor-exam-analysis";

export default async function Page({
	params,
}: {
	params: Promise<{ examId: string }>;
}) {
	const { examId } = await params;
	return (
		<Suspense>
			<TutorExamAnalysis examId={examId} />
		</Suspense>
	);
}
