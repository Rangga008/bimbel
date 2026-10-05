"use client";

import { LeaderboardCard } from "./leaderboard-card";

/** Halaman "Ranking Siswa" untuk Orang Tua — leaderboard + opsi saring ke kelompok anak. */
export function ParentRankingPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ranking Siswa</h1>
        <p className="text-sm text-muted-foreground">
          Leaderboard siswa per periode — centang &quot;Kelompok anak&quot; untuk melihat peringkat di kelompok anak Anda.
        </p>
      </div>
      <LeaderboardCard myGroupToggle myGroupLabel="Kelompok anak" />
    </div>
  );
}
