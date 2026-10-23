"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { PodiumBoard } from "./podium-board";
import type { LeaderboardEntry } from "./leaderboard-card";

interface LeaderboardResponse {
	period: string;
	leaderboard: LeaderboardEntry[];
	me: { studentId: string; rank: number; totalPoints: number } | null;
}

/** Podium ranking siswa: Kelompok saya | Seluruh GFS (semua waktu). */
export function SiswaPodium() {
	const groupQ = useQuery({
		queryKey: ["leaderboard", "podium-group"],
		queryFn: () => apiFetch<LeaderboardResponse>("/point-transactions/leaderboard?myGroup=true"),
	});
	const globalQ = useQuery({
		queryKey: ["leaderboard", "podium-gfs"],
		queryFn: () => apiFetch<LeaderboardResponse>("/point-transactions/leaderboard"),
	});
	const me = globalQ.data?.me ?? groupQ.data?.me ?? null;

	return (
		<div className="flex flex-col gap-2">
			<PodiumBoard
				columns={[
					{
						title: "Kelompok Saya",
						subtitle: "skor teman-teman sekelompok",
						entries: groupQ.data?.leaderboard,
						loading: groupQ.isLoading,
						highlightStudentId: me?.studentId,
					},
					{
						title: "GFS",
						subtitle: "seluruh Bimbel GFS",
						entries: globalQ.data?.leaderboard,
						loading: globalQ.isLoading,
						highlightStudentId: me?.studentId,
					},
				]}
			/>
			{me && me.rank > 0 ? (
				<p className="text-sm text-muted-foreground">
					Peringkat Anda:{" "}
					<span className="font-semibold tabular-nums text-foreground">#{me.rank}</span> dengan{" "}
					<span className="font-semibold tabular-nums text-foreground">{me.totalPoints} poin</span>{" "}
					(semua waktu).
				</p>
			) : null}
		</div>
	);
}
