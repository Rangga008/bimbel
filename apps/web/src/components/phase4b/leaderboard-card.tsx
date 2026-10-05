"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";
import { apiFetch, ApiError } from "@/lib/api-client";
import { UserAvatar } from "@/components/shared/user-avatar";

export interface LeaderboardEntry {
  rank: number;
  studentId: string;
  studentName: string;
  avatarUrl?: string | null;
  schoolOrigin?: string | null;
  groupNames: string[];
  totalPoints: number;
  transactionCount: number;
}

interface LeaderboardResponse {
  period: string;
  leaderboard: LeaderboardEntry[];
  me: { studentId: string; rank: number; totalPoints: number } | null;
}

interface NamedOption {
  id: string;
  name: string;
}

function err(e: unknown, fb: string) {
  return e instanceof ApiError ? e.message : fb;
}

function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const RANK_BADGE: Record<number, string> = {
  1: "bg-brand-gold-400 text-brand-gold-900",
  2: "bg-neutral-300 text-neutral-800",
  3: "bg-warning-600/30 text-warning-800",
};

/**
 * Kartu leaderboard Fase 4b — dipakai halaman Ranking siswa & admin.
 * `adminFilters` menampilkan scope kelompok/level/program/gedung;
 * `myGroupToggle` menampilkan opsi "Kelompok saya" untuk siswa.
 */
export function LeaderboardCard({
  adminFilters = false,
  myGroupToggle = false,
  myGroupLabel = "Kelompok saya",
  highlightMe = false,
}: {
  adminFilters?: boolean;
  myGroupToggle?: boolean;
  myGroupLabel?: string;
  highlightMe?: boolean;
}) {
  const [period, setPeriod] = useState(currentPeriod());
  const [allTime, setAllTime] = useState(false);
  const [groupId, setGroupId] = useState("");
  const [levelId, setLevelId] = useState("");
  const [programId, setProgramId] = useState("");
  const [buildingId, setBuildingId] = useState("");
  const [myGroup, setMyGroup] = useState(false);

  const params = new URLSearchParams();
  if (!allTime && period) params.set("period", period);
  if (groupId) params.set("groupId", groupId);
  if (levelId) params.set("levelId", levelId);
  if (programId) params.set("programId", programId);
  if (buildingId) params.set("buildingId", buildingId);
  if (myGroup) params.set("myGroup", "true");
  const qs = params.toString();

  const leaderboardQ = useQuery({
    queryKey: ["leaderboard", qs],
    queryFn: () => apiFetch<LeaderboardResponse>(`/point-transactions/leaderboard${qs ? `?${qs}` : ""}`),
  });

  const groupsQ = useQuery({
    enabled: adminFilters,
    queryKey: ["options-groups"],
    queryFn: () => apiFetch<NamedOption[]>("/groups"),
  });
  const levelsQ = useQuery({
    enabled: adminFilters,
    queryKey: ["options-levels"],
    queryFn: () => apiFetch<NamedOption[]>("/levels"),
  });
  const programsQ = useQuery({
    enabled: adminFilters,
    queryKey: ["options-programs"],
    queryFn: () => apiFetch<NamedOption[]>("/programs/options"),
  });
  const buildingsQ = useQuery({
    enabled: adminFilters,
    queryKey: ["options-buildings"],
    queryFn: () => apiFetch<NamedOption[]>("/buildings"),
  });

  const selectCls = "h-9 rounded-md border border-input bg-background px-3 text-sm";
  const data = leaderboardQ.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="size-5 text-brand-gold-500" />
          Leaderboard
        </CardTitle>
        <CardDescription>
          Peringkat siswa berdasarkan poin — periode {allTime ? "semua waktu" : period}.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="month"
            value={period}
            disabled={allTime}
            onChange={(e) => setPeriod(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3"
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={allTime} onChange={(e) => setAllTime(e.target.checked)} />
            Semua waktu
          </label>
          {myGroupToggle ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={myGroup} onChange={(e) => setMyGroup(e.target.checked)} />
              {myGroupLabel}
            </label>
          ) : null}
          {adminFilters ? (
            <>
              <select className={selectCls} value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                <option value="">Semua kelompok</option>
                {groupsQ.data?.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              <select className={selectCls} value={levelId} onChange={(e) => setLevelId(e.target.value)}>
                <option value="">Semua level</option>
                {levelsQ.data?.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
              <select className={selectCls} value={programId} onChange={(e) => setProgramId(e.target.value)}>
                <option value="">Semua program</option>
                {programsQ.data?.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <select className={selectCls} value={buildingId} onChange={(e) => setBuildingId(e.target.value)}>
                <option value="">Semua gedung</option>
                {buildingsQ.data?.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </>
          ) : null}
        </div>

        {leaderboardQ.isLoading ? <Skeleton className="h-40 w-full" /> : null}
        {leaderboardQ.isError ? (
          <p className="text-sm text-destructive">{err(leaderboardQ.error, "Gagal memuat leaderboard.")}</p>
        ) : null}
        {data && data.leaderboard.length === 0 ? (
          <EmptyState
            icon={Trophy}
            title="Belum ada poin"
            description="Belum ada poin pada scope/periode ini."
          />
        ) : null}
        {data && data.leaderboard.length > 0 ? (
          <>
            {/* Mobile: card ringkas */}
            <div className="flex flex-col gap-2 sm:hidden">
              {data.leaderboard.map((entry) => {
                const isMe = highlightMe && data.me?.studentId === entry.studentId;
                return (
                  <div
                    key={entry.studentId}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border bg-card px-3 py-3",
                      isMe && "border-brand-blue-200 bg-brand-blue-50",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
                        RANK_BADGE[entry.rank] ?? "bg-muted",
                      )}
                    >
                      {entry.rank}
                    </span>
                    <UserAvatar name={entry.studentName} avatarUrl={entry.avatarUrl} className="size-8" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {entry.studentName}
                        {isMe ? (
                          <Badge variant="secondary" className="ml-2">Anda</Badge>
                        ) : null}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {entry.groupNames.join(", ") || "-"}
                      </p>
                      {entry.schoolOrigin ? (
                        <p className="truncate text-xs text-muted-foreground">
                          {entry.schoolOrigin}
                        </p>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums">
                        {entry.totalPoints}
                      </p>
                      <p className="text-xs text-muted-foreground">poin</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop: tabel */}
            <div className="hidden overflow-x-auto rounded-xl border sm:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted text-left">
                    <th className="px-3 py-2.5 font-medium">#</th>
                    <th className="px-3 py-2.5 font-medium">Siswa</th>
                    <th className="px-3 py-2.5 font-medium">Asal Sekolah</th>
                    <th className="px-3 py-2.5 font-medium">Kelompok</th>
                    <th className="px-3 py-2.5 text-right font-medium">Poin</th>
                  </tr>
                </thead>
                <tbody>
                  {data.leaderboard.map((entry) => {
                    const isMe = highlightMe && data.me?.studentId === entry.studentId;
                    return (
                      <tr
                        key={entry.studentId}
                        className={cn(
                          "border-b transition-colors last:border-0 hover:bg-muted/50",
                          isMe && "bg-brand-blue-50 font-medium hover:bg-brand-blue-50",
                        )}
                      >
                        <td className="px-3 py-2.5">
                          <span
                            className={cn(
                              "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
                              RANK_BADGE[entry.rank] ?? "bg-muted",
                            )}
                          >
                            {entry.rank}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="inline-flex items-center gap-2">
                            <UserAvatar name={entry.studentName} avatarUrl={entry.avatarUrl} className="size-7" />
                            <span>
                              {entry.studentName}
                              {isMe ? <Badge variant="secondary" className="ml-2">Anda</Badge> : null}
                            </span>
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">
                          {entry.schoolOrigin || "-"}
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">
                          {entry.groupNames.join(", ") || "-"}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                          {entry.totalPoints}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
        {highlightMe && data?.me && data.me.rank > 0 ? (
          <p className="text-sm text-muted-foreground">
            Peringkat Anda: <span className="font-semibold text-foreground tabular-nums">#{data.me.rank}</span> dengan{" "}
            <span className="font-semibold text-foreground tabular-nums">{data.me.totalPoints} poin</span>
            {allTime ? " (semua waktu)" : ` pada ${period}`}.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
