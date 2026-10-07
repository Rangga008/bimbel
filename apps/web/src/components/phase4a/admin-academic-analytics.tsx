"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
	ArrowLeft,
	ChartLine,
	ChevronRight,
	FileCheck2,
	FileQuestion,
	Target,
	Timer,
	Users,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { Phase1aSelectField } from "@/components/phase1a/phase1a-form-dialog";
import { apiFetch, apiFetchBlob, ApiError } from "@/lib/api-client";
import { toast } from "sonner";
import { Printer, FileSpreadsheet } from "lucide-react";

interface ProgramOption {
	id: string;
	name: string;
	code: string | null;
	levels: Array<{ id: string; name: string }>;
}
interface GroupOption {
	id: string;
	name: string;
	code: string | null;
	programId: string;
	levelId: string | null;
}

function err(e: unknown, fb: string) {
  return e instanceof ApiError ? e.message : fb;
}

interface QuestionAnalytics {
  questionId: string;
  questionContent: string;
  questionType: string;
  totalAttempts: number;
  correctAttempts: number;
  accuracy: number;
  optionDistribution: Array<{
    optionId: string;
    optionContent: string;
    isCorrect: boolean;
    selectedCount: number;
    selectionRate: number;
  }>;
  avgResponseTimeMs?: number;
}

interface ExamAnalytics {
  examId: string;
  examTitle: string;
  questionAnalytics: QuestionAnalytics[];
}

interface AdminAcademicAnalyticsData {
  totalExams: number;
  totalAttempts: number;
  avgPercentage: number;
  examAnalytics: ExamAnalytics[];
}

function accuracyVariant(accuracy: number) {
  if (accuracy >= 70) return "default" as const;
  if (accuracy >= 50) return "secondary" as const;
  return "destructive" as const;
}

/** Ringkasan per ujian dihitung dari analisis soalnya. */
function examSummary(exam: ExamAnalytics) {
  const questions = exam.questionAnalytics;
  const attempts = Math.max(0, ...questions.map((q) => q.totalAttempts));
  const avgAccuracy = questions.length
    ? questions.reduce((s, q) => s + q.accuracy, 0) / questions.length
    : 0;
  return { questions: questions.length, attempts, avgAccuracy };
}

export function AdminAcademicAnalytics() {
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);
  const [programId, setProgramId] = useState("");
  const [levelId, setLevelId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");

  const programsQ = useQuery({
    queryKey: ['programs-options'],
    queryFn: () => apiFetch<ProgramOption[]>('/programs/options'),
    staleTime: 5 * 60 * 1000,
  });
  const groupsQ = useQuery({
    queryKey: ['analytics-groups'],
    queryFn: () => apiFetch<GroupOption[]>('/groups'),
    staleTime: 5 * 60 * 1000,
  });

  const params = new URLSearchParams();
  if (programId) params.set('programId', programId);
  if (levelId) params.set('levelId', levelId);
  if (groupId) params.set('groupId', groupId);
  if (from) params.set('startDate', from);
  if (to) params.set('endDate', to);
  const qs = params.toString();

  const analyticsQ = useQuery({
    queryKey: ['analytics-admin-academic', qs],
    queryFn: () =>
      apiFetch<AdminAcademicAnalyticsData>(
        `/analytics/admin/academic${qs ? `?${qs}` : ''}`,
      ),
  });

  if (analyticsQ.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (analyticsQ.isError) {
    return (
      <EmptyState
        icon={ChartLine}
        title="Gagal memuat analisis"
        description={err(analyticsQ.error, 'Gagal memuat data analisis.')}
      />
    );
  }

  const data = analyticsQ.data;
  const selectedExam =
    data?.examAnalytics.find((e) => e.examId === selectedExamId) ?? null;

  /** Buka dokumen cetak HTML di tab baru / unduh xlsx. */
  async function openPrint(path: string, downloadName?: string) {
    try {
      const blob = await apiFetchBlob(path);
      const url = URL.createObjectURL(blob);
      if (downloadName) {
        const a = document.createElement("a");
        a.href = url;
        a.download = downloadName;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 30_000);
      } else {
        window.open(url, "_blank", "noopener");
      }
    } catch (e) {
      toast.error(err(e, "Gagal membuka dokumen."));
    }
  }

  // ---- Tampilan detail: analisis soal untuk satu ujian ----
  if (selectedExam) {
    const summary = examSummary(selectedExam);
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2 mb-1 gap-1.5 text-muted-foreground"
              onClick={() => setSelectedExamId(null)}
            >
              <ArrowLeft className="size-4" />
              Semua ujian
            </Button>
            <h1 className="text-2xl font-semibold tracking-tight">
              {selectedExam.examTitle}
            </h1>
            <p className="text-sm text-muted-foreground">
              {summary.questions} soal · {summary.attempts} attempt · akurasi rata-rata {summary.avgAccuracy.toFixed(1)}%
            </p>
          </div>
          <Badge variant={accuracyVariant(summary.avgAccuracy)} className="text-sm">
            Akurasi {summary.avgAccuracy.toFixed(1)}%
          </Badge>
        </div>

        {/* Rekap & cetak — format mengikuti laporan hasil TO (PDF referensi). */}
        <div className="flex flex-wrap gap-2 rounded-xl border p-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => openPrint(`/analytics/exam/${selectedExam.examId}/print?part=scores`)}
          >
            <Printer className="size-4" /> Rekap Nilai (cetak)
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => openPrint(`/analytics/exam/${selectedExam.examId}/print?part=answers`)}
          >
            <Printer className="size-4" /> Rekap Jawaban Siswa (cetak)
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => openPrint(`/analytics/exam/${selectedExam.examId}/print?part=questions`)}
          >
            <Printer className="size-4" /> Cetak Soal
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              openPrint(
                `/analytics/exam/${selectedExam.examId}/score-recap.xlsx`,
                `rekap-nilai-${selectedExam.examTitle.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}.xlsx`,
              )
            }
          >
            <FileSpreadsheet className="size-4" /> Rekap Nilai — Excel
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              openPrint(
                `/analytics/exam/${selectedExam.examId}/answer-recap.xlsx`,
                `rekap-jawaban-${selectedExam.examTitle.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}.xlsx`,
              )
            }
          >
            <FileSpreadsheet className="size-4" /> Rekap Jawaban — Excel
          </Button>
        </div>

        {selectedExam.questionAnalytics.length === 0 ? (
          <EmptyState
            icon={FileQuestion}
            title="Belum ada data analisis soal"
            description="Soal akan muncul di sini setelah ada attempt ujian."
          />
        ) : (
          <div className="grid gap-4">
            {selectedExam.questionAnalytics.map((question, index) => (
              <Card key={question.questionId}>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-base leading-snug">
                        Soal {index + 1}: {question.questionContent}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {question.questionType} · {question.totalAttempts} attempt
                      </CardDescription>
                    </div>
                    <Badge variant={accuracyVariant(question.accuracy)}>
                      Akurasi {question.accuracy.toFixed(1)}%
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <h4 className="mb-2 text-sm font-medium">Statistik Jawaban</h4>
                      <div className="grid gap-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <Target className="size-4" />
                            Jawaban benar
                          </span>
                          <span className="font-medium tabular-nums">
                            {question.correctAttempts} / {question.totalAttempts}
                          </span>
                        </div>
                        {question.avgResponseTimeMs ? (
                          <div className="flex items-center justify-between text-sm">
                            <span className="flex items-center gap-1.5 text-muted-foreground">
                              <Timer className="size-4" />
                              Rata-rata waktu
                            </span>
                            <span className="font-medium tabular-nums">
                              {(question.avgResponseTimeMs / 1000).toFixed(1)} detik
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div>
                      <h4 className="mb-2 text-sm font-medium">Distribusi Opsi</h4>
                      <div className="grid gap-2">
                        {question.optionDistribution.map((option) => (
                          <div
                            key={option.optionId}
                            className="flex items-center justify-between gap-2 text-sm"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <Badge variant={option.isCorrect ? "default" : "outline"}>
                                {option.isCorrect ? "✓" : "✗"}
                              </Badge>
                              <span className="truncate">{option.optionContent}</span>
                            </div>
                            <div className="flex shrink-0 items-center gap-2 tabular-nums">
                              <span className="text-muted-foreground">{option.selectedCount}x</span>
                              <span className="font-medium">{option.selectionRate.toFixed(1)}%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  const levelOptions =
    programsQ.data?.find((p) => p.id === programId)?.levels ??
    programsQ.data?.flatMap((p) => p.levels) ??
    [];
  const groupOptions = (groupsQ.data ?? []).filter(
    (g) =>
      (!programId || g.programId === programId) &&
      (!levelId || g.levelId === levelId),
  );
  const exams = (data?.examAnalytics ?? []).filter((e) =>
    search
      ? e.examTitle.toLowerCase().includes(search.trim().toLowerCase())
      : true,
  );

  // ---- Tampilan daftar: pilih ujian ----
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Analisis Akademik</h1>
        <p className="text-sm text-muted-foreground">
          Filter per program/level/tanggal, lalu pilih ujian untuk analisis per soal.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border p-3">
        <div className="w-56">
          <Phase1aSelectField
            id="an-program"
            label="Program"
            value={programId}
            onChange={(v) => { setProgramId(v); setLevelId(""); setGroupId(""); }}
            options={(programsQ.data ?? []).map((p) => ({
              value: p.id,
              label: p.code ? `${p.code} — ${p.name}` : p.name,
            }))}
            placeholder="Semua program"
          />
        </div>
        <div className="w-56">
          <Phase1aSelectField
            id="an-level"
            label="Level"
            value={levelId}
            onChange={(v) => { setLevelId(v); setGroupId(""); }}
            options={levelOptions.map((l) => ({ value: l.id, label: l.name }))}
            placeholder="Semua level"
          />
        </div>
        <div className="w-56">
          <Phase1aSelectField
            id="an-group"
            label="Kelompok"
            value={groupId}
            onChange={setGroupId}
            options={groupOptions.map((g) => ({
              value: g.id,
              label: g.code ? `${g.code} — ${g.name}` : g.name,
            }))}
            placeholder="Semua kelompok"
          />
        </div>
        <label className="flex flex-col gap-1 text-xs">
          Dari tanggal
          <Input type="date" className="h-9" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Sampai tanggal
          <Input type="date" className="h-9" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs">
          Cari ujian
          <Input
            className="h-9"
            placeholder="Judul ujian…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {programId || levelId || groupId || from || to || search ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setProgramId(""); setLevelId(""); setGroupId(""); setFrom(""); setTo(""); setSearch(""); }}
          >
            Reset
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { icon: FileCheck2, label: "Total Ujian", value: data?.totalExams ?? 0 },
          { icon: Users, label: "Total Attempt", value: data?.totalAttempts ?? 0 },
          { icon: Target, label: "Rata-rata Nilai", value: `${(data?.avgPercentage ?? 0).toFixed(1)}%` },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-3 pt-6">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-blue-50 text-brand-blue-600">
                <s.icon className="size-5" />
              </span>
              <div>
                <p className="text-2xl font-bold tabular-nums tracking-tight">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {exams.length === 0 ? (
        <EmptyState
          icon={FileCheck2}
          title="Tidak ada ujian untuk filter ini"
          description="Coba longgarkan filter, atau buat ujian lalu tunggu ada attempt."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {exams.map((exam) => {
            const s = examSummary(exam);
            return (
              <Card
                key={exam.examId}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedExamId(exam.examId)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedExamId(exam.examId);
                  }
                }}
                className="cursor-pointer transition-colors hover:border-brand-blue-300 hover:bg-brand-blue-50/40"
              >
                <CardContent className="flex items-center gap-4 pt-6">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-blue-50 text-brand-blue-600">
                    <FileCheck2 className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{exam.examTitle}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span>{s.questions} soal</span>
                      <span>{s.attempts} attempt</span>
                      <Badge variant={accuracyVariant(s.avgAccuracy)} className="text-[11px]">
                        Akurasi {s.avgAccuracy.toFixed(1)}%
                      </Badge>
                    </div>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
