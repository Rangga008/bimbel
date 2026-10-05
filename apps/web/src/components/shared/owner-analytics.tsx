"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  ChartLine,
  GraduationCap,
  Minus,
  Receipt,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { rupiah } from "@/components/phase2a/invoices-manager";

interface Cmp {
  current: number;
  previous: number;
  pct: number | null;
}

interface CmpRate {
  current: number | null;
  previous: number | null;
  points: number | null;
}

interface MonthPoint {
  month: string;
  label: string;
  revenue: number;
  expenses: number;
  newStudents: number;
  sessionsCompleted: number;
  attendanceRate: number | null;
}

interface OwnerAnalytics {
  comparison: {
    revenue: Cmp;
    billed: Cmp;
    newStudents: Cmp;
    sessionsCompleted: Cmp;
    attendanceRate: CmpRate;
    expenses: Cmp;
  };
  yearly: {
    revenue: Cmp;
    newStudents: Cmp;
    sessionsCompleted: Cmp;
    attendanceRate: CmpRate;
  };
  monthly: MonthPoint[];
}

function fmtPct(pct: number | null) {
  if (pct === null) return "—";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`;
}

function DeltaBadge({ pct, invert = false }: { pct: number | null; invert?: boolean }) {
  if (pct === null)
    return (
      <Badge variant="outline" className="gap-1">
        <Minus className="size-3" /> —
      </Badge>
    );
  const up = pct > 0;
  const flat = pct === 0;
  // invert=true untuk metrik yang lebih kecil = lebih baik (pengeluaran)
  const good = flat ? null : invert ? !up : up;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <Badge
      variant={good === null ? "outline" : good ? "success" : "destructive"}
      className="gap-1"
    >
      <Icon className="size-3" />
      <span className="tabular-nums">{fmtPct(pct)}</span>
    </Badge>
  );
}

function DeltaPoints({ points }: { points: number | null }) {
  if (points === null)
    return (
      <Badge variant="outline" className="gap-1">
        <Minus className="size-3" /> —
      </Badge>
    );
  const Icon = points > 0 ? ArrowUpRight : points < 0 ? ArrowDownRight : Minus;
  return (
    <Badge
      variant={points > 0 ? "success" : points < 0 ? "destructive" : "outline"}
      className="gap-1"
    >
      <Icon className="size-3" />
      <span className="tabular-nums">
        {points > 0 ? "+" : ""}
        {points.toLocaleString("id-ID", { maximumFractionDigits: 1 })} poin
      </span>
    </Badge>
  );
}

/** Bar chart CSS ringan: tinggi proporsional ke nilai maksimum. */
function MiniBarChart({
  data,
  value,
  format,
  color = "bg-brand-blue-500",
  highlightLast = true,
}: {
  data: MonthPoint[];
  value: (m: MonthPoint) => number;
  format: (v: number) => string;
  color?: string;
  highlightLast?: boolean;
}) {
  const max = Math.max(1, ...data.map(value));
  return (
    <div className="flex items-end gap-1.5">
      {data.map((m, i) => {
        const v = value(m);
        const h = Math.max(2, Math.round((v / max) * 100));
        const last = highlightLast && i === data.length - 1;
        return (
          <div key={m.month} className="group flex min-w-0 flex-1 flex-col items-center gap-1">
            <div
              className="flex h-28 w-full items-end rounded-t"
              title={`${m.label}: ${format(v)}`}
            >
              <div
                className={cn(
                  "w-full rounded-t transition-all group-hover:opacity-80",
                  color,
                  !last && "opacity-45",
                )}
                style={{ height: `${h}%` }}
              />
            </div>
            <span
              className={cn(
                "w-full truncate text-center text-[10px] text-muted-foreground",
                last && "font-semibold text-foreground",
              )}
            >
              {m.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Kartu metrik MoM dengan badge delta. */
function MetricCard({
  icon: Icon,
  label,
  current,
  previous,
  pct,
  invert,
  format,
}: {
  icon: typeof Wallet;
  label: string;
  current: number | null;
  previous: number | null;
  pct: number | null;
  invert?: boolean;
  format: (v: number) => string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 py-4">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <Icon className="size-4 text-brand-blue-600" />
            {label}
          </span>
          <DeltaBadge pct={pct} invert={invert} />
        </div>
        <p className="text-xl font-semibold tabular-nums">
          {current === null ? "—" : format(current)}
        </p>
        <p className="text-xs text-muted-foreground tabular-nums">
          bulan lalu: {previous === null ? "—" : format(previous)}
        </p>
      </CardContent>
    </Card>
  );
}

/** Blok analisis bisnis Owner: MoM, YoY, dan grafik 12 bulan. */
export function OwnerAnalytics() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["dashboard-owner-analytics"],
    queryFn: () => apiFetch<OwnerAnalytics>("/dashboard/owner/analytics"),
    staleTime: 60_000,
  });

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (isError)
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-destructive">
          {error instanceof ApiError ? error.message : "Gagal memuat analisis."}
        </CardContent>
      </Card>
    );
  if (!data) return null;

  const c = data.comparison;
  const y = data.yearly;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <ChartLine className="size-4" />
          Analisis Bisnis — bulan ini vs bulan lalu
        </h2>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          icon={Banknote}
          label="Pendapatan"
          current={c.revenue.current}
          previous={c.revenue.previous}
          pct={c.revenue.pct}
          format={rupiah}
        />
        <MetricCard
          icon={Receipt}
          label="Tagihan Terbit"
          current={c.billed.current}
          previous={c.billed.previous}
          pct={c.billed.pct}
          format={rupiah}
        />
        <MetricCard
          icon={Wallet}
          label="Pengeluaran"
          current={c.expenses.current}
          previous={c.expenses.previous}
          pct={c.expenses.pct}
          invert
          format={rupiah}
        />
        <MetricCard
          icon={GraduationCap}
          label="Siswa Baru"
          current={c.newStudents.current}
          previous={c.newStudents.previous}
          pct={c.newStudents.pct}
          format={(v) => `${v}`}
        />
        <MetricCard
          icon={ChartLine}
          label="Sesi Selesai"
          current={c.sessionsCompleted.current}
          previous={c.sessionsCompleted.previous}
          pct={c.sessionsCompleted.pct}
          format={(v) => `${v}`}
        />
        <Card>
          <CardContent className="flex flex-col gap-2 py-4">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <GraduationCap className="size-4 text-brand-blue-600" />
                Tingkat Kehadiran
              </span>
              <DeltaPoints points={c.attendanceRate.points} />
            </div>
            <p className="text-xl font-semibold tabular-nums">
              {c.attendanceRate.current === null ? "—" : `${c.attendanceRate.current}%`}
            </p>
            <p className="text-xs text-muted-foreground tabular-nums">
              bulan lalu:{" "}
              {c.attendanceRate.previous === null ? "—" : `${c.attendanceRate.previous}%`}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Perbandingan Tahunan (YoY)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Pendapatan", m: y.revenue, fmt: rupiah },
            { label: "Siswa Baru", m: y.newStudents, fmt: (v: number) => `${v}` },
            { label: "Sesi Selesai", m: y.sessionsCompleted, fmt: (v: number) => `${v}` },
          ].map((row) => (
            <div key={row.label} className="flex flex-col gap-1 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">{row.label}</span>
                {row.m.pct !== null && row.m.pct >= 0 ? (
                  <TrendingUp className="size-4 text-success-600" />
                ) : (
                  <TrendingDown className="size-4 text-destructive" />
                )}
              </div>
              <p className="text-lg font-semibold tabular-nums">{row.fmt(row.m.current)}</p>
              <p className="text-xs text-muted-foreground tabular-nums">
                tahun lalu: {row.fmt(row.m.previous)} ·{" "}
                <span className="font-medium">{fmtPct(row.m.pct)}</span>
              </p>
            </div>
          ))}
          <div className="flex flex-col gap-1 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Tingkat Kehadiran</span>
              <DeltaPoints points={y.attendanceRate.points} />
            </div>
            <p className="text-lg font-semibold tabular-nums">
              {y.attendanceRate.current === null ? "—" : `${y.attendanceRate.current}%`}
            </p>
            <p className="text-xs text-muted-foreground tabular-nums">
              tahun lalu:{" "}
              {y.attendanceRate.previous === null ? "—" : `${y.attendanceRate.previous}%`}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Pendapatan 12 Bulan Terakhir</CardTitle>
          </CardHeader>
          <CardContent>
            <MiniBarChart
              data={data.monthly}
              value={(m) => m.revenue}
              format={rupiah}
              color="bg-brand-blue-500"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Pengeluaran 12 Bulan Terakhir</CardTitle>
          </CardHeader>
          <CardContent>
            <MiniBarChart
              data={data.monthly}
              value={(m) => m.expenses}
              format={rupiah}
              color="bg-warning-500"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Siswa Baru per Bulan</CardTitle>
          </CardHeader>
          <CardContent>
            <MiniBarChart
              data={data.monthly}
              value={(m) => m.newStudents}
              format={(v) => `${v} siswa`}
              color="bg-success-500"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Sesi Selesai per Bulan</CardTitle>
          </CardHeader>
          <CardContent>
            <MiniBarChart
              data={data.monthly}
              value={(m) => m.sessionsCompleted}
              format={(v) => `${v} sesi`}
              color="bg-brand-gold-400"
            />
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
