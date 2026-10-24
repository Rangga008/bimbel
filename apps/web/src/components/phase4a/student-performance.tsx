"use client";

import { Fragment, useState } from "react";
import { ChevronDown } from "lucide-react";
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
  subjectName?: string | null;
  category?: string | null;
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
  subjectDifficulty?: SubjectDifficulty[];
  categoryProgress?: CategoryProgressData;
  overallStats: OverallStats;
}

const PERIOD_DAYS: Record<string, number | null> = {
  all: null,
  "30": 30,
  "90": 90,
};

/** Label tipe ujian di filter riwayat — nilai mentah dipakai bila tak dikenal. */
const CATEGORY_LABELS: Record<string, string> = {
  HARIAN: "Ulangan Harian",
  UTS: "UTS",
  UAS: "UAS",
  TRY_OUT: "Try Out",
  BAB: "Ujian Bab",
  EXAM: "Ujian",
};

export function StudentPerformance({
  endpoint = "/analytics/my-performance",
  title,
  subtitle = "Analisis performa akademik Anda",
  showPoints = true,
}: {
  /** Endpoint performa — ortu memakai /analytics/parent/child/:id/performance. */
  endpoint?: string;
  title?: string;
  subtitle?: string;
  /** Kartu "Poin Saya" hanya untuk siswa sendiri. */
  showPoints?: boolean;
}) {
  const [period, setPeriod] = useState("all");
  const [examSearch, setExamSearch] = useState("");
  const [examSubject, setExamSubject] = useState("");
  const [examCategory, setExamCategory] = useState("");
  const [showAllExams, setShowAllExams] = useState(false);
  const [expandedSubject, setExpandedSubject] = useState<string | null>(null);
  const performanceQ = useQuery({
    queryKey: ['analytics-performance', endpoint],
    queryFn: () => apiFetch<StudentPerformanceData>(endpoint),
  });
  const pointsQ = useQuery({
    queryKey: ['points-my-total'],
    queryFn: () => apiFetch<{ totalPoints: number }>('/point-transactions/my-total'),
    enabled: showPoints,
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

  const periodDays = PERIOD_DAYS[period] ?? null;
  const cutoff = periodDays ? Date.now() - periodDays * 86400_000 : null;
  // Filter riwayat: periode + mapel + tipe ujian + cari judul.
  const examHistory = (cutoff
    ? data.examHistory.filter((e) => new Date(e.examDate).getTime() >= cutoff)
    : data.examHistory
  ).filter((e) => {
    if (examSubject && (e.subjectName ?? "") !== examSubject) return false;
    if (examCategory && (e.category ?? "") !== examCategory) return false;
    if (examSearch && !e.examTitle.toLowerCase().includes(examSearch.trim().toLowerCase())) return false;
    return true;
  });
  // Riwayat dibatasi 8 teratas kecuali user minta tampilkan semua.
  const visibleExams = showAllExams ? examHistory : examHistory.slice(0, 8);
  const subjectOptions = [...new Set(data.examHistory.map((e) => e.subjectName).filter(Boolean))] as string[];
  const categoryOptions = [...new Set(data.examHistory.map((e) => e.category).filter(Boolean))] as string[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">
            {title ?? (showPoints ? "Performa Saya" : `Performa: ${data.studentName}`)}
          </h1>
          <p className="text-muted-foreground">{subtitle}</p>
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
      <div className={`grid gap-4 md:grid-cols-2 ${showPoints ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
        {showPoints ? (
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
        ) : null}

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
          <div className="flex flex-wrap gap-2">
            {subjectOptions.length > 1 ? (
              <select
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={examSubject}
                onChange={(e) => { setExamSubject(e.target.value); setShowAllExams(false); }}
                aria-label="Filter mapel"
              >
                <option value="">Semua mapel</option>
                {subjectOptions.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            ) : null}
            {categoryOptions.length > 1 ? (
              <select
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={examCategory}
                onChange={(e) => { setExamCategory(e.target.value); setShowAllExams(false); }}
                aria-label="Filter tipe ujian"
              >
                <option value="">Semua tipe</option>
                {categoryOptions.map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c] ?? c}</option>
                ))}
              </select>
            ) : null}
            <Input
              className="h-9 w-full sm:w-48"
              placeholder="Cari judul ujian…"
              value={examSearch}
              onChange={(e) => {
                setExamSearch(e.target.value);
                setShowAllExams(false);
              }}
            />
          </div>
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
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        {new Date(exam.examDate).toLocaleDateString("id-ID")}
                        {exam.subjectName ? <Badge variant="outline">{exam.subjectName}</Badge> : null}
                        {exam.category ? <Badge variant="secondary">{CATEGORY_LABELS[exam.category] ?? exam.category}</Badge> : null}
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
            Perbandingan soal benar per tingkat kesulitan — klik nama mapel untuk rincian Mudah/Sedang/Sulit.
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
                  {data.subjectDifficulty!.map((s) => {
                    const key = s.subjectId ?? 'umum';
                    const open = expandedSubject === key;
                    const DIFF_META = [
                      { key: 'easy' as const, label: 'Soal Mudah', color: 'bg-emerald-500', text: 'text-success-700' },
                      { key: 'medium' as const, label: 'Soal Sedang', color: 'bg-amber-500', text: 'text-amber-700' },
                      { key: 'hard' as const, label: 'Soal Sulit', color: 'bg-red-500', text: 'text-destructive' },
                    ];
                    return (
                      <Fragment key={key}>
                        <tr
                          className="cursor-pointer border-b hover:bg-accent/40"
                          onClick={() => setExpandedSubject(open ? null : key)}
                        >
                          <td className="px-3 py-2.5 font-medium">
                            <span className="flex items-center gap-1.5">
                              <ChevronDown className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
                              {s.subjectName}
                            </span>
                          </td>
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
                        {open ? (
                          <tr className="border-b bg-muted/20">
                            <td colSpan={7} className="px-4 py-3">
                              <div className="grid gap-2 sm:grid-cols-3">
                                {DIFF_META.map((m) => {
                                  const b = s[m.key];
                                  const acc = b.total ? Math.round((b.correct / b.total) * 100) : 0;
                                  return (
                                    <div key={m.key} className="rounded-lg border bg-card p-3">
                                      <p className={`text-xs font-medium ${m.text}`}>{m.label}</p>
                                      <p className="mt-1 text-lg font-bold tabular-nums">
                                        {b.correct}<span className="text-sm font-normal text-muted-foreground"> / {b.total} benar</span>
                                      </p>
                                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                                        <div className={`h-full rounded-full ${m.color}`} style={{ width: `${acc}%` }} />
                                      </div>
                                      <p className="mt-1 text-xs text-muted-foreground tabular-nums">{acc}% akurat</p>
                                    </div>
                                  );
                                })}
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
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

    </div>
  );
}
