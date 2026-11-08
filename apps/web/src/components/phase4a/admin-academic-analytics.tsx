"use client";

import { Fragment, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
	ArrowLeft,
	ChartLine,
	ChevronRight,
	FileCheck2,
	FileDown,
	FileQuestion,
	Printer,
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
import {
	accuracyVariant,
	AnswerRecapTable,
	QuestionAnalysisPanel,
	ScoreRecapTable,
	type AnswerRecapData,
	type QuestionAnalytics,
	type ScoreRecapData,
} from "@/components/phase4a/exam-analysis-shared";
import { Phase1aSelectField } from "@/components/phase1a/phase1a-form-dialog";
import { useContentCategories, useContentLevels } from "@/components/shared/content-drilldown";
import { categoryOptions } from "@/lib/content-taxonomy";
import { score100 } from '@/lib/score';
import { apiFetch, apiFetchBlob, ApiError } from "@/lib/api-client";

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

/** Unduh blob sebagai file (rekap Excel). */
async function downloadBlob(path: string, filename: string) {
  const blob = await apiFetchBlob(path);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Buka dokumen cetak (HTML print) di tab baru — user print/Save as PDF. */
async function openPrintDoc(path: string) {
  const blob = await apiFetchBlob(path);
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
}


/** Hari terakhir bulan dari string "YYYY-MM" → "YYYY-MM-DD". */
function lastDayOfMonth(ym: string) {
	const [y, m] = ym.split("-").map(Number);
	const d = new Date(y, m, 0); // hari ke-0 bulan berikutnya = hari terakhir bulan m
	return `${y}-${String(m).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
  const [subjectId, setSubjectId] = useState("");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  // Pagination daftar ujian: 5/10/20/50/Semua (0 = semua).
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(0);
  // Data langsung dimuat saat halaman dibuka; tiap perubahan filter
  // otomatis me-refresh query — tanpa tombol "Tampilkan".
  const [activeTab, setActiveTab] = useState<"score" | "answer" | "analysis" | null>("score");
  const [expandedQ, setExpandedQ] = useState<string | null>(null);
  const [recapGroupId, setRecapGroupId] = useState("");

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
  // Hierarki jenjang→mapel + tipe ujian dari master data — sama dengan
  // sumber yang dipakai form soal/ujian.
  const levelsQ = useContentLevels();
  const catsQ = useContentCategories();
  const subjectsQ = useQuery({
    queryKey: ['subjects'],
    queryFn: () => apiFetch<{ id: string; code: string; name: string }[]>('/master/subjects'),
    staleTime: 5 * 60 * 1000,
  });

  const params = new URLSearchParams();
  if (programId) params.set('programId', programId);
  if (levelId) params.set('levelId', levelId);
  if (groupId) params.set('groupId', groupId);
  if (subjectId) params.set('subjectId', subjectId);
  if (category) params.set('category', category);
  if (from) params.set('startDate', from);
  if (to) params.set('endDate', to);
  const qs = params.toString();

  const analyticsQ = useQuery({
    queryKey: ['analytics-admin-academic', qs],
    queryFn: () =>
      apiFetch<AdminAcademicAnalyticsData>(
        `/analytics/admin/academic${qs ? `?${qs}` : ''}`,
      ),
    // Refresh berkala — hasil terbaru (ujian selesai, attempt baru)
    // muncul tanpa perlu aksi manual.
    refetchInterval: 30_000,
  });

  const scoreQ = useQuery({
    queryKey: ['exam-score-recap', selectedExamId, recapGroupId],
    queryFn: () =>
      apiFetch<ScoreRecapData>(
        `/analytics/exam/${selectedExamId}/score-recap${recapGroupId ? `?groupId=${recapGroupId}` : ''}`,
      ),
    enabled: !!selectedExamId && activeTab === 'score',
  });

  const answerQ = useQuery({
    queryKey: ['exam-answer-recap', selectedExamId, recapGroupId],
    queryFn: () =>
      apiFetch<AnswerRecapData>(
        `/analytics/exam/${selectedExamId}/answer-recap${recapGroupId ? `?groupId=${recapGroupId}` : ''}`,
      ),
    enabled: !!selectedExamId && activeTab === 'answer',
  });

  // Filter/cari/ukuran-halaman berubah → kembali ke halaman pertama.
  useEffect(() => setPage(0), [qs, search, pageSize]);

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
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => openPrintDoc(`/analytics/exam/${selectedExam.examId}/print?part=questions`)}
            >
              <Printer className="mr-1.5 size-4" /> Cetak Soal
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => openPrintDoc(`/analytics/exam/${selectedExam.examId}/print?part=questions&key=1`)}
            >
              <FileCheck2 className="mr-1.5 size-4" /> Kunci Jawaban
            </Button>
            <Badge variant={accuracyVariant(summary.avgAccuracy)} className="text-sm">
              Akurasi {summary.avgAccuracy.toFixed(1)}%
            </Badge>
          </div>
        </div>

        {/* Rekap — tampil langsung di halaman + unduh Excel/cetak PDF. */}
        <div className="flex flex-col gap-3 rounded-xl border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={activeTab === 'score' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab('score')}
            >
              Rekap Nilai
            </Button>
            <Button
              variant={activeTab === 'answer' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab('answer')}
            >
              Rekap Jawaban
            </Button>
            <Button
              variant={activeTab === 'analysis' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab('analysis')}
            >
              Analisis
            </Button>
            <div className="w-56">
              <Phase1aSelectField
                id="analytics-recap-group"
                value={recapGroupId}
                onChange={setRecapGroupId}
                options={(groupsQ.data ?? []).map((g) => ({
                  value: g.id,
                  label: g.code ? `${g.code} — ${g.name}` : g.name,
                }))}
                placeholder="Semua kelompok"
              />
            </div>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  downloadBlob(
                    activeTab === 'analysis'
                      ? `/analytics/exam/${selectedExam.examId}/analysis.xlsx`
                      : `/analytics/exam/${selectedExam.examId}/${activeTab === 'score' ? 'score' : 'answer'}-recap.xlsx${recapGroupId ? `?groupId=${recapGroupId}` : ''}`,
                    `rekap-${activeTab === 'score' ? 'nilai' : activeTab === 'answer' ? 'jawaban' : 'analisis'}-${selectedExam.examTitle}.xlsx`,
                  )
                }
              >
                <FileDown className="mr-1.5 size-4" /> Excel
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  openPrintDoc(
                    `/analytics/exam/${selectedExam.examId}/print?part=${activeTab === 'score' ? 'scores' : activeTab === 'answer' ? 'answers' : 'analysis'}${activeTab === 'analysis' ? '' : recapGroupId ? `&groupId=${recapGroupId}` : ''}`,
                  )
                }
              >
                <Printer className="mr-1.5 size-4" /> Cetak / PDF
              </Button>
            </div>
          </div>

          {activeTab === 'score' ? (
            scoreQ.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : scoreQ.isError ? (
              <p className="text-sm text-destructive">Gagal memuat rekap nilai.</p>
            ) : scoreQ.data ? (
              <ScoreRecapTable data={scoreQ.data} />
            ) : null
          ) : null}

          {activeTab === 'answer' ? (
            answerQ.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : answerQ.isError ? (
              <p className="text-sm text-destructive">Gagal memuat rekap jawaban.</p>
            ) : answerQ.data ? (
              <AnswerRecapTable data={answerQ.data} />
            ) : null
          ) : null}

          {activeTab === 'analysis' ? (
            <QuestionAnalysisPanel items={selectedExam.questionAnalytics} />
          ) : null}
        </div>

        {selectedExam.questionAnalytics.length === 0 ? (
          <EmptyState
            icon={FileQuestion}
            title="Belum ada data analisis soal"
            description="Soal akan muncul di sini setelah ada attempt ujian."
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2.5 font-medium">#</th>
                  <th className="px-3 py-2.5 font-medium">Soal</th>
                  <th className="px-3 py-2.5 font-medium">Tipe</th>
                  <th className="px-3 py-2.5 font-medium">Attempt</th>
                  <th className="px-3 py-2.5 font-medium">Benar</th>
                  <th className="px-3 py-2.5 font-medium">Akurasi</th>
                  <th className="px-3 py-2.5 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {selectedExam.questionAnalytics.map((question, index) => {
                  const open = expandedQ === question.questionId;
                  return (
                    <Fragment key={question.questionId}>
                      <tr
                        className="cursor-pointer border-b last:border-0 hover:bg-accent/50"
                        onClick={() => setExpandedQ(open ? null : question.questionId)}
                      >
                        <td className="px-3 py-2.5 tabular-nums">{index + 1}</td>
                        <td className="max-w-md px-3 py-2.5">
                          <p className="truncate font-medium">{question.questionContent}</p>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">{question.questionType}</td>
                        <td className="px-3 py-2.5 tabular-nums">{question.totalAttempts}</td>
                        <td className="px-3 py-2.5 tabular-nums">{question.correctAttempts}</td>
                        <td className="px-3 py-2.5">
                          <Badge variant={accuracyVariant(question.accuracy)}>
                            {question.accuracy.toFixed(1)}%
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <ChevronRight className={`ml-auto size-4 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`} />
                        </td>
                      </tr>
                      {open ? (
                        <tr className="border-b last:border-0">
                          <td colSpan={7} className="bg-muted/30 px-4 py-3">
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
  // Mapel: kalau jenjang dipilih, tampilkan mapel yang diajarkan di jenjang
  // tsb (levelSubjects); kalau belum, seluruh master mapel.
  const subjectOptions = (() => {
    const lvl = (levelsQ.data ?? []).find((l) => l.id === levelId);
    if (lvl?.levelSubjects?.length) {
      return lvl.levelSubjects
        .map((ls) => ls.subject)
        .filter((s): s is { id: string; name: string } => !!s)
        .map((s) => ({ value: s.id, label: s.name }));
    }
    return (subjectsQ.data ?? []).map((s) => ({
      value: s.id,
      label: `${s.code} — ${s.name}`,
    }));
  })();

  // Tahun ajaran berjalan Juli–Juni. Pilihan preset menulis rentang
  // Dari/Sampai tanggal; kalau tanggal diubah manual (atau lewat Periode
  // Bulan), pilihan preset otomatis lepas — dari from/to yang berlaku.
  const now = new Date();
  const startYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  const academicYears = Array.from({ length: 6 }, (_, i) => {
    const y = startYear - i;
    return {
      value: `${y}/${y + 1}`,
      label: `${y}/${y + 1}`,
      from: `${y}-07-01`,
      to: `${y + 1}-06-30`,
    };
  });
  const academicYear =
    academicYears.find((a) => a.from === from && a.to === to)?.value ?? "";
  // Periode bulan aktif bila from = tanggal 1 dan to = hari terakhir bulan itu.
  const month =
    from && to && from.endsWith("-01") && to === lastDayOfMonth(from.slice(0, 7))
      ? from.slice(0, 7)
      : "";

  const exams = (data?.examAnalytics ?? []).filter((e) =>
    search
      ? e.examTitle.toLowerCase().includes(search.trim().toLowerCase())
      : true,
  );

  const totalExamPages = pageSize > 0 ? Math.max(1, Math.ceil(exams.length / pageSize)) : 1;
  const shownExams =
    pageSize > 0 ? exams.slice(page * pageSize, (page + 1) * pageSize) : exams;

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
            onChange={(v) => { setProgramId(v); setLevelId(""); setGroupId(""); setSubjectId(""); }}
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
            onChange={(v) => { setLevelId(v); setGroupId(""); setSubjectId(""); }}
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
        <div className="w-56">
          <Phase1aSelectField
            id="an-subject"
            label="Mapel"
            value={subjectId}
            onChange={setSubjectId}
            options={subjectOptions}
            placeholder="Semua mapel"
          />
        </div>
        <div className="w-48">
          <Phase1aSelectField
            id="an-category"
            label="Tipe Ujian"
            value={category}
            onChange={setCategory}
            options={categoryOptions(catsQ.data)}
            placeholder="Semua tipe"
          />
        </div>
        <div className="w-44">
          <Phase1aSelectField
            id="an-ay"
            label="Tahun Ajaran"
            value={academicYear}
            onChange={(v) => {
              const a = academicYears.find((x) => x.value === v);
              setFrom(a?.from ?? "");
              setTo(a?.to ?? "");
            }}
            options={academicYears.map((a) => ({ value: a.value, label: a.label }))}
            placeholder="Semua"
          />
        </div>
        <label className="flex flex-col gap-1 text-xs">
          Periode bulan
          <Input
            type="month"
            className="h-9"
            value={month}
            onChange={(e) => {
              const v = e.target.value; // "YYYY-MM" atau "" saat dibersihkan
              setFrom(v ? `${v}-01` : "");
              setTo(v ? lastDayOfMonth(v) : "");
            }}
          />
        </label>
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
        {programId || levelId || groupId || subjectId || category || from || to || search ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setProgramId(""); setLevelId(""); setGroupId(""); setSubjectId(""); setCategory(""); setFrom(""); setTo(""); setSearch(""); }}
          >
            Reset
          </Button>
        ) : null}
      </div>

      {analyticsQ.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <>
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
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{exams.length} ujian ditemukan</span>
                <label className="flex items-center gap-1.5">
                  Tampilkan
                  <select
                    className="h-8 rounded-md border border-input bg-background px-2"
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={0}>Semua</option>
                  </select>
                </label>
              </div>
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-xs uppercase text-muted-foreground">
                      <th className="px-3 py-2.5 font-medium">Ujian</th>
                      <th className="px-3 py-2.5 font-medium">Soal</th>
                      <th className="px-3 py-2.5 font-medium">Attempt</th>
                      <th className="px-3 py-2.5 font-medium">Akurasi</th>
                      <th className="px-3 py-2.5 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownExams.map((exam) => {
                      const s = examSummary(exam);
                      return (
                        <tr
                          key={exam.examId}
                          className="cursor-pointer border-b last:border-0 hover:bg-accent/50"
                          onClick={() => { setSelectedExamId(exam.examId); setRecapGroupId(""); }}
                        >
                          <td className="px-3 py-2.5 font-medium">{exam.examTitle}</td>
                          <td className="px-3 py-2.5 tabular-nums">{s.questions}</td>
                          <td className="px-3 py-2.5 tabular-nums">{s.attempts}</td>
                          <td className="px-3 py-2.5">
                            <Badge variant={accuracyVariant(s.avgAccuracy)}>
                              {s.avgAccuracy.toFixed(1)}%
                            </Badge>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <Button variant="ghost" size="sm" className="gap-1">
                              Detail <ChevronRight className="size-4" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {totalExamPages > 1 ? (
                <div className="flex items-center justify-center gap-2 text-sm">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page <= 0}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    ←
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {page + 1} / {totalExamPages}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page >= totalExamPages - 1}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    →
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </>
      )}
    </div>
  );
}
