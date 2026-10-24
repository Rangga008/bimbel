"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { PodiumBoard } from "./podium-board";
import type { LeaderboardEntry } from "./leaderboard-card";

interface LeaderboardResponse {
	leaderboard: LeaderboardEntry[];
	me: { studentId: string } | null;
}

/**
 * Halaman "Ranking Siswa" untuk Orang Tua — podium Kelompok Anak
 * (backend myGroup menangani ortu: gabungan kelompok semua anak) + GFS.
 */
export function ParentRankingPage() {
	const childrenQ = useQuery({
		queryKey: ["me-children-lite"],
		queryFn: () => apiFetch<{ id: string; user: { name: string } }[]>("/me/children"),
	});
	const groupQ = useQuery({
		queryKey: ["leaderboard", "podium-parent-group"],
		queryFn: () => apiFetch<LeaderboardResponse>("/point-transactions/leaderboard?myGroup=true"),
	});
	const globalQ = useQuery({
		queryKey: ["leaderboard", "podium-gfs"],
		queryFn: () => apiFetch<LeaderboardResponse>("/point-transactions/leaderboard"),
	});
	const firstChildId = childrenQ.data?.[0]?.id ?? null;

	return (
		<div className="flex flex-col gap-6">
			<div>
				<h1 className="text-2xl font-semibold tracking-tight">Ranking Siswa</h1>
				<p className="text-sm text-muted-foreground">
					Podium peringkat pengerjaan soal — di kelompok anak Anda dan seluruh Bimbel GFS.
				</p>
			</div>
			<PodiumBoard
				columns={[
					{
						title: "Kelompok Anak",
						subtitle: "skor siswa sekelompok anak Anda",
						entries: groupQ.data?.leaderboard,
						loading: groupQ.isLoading,
						highlightStudentId: firstChildId,
					},
					{
						title: "GFS",
						subtitle: "seluruh Bimbel GFS",
						entries: globalQ.data?.leaderboard,
						loading: globalQ.isLoading,
					},
				]}
			/>
		</div>
	);
}
