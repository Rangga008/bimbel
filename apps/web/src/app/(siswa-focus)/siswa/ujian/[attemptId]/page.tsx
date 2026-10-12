import { ExamTaker } from "@/components/phase3c/exam-taker";
import { Suspense } from "react";

async function AttemptLoader({ attemptId }: { attemptId: string }) {
	return <ExamTaker attemptId={attemptId} />;
}

export default async function ExamTakingPage({
	params,
}: {
	params: Promise<{ attemptId: string }>;
}) {
	const { attemptId } = await params;
	return (
		<div className="min-h-screen bg-background">
			<div className="mx-auto w-full max-w-4xl p-4 sm:p-6">
				<Suspense fallback={<div>Memuat ujian...</div>}>
					<AttemptLoader attemptId={attemptId} />
				</Suspense>
			</div>
		</div>
	);
}
