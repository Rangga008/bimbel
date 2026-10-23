"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

interface DifficultyBucket {
  total: number;
  correct: number;
}

interface SubjectDifficulty {
  subjectId: string | null;
  subjectName: string;
  total: number;
  correct: number;
  accuracy: number;
  easy: DifficultyBucket;
  medium: DifficultyBucket;
  hard: DifficultyBucket;
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
  subjectDifficulty?: SubjectDifficulty[];
  categoryProgress?: CategoryProgressData;
  overallStats: OverallStats;
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

export function StudentPerformance() {
  const [period, setPeriod] = useState("all");
  const [weakness, setWeakness] = useState("");
  const [examSearch, setExamSearch] = useState("");
  const [showAllExams, setShowAllExams] = useState(false);
  const performanceQ = useQuery({
    queryKey: ['analytics-my-performance'],
    queryFn: () => apiFetch<StudentPerformanceData>('/analytics/my-performance'),
  });
  const pointsQ = useQuery({
    queryKey: ['points-my-total'],
    queryFn: () => apiFetch<{ totalPoints: number }>('/point-transactions/my-total'),
  });

  if (performanceQ.isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Memuat data performa...</div>
      </div>
    );
  }

  if (performanceQ.isError) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-destructive">{err(performanceQ.error, 'Gagal memuat data performa.')}</div>
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
  const examHistory = (cutoff
    ? data.examHistory.filter((e) => new Date(e.examDate).getTime() >= cutoff)
    : data.examHistory
  ).filter((e) =>
    examSearch
      ? e.examTitle.toLowerCase().includes(examSearch.trim().toLowerCase())
      : true,
  );
  // Riwayat dibatasi 8 teratas kecuali user minta tampilkan semua.
  const visibleExams = showAllExams ? examHistory : examHistory.slice(0, 8);
  const topics = weakness
    ? data.topicAnalysis.filter((t) => t.weaknessLevel === weakness)
    : data.topicAnalysis;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Performa Saya</h1>
          <p className="text-muted-foreground">Analisis performa akademik Anda</p>
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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Poin Saya</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-brand-gold-600">
              {(pointsQ.data?.totalPoints ?? 0).toLocaleString('id-ID')}
            </div>
          </CardContent>
        </Card>

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
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Riwayat Ujian</CardTitle>
            <CardDescription>Tren nilai Anda dari waktu ke waktu</CardDescription>
          </div>
          <Input
            className="h-9 w-full sm:w-56"
            placeholder="Cari judul ujian…"
            value={examSearch}
            onChange={(e) => {
              setExamSearch(e.target.value);
              setShowAllExams(false);
            }}
          />
        </CardHeader>
        <CardContent>
          {examHistory.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {data.examHistory.length === 0
                ? "Belum ada riwayat ujian"
                : "Tidak ada ujian yang cocok dengan filter ini"}
            </div>
          ) : (
            <div className="space-y-3">
              {visibleExams.map((exam) => (
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
              {examHistory.length > 8 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => setShowAllExams(!showAllExams)}
                >
                  {showAllExams
                    ? "Tutup — tampilkan 8 teratas"
                    : `Tampilkan semua (${examHistory.length} ujian)`}
                </Button>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pengerjaan soal per mapel × kesulitan (ujian + latsol) */}
      <Card>
        <CardHeader>
          <CardTitle>Pengerjaan Soal per Mapel</CardTitle>
          <CardDescription>
            Perbandingan soal benar per tingkat kesulitan — dari ujian dan latsol yang sudah dikumpulkan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(data.subjectDifficulty ?? []).length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              Belum ada soal yang dikerjakan.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-xs uppercase text-muted-foreground">
                    <th className="px-3 py-2.5 font-medium">Mapel</th>
                    <th className="px-3 py-2.5 font-medium">Dikerjakan</th>
                    <th className="px-3 py-2.5 font-medium">Benar</th>
                    <th className="px-3 py-2.5 font-medium text-success-700">Easy</th>
                    <th className="px-3 py-2.5 font-medium text-amber-700">Medium</th>
                    <th className="px-3 py-2.5 font-medium text-destructive">Hard</th>
                    <th className="px-3 py-2.5 font-medium">Akurasi</th>
                  </tr>
                </thead>
                <tbody>
                  {data.subjectDifficulty!.map((s) => (
                    <tr key={s.subjectId ?? 'umum'} className="border-b last:border-0">
                      <td className="px-3 py-2.5 font-medium">{s.subjectName}</td>
                      <td className="px-3 py-2.5 tabular-nums">{s.total}</td>
                      <td className="px-3 py-2.5 tabular-nums">{s.correct}</td>
                      {(['easy', 'medium', 'hard'] as const).map((d) => (
                        <td key={d} className="px-3 py-2.5 tabular-nums">
                          {s[d].total > 0 ? (
                            <>
                              <span className="font-medium">{s[d].correct}</span>
                              <span className="text-muted-foreground">/{s[d].total}</span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      ))}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                            <div
                              className={`h-full rounded-full ${
                                s.accuracy >= 80
                                  ? 'bg-emerald-500'
                                  : s.accuracy >= 50
                                    ? 'bg-amber-500'
                                    : 'bg-red-500'
                              }`}
                              style={{ width: `${Math.min(100, s.accuracy)}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium tabular-nums">{s.accuracy.toFixed(0)}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
              Persen skor per bab/tipe dari ujian ke ujian — arahkan kursor ke titik untuk detail.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CategoryProgressChart data={data.categoryProgress} />
          </CardContent>
        </Card>
      ) : null}

      {/* Topic Analysis */}
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Analisis per Mapel</CardTitle>
            <CardDescription>Akurasi per mata pelajaran dari seluruh ujian &amp; latsol — filter Lemah/Cukup/Kuat.</CardDescription>
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
