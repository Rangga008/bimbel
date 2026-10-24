"use client";

import { AdminPodiumBoard } from "./admin-podium-board";

/**
 * Halaman "Ranking" untuk Tutor — podium per kelompok/gedung/GFS.
 * Daftar opsi kelompok otomatis terbatas ke kelompok yang dia ampu
 * (scope diterapkan backend di /groups untuk role tutor).
 */
export function TutorRankingPage() {
	return (
		<div className="flex flex-col gap-6">
			<div>
				<h1 className="text-2xl font-semibold tracking-tight">Ranking</h1>
				<p className="text-sm text-muted-foreground">
					Podium peringkat pengerjaan soal — per kelompok, per gedung, dan seluruh Bimbel GFS.
				</p>
			</div>
			<AdminPodiumBoard />
		</div>
	);
}
