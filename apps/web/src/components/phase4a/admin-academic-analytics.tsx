"use client";

import { Fragment, useState } from "react";
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
import { Phase1aSelectField } from "@/components/phase1a/phase1a-form-dialog";
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

interface ScoreRecapColumn {
  key: string;
  label: string;
  maxScore: number;
}
interface ScoreRecapRow {
  studentId: string;
  name: string;
  school: string;
  groups: string[];
  cells: Array<{ key: string; correct: number; total: number; score: number; maxScore: number }>;
  totalScore: number;
  maxScore: number;
  totalCorrect: number;
  percentage: number;
  submittedAt: string | null;
}
interface ScoreRecapData {
  exam: { title: string; programName: string | null; levelName: string | null; subjectName: string | null };
  columns: ScoreRecapColumn[];
  rows: ScoreRecapRow[];
  participantCount: number;
}

interface AnswerRecapQuestion {
  no: number;
  questionId: string;
  type: string;
  key: string;
  points: number;
}
interface AnswerRecapRow {
  studentId: string;
  name: string;
  school: string;
  answers: Array<{ display: string; isCorrect: boolean | null }>;
}
interface AnswerRecapData {
  exam: { title: string; levelName: string | null; subjectName: string | null };
  questions: AnswerRecapQuestion[];
  rows: AnswerRecapRow[];
  participantCount: number;
}

function accuracyVariant(accuracy: number) {
  if (accuracy >= 70) return "default" as const;
  if (accuracy >= 50) return "secondary" as const;
  return "destructive" as const;
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

function stripHtml(s: string) {
	return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** Tab "Analisis": grafik % benar per soal + daftar soal termudah/tersulit. */
function QuestionAnalysisPanel({ items }: { items: QuestionAnalytics[] }) {
	if (!items.length) {
		return <p className="px-1 py-4 text-sm text-muted-foreground">Belum ada jawaban untuk dianalisis.</p>;
	}
	const byAcc = [...items].sort((a, b) => a.accuracy - b.accuracy);
	const hardest = byAcc.slice(0, 5);
	const easiest = [...items].sort((a, b) => b.accuracy - a.accuracy).slice(0, 5);
	const barColor = (acc: number) =>
		acc >= 70 ? "#2e8b57" : acc >= 50 ? "#e8a020" : "#b03a48";

	const miniTable = (title: string, list: QuestionAnalytics[]) => (
		<div className="flex flex-col gap-1.5">
			<p className="text-xs font-semibold">{title}</p>
			<div className="overflow-x-auto rounded-lg border">
				<table className="w-full text-left text-xs">
					<thead>
						<tr className="border-b bg-muted/60 text-muted-foreground">
							<th className="w-10 px-2 py-1.5 font-medium">No</th>
							<th className="px-2 py-1.5 font-medium">Soal</th>
							<th className="px-2 py-1.5 font-medium whitespace-nowrap">Benar/Total</th>
							<th className="px-2 py-1.5 font-medium">Akurasi</th>
						</tr>
					</thead>
					<tbody>
						{list.map((q) => (
							<tr key={q.questionId} className="border-b last:border-0">
								<td className="px-2 py-1.5 tabular-nums">{items.indexOf(q) + 1}</td>
								<td className="max-w-xs truncate px-2 py-1.5" title={stripHtml(q.questionContent)}>
									{stripHtml(q.questionContent) || "—"}
								</td>
								<td className="px-2 py-1.5 tabular-nums">{q.correctAttempts}/{q.totalAttempts}</td>
								<td className="px-2 py-1.5">
									<Badge variant={accuracyVariant(q.accuracy)}>{q.accuracy.toFixed(1)}%</Badge>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-1.5">
				<p className="text-xs font-semibold">% Benar per Soal — hijau ≥70%, kuning 50–70%, merah &lt;50%</p>
				<div className="flex flex-col gap-1">
					{items.map((q, i) => (
						<div key={q.questionId} className="flex items-center gap-2 text-xs">
							<span className="w-14 shrink-0 tabular-nums">Soal {i + 1}</span>
							<div className="h-3.5 min-w-0 flex-1 rounded bg-muted">
								<div
									className="h-full rounded"
									style={{ width: `${Math.max(2, q.accuracy)}%`, background: barColor(q.accuracy) }}
								/>
							</div>
							<span className="w-24 shrink-0 text-right tabular-nums">
								{q.accuracy.toFixed(1)}% · {q.correctAttempts}/{q.totalAttempts}
							</span>
						</div>
					))}
				</div>
			</div>
			<div className="grid gap-4 md:grid-cols-2">
				{miniTable("Soal paling sulit (akurasi terendah)", hardest)}
				{miniTable("Soal paling bisa (akurasi tertinggi)", easiest)}
			</div>
		</div>
	);
}

function ScoreRecapTable({ data }: { data: ScoreRecapData }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle className="text-base">Rekap Nilai — {data.exam.title}</CardTitle>
        <CardDescription>
          {data.exam.programName ?? '-'} · {data.exam.levelName ?? '-'} · {data.exam.subjectName ?? '-'} · {data.participantCount} peserta
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b bg-muted">
              <th className="px-3 py-2">No</th>
              <th className="px-3 py-2">Nama</th>
              <th className="px-3 py-2">Sekolah</th>
              {data.columns.map((c) => (
                <th key={c.key} className="px-3 py-2">{c.label}</th>
              ))}
              <th className="px-3 py-2">Benar</th>
              <th className="px-3 py-2">Skor</th>
              <th className="px-3 py-2">%</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r, i) => (
              <tr key={r.studentId} className="border-b last:border-0 hover:bg-muted/50">
                <td className="px-3 py-2">{i + 1}</td>
                <td className="px-3 py-2 font-medium">{r.name}</td>
                <td className="px-3 py-2">{r.school}</td>
                {r.cells.map((c, j) => (
                  <td key={j} className="px-3 py-2 tabular-nums">{c.score}/{c.maxScore}</td>
                ))}
                <td className="px-3 py-2 tabular-nums">{r.totalCorrect}</td>
                <td className="px-3 py-2 tabular-nums font-semibold">{r.totalScore}/{r.maxScore}</td>
                <td className="px-3 py-2 tabular-nums">{r.percentage}%</td>
              </tr>
            ))}
            {data.rows.length === 0 ? (
              <tr><td colSpan={4 + data.columns.length} className="px-3 py-6 text-center text-muted-foreground">Belum ada attempt.</td></tr>
            ) : null}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function AnswerRecapTable({ data }: { data: AnswerRecapData }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle className="text-base">Rekap Jawaban — {data.exam.title}</CardTitle>
        <CardDescription>{data.exam.levelName ?? '-'} · {data.exam.subjectName ?? '-'} · {data.participantCount} peserta</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b bg-muted">
              <th className="px-3 py-2 sticky left-0 bg-muted">No</th>
              <th className="px-3 py-2 sticky left-0 bg-muted min-w-[140px]">Nama</th>
              {data.questions.map((q) => (
                <th key={q.questionId} className="px-3 py-2 text-center">{q.no}<br/><span className="text-[10px] text-muted-foreground">({q.key})</span></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r, i) => (
              <tr key={r.studentId} className="border-b last:border-0 hover:bg-muted/50">
                <td className="px-3 py-2 sticky left-0 bg-background">{i + 1}</td>
                <td className="px-3 py-2 sticky left-0 bg-background font-medium min-w-[140px]">{r.name}</td>
                {r.answers.map((a, j) => (
                  <td
                    key={j}
                    className={`px-2 py-2 text-center tabular-nums ${
                      a.isCorrect === true ? 'bg-green-50 text-green-700' : a.isCorrect === false ? 'bg-red-50 text-red-700' : ''
                    }`}
                  >
                    {a.display}
                  </td>
                ))}
              </tr>
            ))}
            {data.rows.length === 0 ? (
              <tr><td colSpan={2 + data.questions.length} className="px-3 py-6 text-center text-muted-foreground">Belum ada attempt.</td></tr>
            ) : null}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
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
  const [applied, setApplied] = useState<string | null>(null);
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

  const params = new URLSearchParams();
  if (programId) params.set('programId', programId);
  if (levelId) params.set('levelId', levelId);
  if (groupId) params.set('groupId', groupId);
  if (from) params.set('startDate', from);
  if (to) params.set('endDate', to);
  const qs = params.toString();

  const analyticsQ = useQuery({
    queryKey: ['analytics-admin-academic', applied],
    queryFn: () =>
      apiFetch<AdminAcademicAnalyticsData>(
        `/analytics/admin/academic${applied ? `?${applied}` : ''}`,
      ),
    // Data hanya dimuat setelah user memilih filter & menekan Tampilkan —
    // mencegah tabel langsung membanjiri layar saat halaman dibuka.
    enabled: applied !== null,
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
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              value={recapGroupId}
              onChange={(e) => setRecapGroupId(e.target.value)}
              aria-label="Filter kelompok"
            >
              <option value="">Semua kelompok</option>
              {(groupsQ.data ?? []).map((g) => (
                <option key={g.id} value={g.id}>
                  {g.code ? `${g.code} — ${g.name}` : g.name}
                </option>
              ))}
            </select>
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
        <Button size="sm" onClick={() => setApplied(qs)} disabled={!qs && applied === ""}>
          Tampilkan
        </Button>
        {programId || levelId || groupId || from || to || search ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setProgramId(""); setLevelId(""); setGroupId(""); setFrom(""); setTo(""); setSearch(""); setApplied(null); }}
          >
            Reset
          </Button>
        ) : null}
      </div>

      {applied === null ? (
        <EmptyState
          icon={ChartLine}
          title="Atur filter lalu tekan Tampilkan"
          description="Data analisis tidak dimuat otomatis — pilih program/level/kelompok/tanggal dulu."
        />
      ) : analyticsQ.isLoading ? (
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
                  {exams.map((exam) => {
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
          )}
        </>
      )}
    </div>
  );
}
