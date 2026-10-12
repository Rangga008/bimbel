"use client";

import { useParams, useRouter } from "next/navigation";
import { LatsolPlayer } from "@/components/phase3b/latsol-player";

export default function LatsolTakingPage() {
	const params = useParams();
	const router = useRouter();
	const packageId = typeof params.packageId === "string" ? params.packageId : "";

	return (
		<LatsolPlayer
			packageId={packageId}
			onBack={() => router.back()}
		/>
	);
}
