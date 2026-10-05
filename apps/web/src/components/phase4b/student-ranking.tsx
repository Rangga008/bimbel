"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch, ApiError } from "@/lib/api-client";
import { LeaderboardCard } from "./leaderboard-card";

interface MyTotal {
  studentId: string;
  period: string;
  totalPoints: number;
  transactionCount: number;
}

function err(e: unknown, fb: string) {
  return e instanceof ApiError ? e.message : fb;
}

/** Halaman "Ranking" untuk siswa: total poin saya + leaderboard. */
export function StudentRankingPage() {
  const totalQ = useQuery({
    queryKey: ["points-my-total"],
    queryFn: () => apiFetch<MyTotal>("/point-transactions/my-total"),
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ranking</h1>
        <p className="text-sm text-muted-foreground">
          Perolehan poin Anda dan peringkat dibanding siswa lain.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Total Poin Saya (semua waktu)</CardDescription>
          <CardTitle className="text-4xl">
            {totalQ.isLoading ? "…" : (totalQ.data?.totalPoints ?? 0)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {totalQ.isError ? (
            <p className="text-sm text-destructive">{err(totalQ.error, "Gagal memuat poin.")}</p>
          ) : null}
        </CardContent>
      </Card>

      <LeaderboardCard myGroupToggle highlightMe />
    </div>
  );
}

