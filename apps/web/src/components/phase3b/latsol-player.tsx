"use client";
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch, ApiError, resolveAssetUrl } from '@/lib/api-client';
import type { LatsolQuestionPlay, LatsolFeedback, LatsolAttemptDetail, LatsolAttemptItem } from '@/lib/phase3b-types';
import { MathContent } from '@/components/shared/math-content';

function err(e: unknown, fb: string) {
  return e instanceof ApiError ? e.message : fb;
}

interface PackagePlayData {
  id: string;
  title: string;
  description: string | null;
  items: Array<{
    id: string;
    sortOrder: number;
    question: LatsolQuestionPlay;
  }>;
}

/** Fase 3b — Siswa mengerjakan latsol dengan feedback instan per soal. */
export function LatsolPlayer({ packageId, onBack }: { packageId: string; onBack: () => void }) {
  const qc = useQueryClient();
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, { selectedOptionIds: string[]; textAnswer: string }>>({});
  const [feedbackMap, setFeedbackMap] = useState<Record<string, LatsolFeedback>>({});
  const [showFeedback, setShowFeedback] = useState<Record<string, boolean>>({});

  const packageQ = useQuery({
    queryKey: ['latsol-package-play', packageId],
    queryFn: () => apiFetch<PackagePlayData>(`/latsol/packages/${packageId}/play`),
    enabled: !!packageId,
  });

  const attemptsQ = useQuery({
    queryKey: ['latsol-attempts-mine', packageId],
    queryFn: () => apiFetch<LatsolAttemptItem[]>('/latsol/attempts/mine'),
    enabled: !!packageId,
  });

  const startM = useMutation({
    mutationFn: () =>
      apiFetch<{ id: string; package: { id: string; title: string } }>(`/latsol/packages/${packageId}/start`, {
        method: 'POST',
      }),
    onSuccess: (data) => {
      setAttemptId(data.id);
      toast.success('Paket latsol dimulai!');
    },
    onError: (e) => toast.error(err(e, 'Gagal memulai paket latsol.')),
  });

  const saveAnswerM = useMutation({
    mutationFn: (questionId: string) =>
      apiFetch<LatsolFeedback>(`/latsol/attempts/${attemptId}/answers/${questionId}`, {
        method: 'POST',
        body: answers[questionId] || { selectedOptionIds: [], textAnswer: '' },
      }),
    onSuccess: (data, questionId) => {
      setFeedbackMap((prev) => ({ ...prev, [questionId]: data }));
      setShowFeedback((prev) => ({ ...prev, [questionId]: true }));
      toast.success('Jawaban disimpan!');
    },
    onError: (e) => toast.error(err(e, 'Gagal menyimpan jawaban.')),
  });

  const submitM = useMutation({
    mutationFn: () =>
      apiFetch<LatsolAttemptDetail>(`/latsol/attempts/${attemptId}/submit`, {
        method: 'POST',
        body: { answers: Object.entries(answers).map(([questionId, a]) => ({ questionId, ...a })) },
      }),
    onSuccess: (data) => {
      toast.success(`Paket selesai! Skor: ${data.score}/${data.maxScore}`);
      qc.invalidateQueries({ queryKey: ['latsol-attempts-mine'] });
      onBack();
    },
    onError: (e) => toast.error(err(e, 'Gagal mengumpulkan paket.')),
  });

  const handleStart = () => {
    startM.mutate();
  };

  const handleAnswerChange = (questionId: string, field: 'selectedOptionIds' | 'textAnswer', value: string[] | string) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: {
        ...prev[questionId],
        [field]: value,
      },
    }));
  };

  const handleSubmitAnswer = (questionId: string) => {
    if (!attemptId) return;
    saveAnswerM.mutate(questionId);
  };

  const handleSubmitAll = () => {
    if (!attemptId) return;
    submitM.mutate();
  };

  if (packageQ.isLoading) return <Skeleton className="h-64 w-full" />;
  if (packageQ.isError) return <p className="text-sm text-destructive">Gagal memuat paket latsol.</p>;

  const pkg = packageQ.data;
  if (!pkg) return null;

  const currentQuestion = pkg.items[currentIndex];
  const currentAnswer = answers[currentQuestion?.id] || { selectedOptionIds: [], textAnswer: '' };
  const currentFeedback = feedbackMap[currentQuestion?.id];
  const isShowingFeedback = showFeedback[currentQuestion?.id];

  const progress = pkg.items.length > 0 ? ((currentIndex + 1) / pkg.items.length) * 100 : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{pkg.title}</h1>
          {pkg.description && <p className="text-sm text-muted-foreground">{pkg.description}</p>}
        </div>
        <Button variant="outline" onClick={onBack}>Kembali</Button>
      </div>

      {!attemptId ? (
        <Card>
          <CardHeader>
            <CardTitle>Mulai Latihan</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Paket ini berisi {pkg.items.length} soal. Kerjakan kapan saja dan dapatkan feedback instan setelah menjawab.
            </p>
            {attemptsQ.data && attemptsQ.data.length > 0 && (
              <div className="text-sm">
                <p className="text-muted-foreground">Attempt sebelumnya:</p>
                {attemptsQ.data.slice(0, 3).map((att) => (
                  <div key={att.id} className="flex items-center gap-2 mt-1">
                    <Badge variant="outline">{att.status}</Badge>
                    <span className="text-muted-foreground">
                      {att.score}/{att.maxScore} — {new Date(att.startedAt).toLocaleDateString('id-ID')}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <Button onClick={handleStart} disabled={startM.isPending} className="w-fit">
              {startM.isPending ? 'Memulai...' : 'Mulai Sekarang'}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
            <span className="text-sm text-muted-foreground">
              {currentIndex + 1} / {pkg.items.length}
            </span>
          </div>

          {currentQuestion && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2">
                  <span>Soal {currentIndex + 1}</span>
                  <Badge variant="outline">{currentQuestion.question.type}</Badge>
                  {currentQuestion.question.points && (
                    <Badge variant="secondary">{currentQuestion.question.points} poin</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {currentQuestion.question.imageUrl && (
                  <img
                    src={resolveAssetUrl(currentQuestion.question.imageUrl)}
                    alt="Gambar soal"
                    className="max-h-64 w-auto rounded-lg border object-contain"
                  />
                )}
                <p className="text-base"><MathContent text={currentQuestion.question.content} /></p>

                {(currentQuestion.question.type === 'SINGLE_CHOICE' ||
                  currentQuestion.question.type === 'TRUE_FALSE') && (
                  <RadioGroup
                    value={currentAnswer.selectedOptionIds[0] || ''}
                    onValueChange={(value) =>
                      handleAnswerChange(currentQuestion.id, 'selectedOptionIds', [value])
                    }
                    disabled={isShowingFeedback}
                  >
                    {currentQuestion.question.options.map((opt) => (
                      <div key={opt.id} className="flex items-center space-x-2">
                        <RadioGroupItem value={opt.id} id={`opt-${opt.id}`} />
                        <Label htmlFor={`opt-${opt.id}`} className="flex flex-1 cursor-pointer items-center gap-2">
                          {opt.imageUrl && (
                            <img src={resolveAssetUrl(opt.imageUrl)} alt="Gambar opsi" className="max-h-20 w-auto rounded border object-contain" />
                          )}
                          <MathContent text={opt.content} />
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                )}

                {currentQuestion.question.type === 'MULTIPLE_CHOICE' && (
                  <div className="flex flex-col gap-2">
                    {currentQuestion.question.options.map((opt) => (
                      <div key={opt.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`opt-${opt.id}`}
                          checked={currentAnswer.selectedOptionIds.includes(opt.id)}
                          onCheckedChange={(checked) => {
                            const isChecked = checked === true;
                            const newIds = isChecked
                              ? [...currentAnswer.selectedOptionIds, opt.id]
                              : currentAnswer.selectedOptionIds.filter((id) => id !== opt.id);
                            handleAnswerChange(currentQuestion.id, 'selectedOptionIds', newIds);
                          }}
                          disabled={isShowingFeedback}
                        />
                        <Label htmlFor={`opt-${opt.id}`} className="flex flex-1 cursor-pointer items-center gap-2">
                          {opt.imageUrl && (
                            <img src={resolveAssetUrl(opt.imageUrl)} alt="Gambar opsi" className="max-h-20 w-auto rounded border object-contain" />
                          )}
                          <MathContent text={opt.content} />
                        </Label>
                      </div>
                    ))}
                  </div>
                )}

                {(currentQuestion.question.type === 'SHORT_ANSWER' ||
                  currentQuestion.question.type === 'ESSAY') && (
                  <Textarea
                    value={currentAnswer.textAnswer || ''}
                    onChange={(e) =>
                      handleAnswerChange(currentQuestion.id, 'textAnswer', e.target.value)
                    }
                    placeholder="Ketik jawaban Anda..."
                    disabled={isShowingFeedback}
                    className="min-h-[100px]"
                  />
                )}

                {!isShowingFeedback ? (
                  <Button
                    onClick={() => handleSubmitAnswer(currentQuestion.id)}
                    disabled={saveAnswerM.isPending}
                    className="w-fit"
                  >
                    {saveAnswerM.isPending ? 'Memproses...' : 'Cek Jawaban'}
                  </Button>
                ) : currentFeedback && (
                  <div className="flex flex-col gap-3 p-4 bg-muted rounded-lg">
                    <div className="flex items-center gap-2">
                      <Badge variant={currentFeedback.isCorrect ? 'default' : 'destructive'}>
                        {currentFeedback.isCorrect === null
                          ? 'Perlu penilaian manual'
                          : currentFeedback.isCorrect
                          ? 'Benar'
                          : 'Salah'}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        Skor: {currentFeedback.score}/{currentFeedback.maxScore}
                      </span>
                    </div>

                    {(currentFeedback.question.explanation || currentFeedback.question.explanationImageUrl) && (
                      <div className="text-sm">
                        <p className="font-medium mb-1">Pembahasan:</p>
                        {currentFeedback.question.explanation && (
                          <p className="text-muted-foreground">
                            <MathContent text={currentFeedback.question.explanation} />
                          </p>
                        )}
                        {currentFeedback.question.explanationImageUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={currentFeedback.question.explanationImageUrl}
                            alt="Gambar pembahasan"
                            className="mt-2 max-h-64 rounded-md border object-contain"
                          />
                        )}
                      </div>
                    )}

                    {currentFeedback.question.answerKey && (
                      <div className="text-sm">
                        <p className="font-medium mb-1">Kunci Jawaban:</p>
                        <p className="text-muted-foreground">{currentFeedback.question.answerKey}</p>
                      </div>
                    )}

                    {currentFeedback.question.correctOptionIds.length > 0 && (
                      <div className="text-sm">
                        <p className="font-medium mb-1">Jawaban Benar:</p>
                        <div className="flex flex-col gap-1">
                          {currentFeedback.question.options
                            .filter((opt) => currentFeedback.question.correctOptionIds.includes(opt.id))
                            .map((opt) => (
                              <p key={opt.id} className="flex items-center gap-2 text-muted-foreground">
                                ✓
                                {opt.imageUrl && (
                                  <img src={resolveAssetUrl(opt.imageUrl)} alt="Gambar opsi" className="max-h-16 w-auto rounded border object-contain" />
                                )}
                                <MathContent text={opt.content} />
                              </p>
                            ))}
                        </div>
                      </div>
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowFeedback((prev) => ({ ...prev, [currentQuestion.id]: false }));
                      }}
                    >
                      Tutup Feedback
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
              disabled={currentIndex === 0}
            >
              Sebelumnya
            </Button>
            <Button
              onClick={() => setCurrentIndex((prev) => Math.min(pkg.items.length - 1, prev + 1))}
              disabled={currentIndex === pkg.items.length - 1}
            >
              Selanjutnya
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Selesai Paket</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Setelah selesai semua soal, kumpulkan paket untuk melihat skor akhir.
              </p>
              <Button
                onClick={handleSubmitAll}
                disabled={submitM.isPending}
                variant="default"
                className="w-fit"
              >
                {submitM.isPending ? 'Mengumpulkan...' : 'Kumpulkan Paket'}
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
