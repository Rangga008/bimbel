"use client";

import { LeaderboardCard } from "./leaderboard-card";
import { ScoreRulesManager } from "./score-rules-manager";

/** Halaman "Ranking" untuk Admin Academic: leaderboard berscope + kelola score rules. */
export function AdminRankingPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ranking</h1>
        <p className="text-sm text-muted-foreground">
          Leaderboard siswa per periode dengan scope kelompok/level/program/gedung, plus konfigurasi score rules.
        </p>
      </div>
      <LeaderboardCard adminFilters />
      <ScoreRulesManager />
    </div>
  );
}
