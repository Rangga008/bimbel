"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { apiFetch, ApiError } from "@/lib/api-client";
import { CategoryProgressChart, type CategoryProgressData } from "@/components/shared/category-progress-chart";

function err(e: unknown, fb: string) {
  return e instanceof ApiError ? e.message : fb;
}

interface ExamHistoryItem {
  examId: string;
  examTitle: string;
  examDate: string;
  score: number;
  maxScore: number;
  percentage: number;
}

interface TopicAnalysis {
  topicName: string;
  totalQuestions: number;
  correctCount: number;
  accuracy: number;
  avgScore: number;
  weaknessLevel: "STRONG" | "AVERAGE" | "WEAK";
}

interface OverallStats {
  totalExams: number;
  totalQuestionsAttempted: number;
  overallAccuracy: number;
  avgScore: number;
  avgPercentage: number;
  bestExam: ExamHistoryItem | null;
  worstExam: ExamHistoryItem | null;
}

interface StudentPerformanceData {
  studentId: string;
  studentName: string;
  examHistory: ExamHistoryItem[];
  topicAnalysis: TopicAnalysis[];
  categoryProgress?: CategoryProgressData;
  overallStats: OverallStats;
}

interface MonthlyReport {
  period: string;
  monthLabel: string;
  student: {
    id: string;
    name: string;
    school: string | null;
    groups: Array<{ name: string; levelName: string | null; programName: string }>;
  };
  attendance: {
    counts: Record<string, number>;
    total: number;
    presentPercent: number;
    sessions: Array<{
      date: string;
      subjectName: string | null;
      groupName: string;
      status: string;
    }>;
  };
  exams: Array<{
    title: string;
    subjectName: string | null;
    score: number;
    maxScore: number;
    percentage: number;
    date: string;
  }>;
  latsol: Array<{
    title: string;
    subjectName: string | null;
    score: number;
    maxScore: number;
    percentage: number;
    date: string;
  }>;
  pointsEarned: number;
}

interface ParentPerformanceProps {
  studentId: string;
}

function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const ATT_LABEL: Record<string, string> = {
  HADIR: "Hadir",
  TERLAMBAT: "Terlambat",
  IZIN: "Izin",
  SAKIT: "Sakit",
  ALFA: "Alfa",
};

/** Laporan bulanan anak — kehadiran + nilai ujian/latsol + poin (periode YYYY-MM). */
function MonthlyReportCard({ studentId }: { studentId: string }) {
  const [period, setPeriod] = useState(currentPeriod());
  const reportQ = useQuery({
    queryKey: ["analytics-child-monthly", studentId, period],
    queryFn: () =>
      apiFetch<MonthlyReport>(
        `/analytics/parent/child/${studentId}/monthly?period=${period}`,
      ),
    enabled: /^\d{4}-(0[1-9]|1[0-2])$/.test(period),
  });
  const r = reportQ.data;
  const att = r?.attendance.counts ?? {};

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Laporan Bulanan</CardTitle>
          <CardDescription>
            Rekap kehadiran, nilai ujian, latsol, dan poin per bulan — sama dengan
            yang dikirim admin lewat WhatsApp.
          </CardDescription>
        </div>
        <div className="w-40">
          <Input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            aria-label="Pilih bulan laporan"
          />
        </div>
      </CardHeader>
      <CardContent>
        {reportQ.isLoading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Memuat laporan {period}…
          </div>
        ) : !r ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Pilih bulan untuk melihat laporan.
          </div>
        ) : (
          <div className="space-y-5">
            <p className="text-sm font-medium">{r.monthLabel}</p>

            {/* Kehadiran */}
            <div>
              <h4 className="mb-2 text-sm font-medium">Kehadiran</h4>
              {r.attendance.total === 0 ? (
                <p className="text-sm text-muted-foreground">Belum ada sesi bulan ini.</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(ATT_LABEL).map(([k, label]) =>
                      (att[k] ?? 0) > 0 || k === "HADIR" ? (
                        <Badge
                          key={k}
                          variant={k === "HADIR" ? "default" : "outline"}
                        >
                          {label}: {att[k] ?? 0}
                        </Badge>
                      ) : null,
                    )}
                    <Badge variant="secondary">
                      Kehadiran {r.attendance.presentPercent}%
                    </Badge>
                  </div>
                  <div className="mt-3 overflow-x-auto rounded-md border">
                    <table className="w-full min-w-[420px] text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="px-3 py-2 text-left font-medium">Tanggal</th>
                          <th className="px-3 py-2 text-left font-medium">Mapel</th>
                          <th className="px-3 py-2 text-left font-medium">Kelompok</th>
                          <th className="px-3 py-2 text-left font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.attendance.sessions.map((s, i) => (
                          <tr key={i} className="border-b last:border-0">
                            <td className="px-3 py-1.5 tabular-nums">
                              {new Date(s.date).toLocaleDateString("id-ID")}
                            </td>
                            <td className="px-3 py-1.5">{s.subjectName ?? "-"}</td>
                            <td className="px-3 py-1.5">{s.groupName}</td>
                            <td className="px-3 py-1.5">
                              <Badge
                                variant={
                                  s.status === "HADIR" ? "default" : "outline"
                                }
                              >
                                {ATT_LABEL[s.status] ?? s.status}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            {/* Ujian */}
            <div>
              <h4 className="mb-2 text-sm font-medium">Ujian bulan ini</h4>
              {r.exams.length === 0 ? (
                <p className="text-sm text-muted-foreground">Belum ada ujian bulan ini.</p>
              ) : (
                <div className="space-y-2">
                  {r.exams.map((ex, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-lg border p-3 text-sm"
                    >
                      <div>
                        <p className="font-medium">{ex.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {ex.subjectName ?? "Umum"} ·{" "}
                          {new Date(ex.date).toLocaleDateString("id-ID")}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold tabular-nums">{ex.percentage}%</p>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {ex.score}/{ex.maxScore}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Latsol */}
            <div>
              <h4 className="mb-2 text-sm font-medium">Latsol bulan ini</h4>
              {r.latsol.length === 0 ? (
                <p className="text-sm text-muted-foreground">Belum ada latsol selesai bulan ini.</p>
              ) : (
                <div className="space-y-2">
                  {r.latsol.map((l, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-lg border p-3 text-sm"
                    >
                      <div>
                        <p className="font-medium">{l.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {l.subjectName ?? "Umum"} ·{" "}
                          {new Date(l.date).toLocaleDateString("id-ID")}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold tabular-nums">{l.percentage}%</p>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {l.score}/{l.maxScore}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <p className="text-sm text-muted-foreground">
              Poin prestasi bulan ini:{" "}
              <span className="font-semibold text-foreground tabular-nums">
                {r.pointsEarned}
              </span>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const PERIOD_DAYS: Record<string, number | null> = {
  all: null,
  "30": 30,
  "90": 90,
};

const WEAKNESS_OPTS = [
  { value: "", label: "Semua Topik" },
  { value: "WEAK", label: "Lemah" },
  { value: "AVERAGE", label: "Cukup" },
  { value: "STRONG", label: "Kuat" },
];

export function ParentPerformance({ studentId }: ParentPerformanceProps) {
  const [period, setPeriod] = useState("all");
  const [weakness, setWeakness] = useState("");
  const performanceQ = useQuery({
    queryKey: ['analytics-parent-child-performance', studentId],
    queryFn: () => apiFetch<StudentPerformanceData>(`/analytics/parent/child/${studentId}/performance`),
  });

  if (performanceQ.isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Memuat data performa anak...</div>
      </div>
    );
  }

  if (performanceQ.isError) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-destructive">{err(performanceQ.error, 'Gagal memuat data performa anak.')}</div>
      </div>
    );
  }

  const data = performanceQ.data;

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Belum ada data performa tersedia</div>
      </div>
    );
  }

  const getWeaknessColor = (level: string) => {
    switch (level) {
      case "STRONG": return "bg-success-600 text-white";
      case "AVERAGE": return "bg-warning-500 text-white";
      case "WEAK": return "bg-destructive text-white";
      default: return "bg-neutral-500 text-white";
    }
  };

  const periodDays = PERIOD_DAYS[period] ?? null;
  const cutoff = periodDays ? Date.now() - periodDays * 86400_000 : null;
  const examHistory = cutoff
    ? data.examHistory.filter((e) => new Date(e.examDate).getTime() >= cutoff)
    : data.examHistory;
  const topics = weakness
    ? data.topicAnalysis.filter((t) => t.weaknessLevel === weakness)
    : data.topicAnalysis;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Performa: {data.studentName}</h1>
          <p className="text-muted-foreground">Analisis performa akademik anak Anda</p>
        </div>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="h-9 rounded-md border bg-background px-3 text-sm"
          aria-label="Periode riwayat"
        >
          <option value="all">Semua periode</option>
          <option value="30">30 hari terakhir</option>
          <option value="90">90 hari terakhir</option>
        </select>
      </div>

      {/* Overall Statistics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Ujian</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.overallStats.totalExams}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rata-rata Nilai</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.overallStats.avgPercentage.toFixed(1)}%</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Akurasi Overall</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.overallStats.overallAccuracy.toFixed(1)}%</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Best Exam</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.overallStats.bestExam ? data.overallStats.bestExam.percentage.toFixed(0) : 0}%
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Exam History */}
      <Card>
        <CardHeader>
          <CardTitle>Riwayat Ujian</CardTitle>
          <CardDescription>Tren nilai anak dari waktu ke waktu</CardDescription>
        </CardHeader>
        <CardContent>
          {examHistory.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {data.examHistory.length === 0
                ? "Belum ada riwayat ujian"
                : "Tidak ada ujian pada periode ini"}
            </div>
          ) : (
            <div className="space-y-3">
              {examHistory.map((exam) => (
                <div key={exam.examId} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{exam.examTitle}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(exam.examDate).toLocaleDateString("id-ID")}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-lg font-bold tabular-nums">{exam.percentage.toFixed(1)}%</div>
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {exam.score} / {exam.maxScore}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-brand-blue-600 transition-all"
                      style={{ width: `${Math.min(100, Math.max(0, exam.percentage))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Perkembangan nilai per bab */}
      {data.categoryProgress && data.categoryProgress.points.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Perkembangan Nilai per Bab</CardTitle>
            <CardDescription>
              Persen skor per bab/tipe dari ujian ke ujian.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CategoryProgressChart data={data.categoryProgress} />
          </CardContent>
        </Card>
      ) : null}

      {/* Laporan bulanan */}
      <MonthlyReportCard studentId={studentId} />

      {/* Topic Analysis */}
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Analisis Topik</CardTitle>
            <CardDescription>Identifikasi topik kuat dan lemah berdasarkan tingkat kesulitan</CardDescription>
          </div>
          <select
            value={weakness}
            onChange={(e) => setWeakness(e.target.value)}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm sm:w-44"
            aria-label="Filter tingkat topik"
          >
            {WEAKNESS_OPTS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </CardHeader>
        <CardContent>
          {topics.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {data.topicAnalysis.length === 0
                ? "Belum ada data analisis topik"
                : "Tidak ada topik pada tingkat ini"}
            </div>
          ) : (
            <div className="space-y-3">
              {topics.map((topic) => (
                <div key={topic.topicName} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{topic.topicName}</div>
                      <div className="text-xs text-muted-foreground">
                        {topic.totalQuestions} soal • {topic.correctCount} benar • Avg {topic.avgScore.toFixed(1)}
                      </div>
                    </div>
                    <Badge className={getWeaknessColor(topic.weaknessLevel)}>
                      {topic.accuracy.toFixed(0)}%
                    </Badge>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full transition-all ${
                        topic.weaknessLevel === 'STRONG'
                          ? 'bg-emerald-500'
                          : topic.weaknessLevel === 'AVERAGE'
                            ? 'bg-amber-500'
                            : 'bg-red-500'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, topic.accuracy))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
