"use client";

import { LeaderboardCard } from "./leaderboard-card";

/** Halaman "Ranking" untuk Tutor — leaderboard dengan filter scope (daftar opsi sudah dibatasi ke yang dia ampu). */
export function TutorRankingPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ranking</h1>
        <p className="text-sm text-muted-foreground">
          Leaderboard siswa per periode — saring per kelompok/level/program yang Anda ampu.
        </p>
      </div>
      <LeaderboardCard adminFilters />
    </div>
  );
}
