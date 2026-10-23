"use client";

import { AdminPodiumBoard } from "./admin-podium-board";
import { ScoreRulesManager } from "./score-rules-manager";

/** Halaman "Ranking" untuk Admin Academic: podium per kelompok/gedung/GFS + score rules. */
export function AdminRankingPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ranking</h1>
        <p className="text-sm text-muted-foreground">
          Top skor pengerjaan soal per kelompok, per gedung, dan seluruh GFS — plus konfigurasi score rules.
        </p>
      </div>
      <AdminPodiumBoard />
      <ScoreRulesManager />
    </div>
  );
}
