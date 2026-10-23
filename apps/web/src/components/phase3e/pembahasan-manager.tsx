'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Maximize2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch, ApiError, resolveAssetUrl } from '@/lib/api-client';
import { MathContent } from '@/components/shared/math-content';
import { applyDrill, categoryLabel, drillDone } from '@/lib/content-taxonomy';
import {
  ContentDrilldown,
  DrillBreadcrumb,
  useContentCategories,
  useContentLevels,
  useDrillState,
} from '@/components/shared/content-drilldown';

interface Exam {
  id: string;
  title: string;
  scheduledEndAt: string;
  category?: string | null;
  level?: { id: string; name: string } | null;
  subject?: { id: string; name: string } | null;
  _count: { attempts: number };
}

interface Question {
  id: string;
  type: string;
  content: string;
  imageUrl?: string;
  points?: number;
  answerKey?: string;
  explanation?: string;
  explanationImageUrl?: string | null;
  options: Array<{
    id: string;
    content: string;
    isCorrect: boolean;
  }>;
}

interface ExamItem {
  questionId: string;
  sortOrder: number;
  points: number;
  question: Question;
}

function err(e: unknown, fb: string) {
  return e instanceof ApiError ? e.message : fb;
}

function getQuestionTypeLabel(type: string) {
  const labels: Record<string, string> = {
    SINGLE_CHOICE: 'Pilihan Ganda',
    MULTIPLE_CHOICE: 'Pilihan Ganda Kompleks',
    TRUE_FALSE: 'Benar/Salah',
    SHORT_ANSWER: 'Isian Singkat',
    ESSAY: 'Essay',
  };
  return labels[type] || type;
}

/** Tampilan kunci jawaban + pembahasan untuk 1 soal (dipakai di mode seleksi & mode sesi). */
function QuestionAnswerKey({ question }: { question: Question }) {
  return (
    <>
      <div className="border-t pt-4">
        <h4 className="font-semibold mb-2">Kunci Jawaban</h4>
        {question.type === 'SINGLE_CHOICE' || question.type === 'TRUE_FALSE' || question.type === 'MULTIPLE_CHOICE' ? (
          <div className="space-y-2">
            {question.options.map((option) => (
              <div
                key={option.id}
                className={`p-2 rounded ${option.isCorrect ? 'bg-success-50 border border-success-300' : 'bg-muted'}`}
              >
                <MathContent text={option.content} />
                {option.isCorrect && <Badge className="ml-2">Benar</Badge>}
              </div>
            ))}
          </div>
        ) : question.type === 'SHORT_ANSWER' ? (
          <div className="p-2 bg-success-50 border border-success-300 rounded">{question.answerKey}</div>
        ) : (
          <p className="text-muted-foreground">Essay perlu dinilai manual</p>
        )}
      </div>

      {(question.explanation || question.explanationImageUrl) && (
        <div className="border-t pt-4">
          <h4 className="font-semibold mb-2">Pembahasan</h4>
          <div className="prose prose-sm max-w-none bg-brand-blue-50 p-4 rounded-lg">
            {question.explanation && <MathContent text={question.explanation} />}
            {question.explanationImageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={question.explanationImageUrl}
                alt="Gambar pembahasan"
                className="mt-2 max-h-80 rounded-md border object-contain"
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}

/** Fase 3e — Pembahasan ujian: drill jenjang/mapel/tipe → pilih ujian →
 *  semua soal + kunci + pembahasan tampil; ada mode presentasi per soal. */
export function PembahasanManager() {
  const catsQ = useContentCategories();
  const levelsQ = useContentLevels();
  const levels = levelsQ.data ?? [];
  const [drill, setDrill] = useDrillState();
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionIndex, setSessionIndex] = useState(0);

  const examsQ = useQuery({
    queryKey: ['exams-for-pembahasan'],
    queryFn: () => apiFetch<Exam[]>('/exams'),
  });

  const questionsQ = useQuery({
    queryKey: ['exam-for-pembahasan', selectedExam?.id],
    queryFn: () => apiFetch<{ items: ExamItem[] }>(`/exams/${selectedExam!.id}/for-pembahasan`),
    enabled: !!selectedExam,
  });

  const examQuestions = questionsQ.data?.items ?? [];
  const sessionItems = examQuestions;

  const handleExamSelect = (exam: Exam) => {
    setSelectedExam(exam);
    setSessionActive(false);
    setSessionIndex(0);
  };

  if (examsQ.isLoading) {
    return <Skeleton className="h-24 w-full" />;
  }
  if (examsQ.isError) {
    return <p className="text-sm text-destructive">{err(examsQ.error, 'Gagal memuat daftar ujian.')}</p>;
  }

  const allExams = examsQ.data ?? [];
  const exams = applyDrill(allExams, drill, levels);

  // Mode presentasi: overlay fullscreen (fixed, menutupi seluruh layar) +
  // Fullscreen API supaya benar-benar layar penuh untuk dibahas di depan kelas.
  if (sessionActive && sessionItems.length > 0) {
    const current = sessionItems[sessionIndex];
    const exitSession = () => {
      setSessionActive(false);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
    return (
      <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-background">
        <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-5 p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h1 className="text-xl font-bold sm:text-2xl">Sesi Pembahasan — {selectedExam?.title}</h1>
              <p className="text-sm text-muted-foreground">
                Soal {sessionIndex + 1} dari {sessionItems.length}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (document.fullscreenElement) {
                    void document.exitFullscreen().catch(() => {});
                  } else {
                    void document.documentElement.requestFullscreen?.().catch(() => {});
                  }
                }}
              >
                <Maximize2 className="size-4" /> Layar Penuh
              </Button>
              <Button variant="outline" size="sm" onClick={exitSession}>
                <X className="size-4" /> Keluar Sesi
              </Button>
            </div>
          </div>

          <Card className="flex-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span>Soal {sessionIndex + 1} ({current.points} poin)</span>
                <Badge variant="outline">{getQuestionTypeLabel(current.question.type)}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="prose prose-sm max-w-none sm:prose-base">
                <MathContent text={current.question.content} />
                {current.question.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={resolveAssetUrl(current.question.imageUrl)} alt="Gambar soal" className="max-h-[50vh] rounded-md border object-contain" />
                )}
              </div>
              <QuestionAnswerKey question={current.question} />
            </CardContent>
          </Card>

          <div className="flex items-center justify-between pb-4">
            <Button
              variant="outline"
              onClick={() => setSessionIndex((prev) => Math.max(0, prev - 1))}
              disabled={sessionIndex === 0}
            >
              ← Sebelumnya
            </Button>
            <Button
              onClick={() => setSessionIndex((prev) => Math.min(sessionItems.length - 1, prev + 1))}
              disabled={sessionIndex === sessionItems.length - 1}
            >
              Selanjutnya →
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Landing drill: pilih Jenjang → Mapel → Tipe dulu (sama seperti Latsol/Ujian).
  if (!selectedExam && !drillDone(drill)) {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pembahasan Ujian</h1>
          <p className="text-sm text-muted-foreground">
            Pilih jenjang → mapel → tipe dulu untuk memfilter daftar ujian.
          </p>
        </div>
        <ContentDrilldown
          items={allExams}
          levels={levels}
          categories={catsQ.data}
          value={drill}
          onChange={setDrill}
          itemNoun="Ujian"
          loading={examsQ.isLoading || levelsQ.isLoading}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!selectedExam ? (
        <div className="space-y-4">
          <div>
            <DrillBreadcrumb items={allExams} levels={levels} value={drill} onChange={setDrill} />
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Pembahasan Ujian</h1>
          </div>
          <div className="grid gap-3">
            {exams.map((exam) => (
              <Card key={exam.id} className="cursor-pointer hover:bg-accent" onClick={() => handleExamSelect(exam)}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <CardTitle className="flex items-center gap-2">{exam.title}</CardTitle>
                      <div className="flex flex-wrap gap-1">
                        {exam.category && (
                          <Badge variant="default">{categoryLabel(exam.category, catsQ.data)}</Badge>
                        )}
                        {exam.level && <Badge variant="secondary">{exam.level.name}</Badge>}
                        {exam.subject && <Badge variant="outline">{exam.subject.name}</Badge>}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Selesai: {new Date(exam.scheduledEndAt).toLocaleString('id-ID')}
                      </div>
                    </div>
                    <Badge variant="outline">{exam._count.attempts} Attempt</Badge>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
          {exams.length === 0 && (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-muted-foreground">Tidak ada ujian pada kategori ini.</p>
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">{selectedExam.title}</h2>
              <p className="text-sm text-muted-foreground">
                {examQuestions.length} soal — kunci &amp; pembahasan tampil semua.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setSelectedExam(null)}>
                Kembali
              </Button>
              {examQuestions.length > 0 && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSessionIndex(0);
                    setSessionActive(true);
                  }}
                >
                  Mode Presentasi ({examQuestions.length} soal)
                </Button>
              )}
            </div>
          </div>

          {questionsQ.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : questionsQ.isError ? (
            <p className="text-sm text-destructive">{err(questionsQ.error, 'Gagal memuat soal ujian.')}</p>
          ) : (
            <div className="space-y-4">
              {examQuestions.map((item, index) => {
                const question = item.question;

                return (
                  <Card key={question.id}>
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base">
                          Soal {index + 1} ({item.points} poin)
                        </CardTitle>
                        <Badge variant="outline">{getQuestionTypeLabel(question.type)}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-0">
                      <div className="prose prose-sm max-w-none">
                        <MathContent text={question.content} />
                        {question.imageUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={resolveAssetUrl(question.imageUrl)} alt="Gambar soal" className="max-h-80 rounded-md border object-contain" />
                        )}
                      </div>
                      <QuestionAnswerKey question={question} />
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
