'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch, ApiError, resolveAssetUrl } from '@/lib/api-client';
import { MathContent } from '@/components/shared/math-content';
import { categoryLabel } from '@/lib/content-taxonomy';
import { useContentCategories } from '@/components/shared/content-drilldown';

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

/** Fase 3e — Tutor memilih subset soal dari 1 exam untuk sesi pembahasan bersama. */
export function PembahasanManager() {
  const catsQ = useContentCategories();
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<string>>(new Set());
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

  const handleExamSelect = (exam: Exam) => {
    setSelectedExam(exam);
    setSelectedQuestionIds(new Set());
    setSessionActive(false);
    setSessionIndex(0);
  };

  const handleQuestionToggle = (questionId: string) => {
    const newSelected = new Set(selectedQuestionIds);
    if (newSelected.has(questionId)) newSelected.delete(questionId);
    else newSelected.add(questionId);
    setSelectedQuestionIds(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedQuestionIds.size === examQuestions.length) {
      setSelectedQuestionIds(new Set());
    } else {
      setSelectedQuestionIds(new Set(examQuestions.map((item) => item.questionId)));
    }
  };

  const sessionItems = examQuestions.filter((item) => selectedQuestionIds.has(item.questionId));

  if (examsQ.isLoading) {
    return <Skeleton className="h-24 w-full" />;
  }
  if (examsQ.isError) {
    return <p className="text-sm text-destructive">{err(examsQ.error, 'Gagal memuat daftar ujian.')}</p>;
  }

  const exams = examsQ.data ?? [];

  // Mode sesi: tampilkan hanya soal terpilih, 1 per halaman, untuk dibahas bersama di depan kelas.
  if (sessionActive && sessionItems.length > 0) {
    const current = sessionItems[sessionIndex];
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold">Sesi Pembahasan — {selectedExam?.title}</h1>
            <p className="text-sm text-muted-foreground">
              Soal {sessionIndex + 1} dari {sessionItems.length}
            </p>
          </div>
          <Button variant="outline" onClick={() => setSessionActive(false)}>
            Keluar Sesi
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span>Soal {sessionIndex + 1} ({current.points} poin)</span>
              <Badge variant="outline">{getQuestionTypeLabel(current.question.type)}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="prose prose-sm max-w-none">
              <MathContent text={current.question.content} />
              {current.question.imageUrl && (
                <img src={resolveAssetUrl(current.question.imageUrl)} alt="Gambar soal" className="max-w-full h-auto" />
              )}
            </div>
            <QuestionAnswerKey question={current.question} />
          </CardContent>
        </Card>

        <div className="flex items-center justify-between">
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
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Pembahasan Ujian</h1>

      {!selectedExam ? (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Pilih Ujian untuk Pembahasan</h2>
          <div className="grid gap-4">
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
                <p className="text-center text-muted-foreground">Tidak ada ujian yang tersedia.</p>
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">{selectedExam.title}</h2>
              <p className="text-sm text-muted-foreground">
                {examQuestions.length} soal • {selectedQuestionIds.size} dipilih
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setSelectedExam(null)}>
                Kembali
              </Button>
              <Button variant="outline" onClick={handleSelectAll}>
                {selectedQuestionIds.size === examQuestions.length ? 'Batal Pilih Semua' : 'Pilih Semua'}
              </Button>
              {selectedQuestionIds.size > 0 && (
                <Button
                  onClick={() => {
                    setSessionIndex(0);
                    setSessionActive(true);
                  }}
                >
                  Mulai Pembahasan ({selectedQuestionIds.size} soal)
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
                const isSelected = selectedQuestionIds.has(question.id);

                return (
                  <Card key={question.id} className={isSelected ? 'border-primary' : ''}>
                    <CardHeader>
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => handleQuestionToggle(question.id)}
                        />
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            <Label htmlFor={`q-${question.id}`} className="cursor-pointer">
                              Soal {index + 1} ({item.points} poin)
                            </Label>
                            <Badge variant="outline">{getQuestionTypeLabel(question.type)}</Badge>
                          </div>
                          <div className="prose prose-sm max-w-none">
                            <MathContent text={question.content} />
                            {question.imageUrl && (
                              <img src={resolveAssetUrl(question.imageUrl)} alt="Gambar soal" className="max-w-full h-auto" />
                            )}
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    {isSelected && (
                      <CardContent className="space-y-4 pt-0">
                        <QuestionAnswerKey question={question} />
                      </CardContent>
                    )}
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
