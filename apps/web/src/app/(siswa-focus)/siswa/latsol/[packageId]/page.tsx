"use client";

import { useParams, useRouter } from "next/navigation";
import { LatsolPlayer } from "@/components/phase3b/latsol-player";

export default function LatsolTakingPage() {
	const params = useParams();
	const router = useRouter();
	const packageId = typeof params.packageId === "string" ? params.packageId : "";

	return (
		// Container terpusat — layout fokus tidak punya padding, tanpa ini
		// konten menempel ke tepi layar (halaman materi pakai pola sama).
		<main className="mx-auto w-full max-w-5xl p-4 sm:p-6">
			<LatsolPlayer
				packageId={packageId}
				onBack={() => router.back()}
			/>
		</main>
	);
}
