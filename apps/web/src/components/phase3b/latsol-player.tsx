"use client";
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, ChevronLeft, ChevronRight, LayoutGrid } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch, ApiError, resolveAssetUrl } from '@/lib/api-client';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import type { LatsolQuestionPlay, LatsolFeedback, LatsolAttemptDetail, LatsolAttemptItem } from '@/lib/phase3b-types';
import { MathContent } from '@/components/shared/math-content';
import { QuestionNumberMap, NumberMapLegend } from '@/components/shared/question-number-map';
import type { NumberMapState } from '@/components/shared/question-number-map';

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

type LocalAnswer = { selectedOptionIds: string[]; textAnswer: string };

/**
 * Fase 3b — Siswa mengerjakan latsol: 1 soal per halaman, jawaban tersimpan
 * per soal dan bisa dilanjutkan kapan saja. Salah → solusi tampil di bawah
 * soal (fallback: tanyakan pada tutor). Tanpa timer/proctoring.
 */
export function LatsolPlayer({ packageId, onBack }: { packageId: string; onBack: () => void }) {
  const qc = useQueryClient();
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [numPadOpen, setNumPadOpen] = useState(false);
  const [answers, setAnswers] = useState<Record<string, LocalAnswer>>({});
  const [feedbackMap, setFeedbackMap] = useState<Record<string, LatsolFeedback>>({});
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);

  const packageQ = useQuery({
    queryKey: ['latsol-package-play', packageId],
    queryFn: () => apiFetch<PackagePlayData>(`/latsol/packages/${packageId}/play`),
    enabled: !!packageId,
  });

  const attemptsQ = useQuery({
    queryKey: ['latsol-attempts-mine', packageId],
    queryFn: () => apiFetch<LatsolAttemptItem[]>(`/latsol/attempts/mine?packageId=${packageId}`),
    enabled: !!packageId,
  });

  // Attempt yang sedang berjalan → dilanjutkan (bukan dibuat ulang).
  const resumable = attemptsQ.data?.find((a) => a.status === 'IN_PROGRESS') ?? null;

  const detailQ = useQuery({
    queryKey: ['latsol-attempt', attemptId],
    queryFn: () => apiFetch<LatsolAttemptDetail>(`/latsol/attempts/${attemptId}`),
    enabled: !!attemptId,
  });

  // Pulihkan jawaban + feedback saat attempt dilanjutkan, lalu lompat ke
  // soal pertama yang belum dijawab.
  useEffect(() => {
    const detail = detailQ.data;
    if (!detail) return;
    setFeedbackMap(() => {
      const next: Record<string, LatsolFeedback> = {};
      for (const it of detail.items) {
        if (it.answered) next[it.questionId] = it.answer;
      }
      return next;
    });
    setAnswers(() => {
      const next: Record<string, LocalAnswer> = {};
      for (const it of detail.items) {
        if (it.answered) {
          next[it.questionId] = {
            selectedOptionIds: it.answer.selectedOptionIds ?? [],
            textAnswer: it.answer.textAnswer ?? '',
          };
        }
      }
      return next;
    });
    const firstOpen = detail.items.findIndex((it) => !it.answered);
    setCurrentIndex(firstOpen === -1 ? Math.max(0, detail.items.length - 1) : firstOpen);
  }, [detailQ.data]);

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
      qc.invalidateQueries({ queryKey: ['latsol-attempt', attemptId] });
    },
    onError: (e) => toast.error(err(e, 'Gagal menyimpan jawaban.')),
  });

  const submitM = useMutation({
    mutationFn: () =>
      apiFetch<LatsolAttemptDetail>(`/latsol/attempts/${attemptId}/submit`, {
        method: 'POST',
        // Jawaban sudah tersimpan per soal — submit cukup finalisasi.
        body: { answers: [] },
      }),
    onSuccess: (data) => {
      setSubmitConfirmOpen(false);
      toast.success(`Paket selesai! Skor: ${data.score}/${data.maxScore}`);
      qc.invalidateQueries({ queryKey: ['latsol-attempts-mine'] });
      onBack();
    },
    onError: (e) => {
      setSubmitConfirmOpen(false);
      toast.error(err(e, 'Gagal mengumpulkan paket.'));
    },
  });

  const handleAnswerChange = (questionId: string, field: 'selectedOptionIds' | 'textAnswer', value: string[] | string) => {
    setAnswers((prev) => {
      const cur = prev[questionId] || { selectedOptionIds: [], textAnswer: '' };
      return { ...prev, [questionId]: { ...cur, [field]: value } };
    });
  };

  if (packageQ.isLoading) return <Skeleton className="h-64 w-full" />;
  if (packageQ.isError) return <p className="text-sm text-destructive">Gagal memuat paket latsol.</p>;

  const pkg = packageQ.data;
  if (!pkg) return null;

  const items = pkg.items;
  const current = items[currentIndex];
  const qid = current?.question.id;
  const currentAnswer: LocalAnswer = (qid && answers[qid]) || { selectedOptionIds: [], textAnswer: '' };
  const feedback = qid ? feedbackMap[qid] : undefined;
  const checked = !!feedback;
  const correctCount = items.filter((it) => feedbackMap[it.question.id]?.isCorrect === true).length;
  const checkedCount = items.filter((it) => feedbackMap[it.question.id]).length;

  const numStates: NumberMapState[] = items.map((it) => {
    const fb = feedbackMap[it.question.id];
    if (!fb) return 'idle';
    return fb.isCorrect === true ? 'correct' : 'wrong';
  });

  const jumpTo = (index: number) => {
    setCurrentIndex(Math.max(0, Math.min(index, items.length - 1)));
    setNumPadOpen(false);
  };

  /** Belum ada attempt aktif → layar mulai/lanjut. */
  if (!attemptId) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{pkg.title}</h1>
            {pkg.description && <p className="text-sm text-muted-foreground">{pkg.description}</p>}
          </div>
          <Button variant="outline" onClick={onBack}>Kembali</Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{resumable ? 'Lanjutkan Latihan' : 'Mulai Latihan'}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Paket ini berisi {items.length} soal. Jawaban tersimpan otomatis per soal — Anda bisa
              berhenti kapan saja dan melanjutkan nanti.
            </p>
            {resumable && (
              <p className="text-sm font-medium text-primary">
                Ada latihan yang belum selesai ({resumable._count.answers} soal terjawab) — lanjutkan
                dari soal terakhir.
              </p>
            )}
            {attemptsQ.data && attemptsQ.data.filter((a) => a.status !== 'IN_PROGRESS').length > 0 && (
              <div className="text-sm">
                <p className="text-muted-foreground">Riwayat sebelumnya:</p>
                {attemptsQ.data
                  .filter((a) => a.status !== 'IN_PROGRESS')
                  .slice(0, 3)
                  .map((att) => (
                    <div key={att.id} className="flex items-center gap-2 mt-1">
                      <Badge variant="outline">{att.status === 'SUBMITTED' ? 'Selesai' : att.status}</Badge>
                      <span className="text-muted-foreground">
                        {att.score}/{att.maxScore} — {new Date(att.startedAt).toLocaleDateString('id-ID')}
                      </span>
                    </div>
                  ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {resumable && (
                <Button onClick={() => setAttemptId(resumable.id)}>
                  Lanjutkan ({resumable._count.answers} terjawab)
                </Button>
              )}
              <Button
                variant={resumable ? 'outline' : 'default'}
                onClick={() => startM.mutate()}
                disabled={startM.isPending}
              >
                {startM.isPending ? 'Memulai...' : resumable ? 'Mulai Ulang dari Awal' : 'Mulai Sekarang'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const questionBlock = current ? (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 text-lg">
          <span>
            Soal {currentIndex + 1}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              dari {items.length}
              {current.question.points ? ` · ${current.question.points} poin` : ''}
            </span>
          </span>
          {feedback && (
            <Badge variant={feedback.isCorrect === true ? 'default' : 'destructive'}>
              {feedback.isCorrect === null
                ? 'Menunggu penilaian'
                : feedback.isCorrect
                  ? 'Benar'
                  : 'Salah'}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {current.question.imageUrl && (
          <img
            src={resolveAssetUrl(current.question.imageUrl)}
            alt="Gambar soal"
            className="max-h-64 w-auto rounded-lg border object-contain"
          />
        )}
        <div className="text-base"><MathContent text={current.question.content} /></div>

        {(current.question.type === 'SINGLE_CHOICE' || current.question.type === 'TRUE_FALSE') && (
          <RadioGroup
            value={currentAnswer.selectedOptionIds[0] || ''}
            onValueChange={(value) => handleAnswerChange(qid!, 'selectedOptionIds', [value])}
            disabled={checked}
            className="gap-3"
          >
            {current.question.options.map((opt) => (
              <div key={opt.id} className="flex items-start gap-3 rounded-lg border border-border p-3">
                <RadioGroupItem value={opt.id} id={`opt-${opt.id}`} className="mt-0.5" />
                <Label htmlFor={`opt-${opt.id}`} className="flex flex-1 cursor-pointer items-start gap-2 font-normal">
                  {opt.imageUrl && (
                    <img src={resolveAssetUrl(opt.imageUrl)} alt="Gambar opsi" className="max-h-20 w-auto rounded border object-contain" />
                  )}
                  <MathContent text={opt.content} />
                </Label>
              </div>
            ))}
          </RadioGroup>
        )}

        {current.question.type === 'MULTIPLE_CHOICE' && (
          <div className="flex flex-col gap-3">
            {current.question.options.map((opt) => (
              <div key={opt.id} className="flex items-start gap-3 rounded-lg border border-border p-3">
                <Checkbox
                  id={`opt-${opt.id}`}
                  className="mt-0.5"
                  checked={currentAnswer.selectedOptionIds.includes(opt.id)}
                  onCheckedChange={(isChecked) => {
                    const newIds =
                      isChecked === true
                        ? [...currentAnswer.selectedOptionIds, opt.id]
                        : currentAnswer.selectedOptionIds.filter((id) => id !== opt.id);
                    handleAnswerChange(qid!, 'selectedOptionIds', newIds);
                  }}
                  disabled={checked}
                />
                <Label htmlFor={`opt-${opt.id}`} className="flex flex-1 cursor-pointer items-start gap-2 font-normal">
                  {opt.imageUrl && (
                    <img src={resolveAssetUrl(opt.imageUrl)} alt="Gambar opsi" className="max-h-20 w-auto rounded border object-contain" />
                  )}
                  <MathContent text={opt.content} />
                </Label>
              </div>
            ))}
          </div>
        )}

        {(current.question.type === 'SHORT_ANSWER' || current.question.type === 'ESSAY') && (
          <Textarea
            value={currentAnswer.textAnswer || ''}
            onChange={(e) => handleAnswerChange(qid!, 'textAnswer', e.target.value)}
            placeholder="Ketik jawaban Anda..."
            disabled={checked}
            className="min-h-[100px]"
          />
        )}

        {!checked ? (
          <Button
            onClick={() => qid && saveAnswerM.mutate(qid)}
            disabled={saveAnswerM.isPending}
            className="w-fit"
          >
            {saveAnswerM.isPending ? 'Memproses...' : 'Cek Jawaban'}
          </Button>
        ) : (
          feedback && (
            <div className="flex flex-col gap-3 rounded-lg bg-muted p-4">
              <div className="flex items-center gap-2">
                <Badge variant={feedback.isCorrect ? 'default' : 'destructive'}>
                  {feedback.isCorrect === null
                    ? 'Menunggu penilaian tutor'
                    : feedback.isCorrect
                      ? 'Benar'
                      : 'Salah'}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  Skor: {feedback.score}/{feedback.maxScore}
                </span>
              </div>

              {/* Solusi tampil di bawah soal saat jawaban salah/belum dinilai. */}
              {feedback.isCorrect !== true && (
                <div className="text-sm">
                  <p className="mb-1 font-medium">Solusi:</p>
                  {feedback.question.explanation || feedback.question.explanationImageUrl ? (
                    <>
                      {feedback.question.explanation && (
                        <p className="text-muted-foreground">
                          <MathContent text={feedback.question.explanation} />
                        </p>
                      )}
                      {feedback.question.explanationImageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={feedback.question.explanationImageUrl}
                          alt="Gambar pembahasan"
                          className="mt-2 max-h-64 rounded-md border object-contain"
                        />
                      )}
                    </>
                  ) : (
                    <p className="text-muted-foreground italic">
                      Solusi belum tersedia — silakan tanyakan pada tutor.
                    </p>
                  )}
                  {feedback.question.answerKey && (
                    <p className="mt-2 text-muted-foreground">
                      <span className="font-medium text-foreground">Kunci jawaban: </span>
                      {feedback.question.answerKey}
                    </p>
                  )}
                  {feedback.question.correctOptionIds.length > 0 && (
                    <div className="mt-2 flex flex-col gap-1">
                      {feedback.question.options
                        .filter((opt) => feedback.question.correctOptionIds.includes(opt.id))
                        .map((opt) => (
                          <p key={opt.id} className="flex items-center gap-2 text-muted-foreground">
                            ✓ <MathContent text={opt.content} />
                          </p>
                        ))}
                    </div>
                  )}
                </div>
              )}

              <Button
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={() =>
                  setFeedbackMap((prev) => {
                    const next = { ...prev };
                    delete next[qid!];
                    return next;
                  })
                }
              >
                Ubah Jawaban
              </Button>
            </div>
          )
        )}
      </CardContent>
    </Card>
  ) : null;

  const prevNext = (
    <div className="flex items-center justify-between gap-2">
      <Button variant="outline" onClick={() => jumpTo(currentIndex - 1)} disabled={currentIndex === 0}>
        <ChevronLeft /> Sebelumnya
      </Button>
      {currentIndex === items.length - 1 ? (
        <Button onClick={() => setSubmitConfirmOpen(true)} disabled={submitM.isPending}>
          Kumpulkan Paket
        </Button>
      ) : (
        <Button onClick={() => jumpTo(currentIndex + 1)}>
          Selanjutnya <ChevronRight />
        </Button>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-4 pb-20 lg:pb-0">
      {/* Top bar */}
      <div className="sticky top-0 z-30 -mx-1 border-b bg-background/95 px-1 py-2.5 backdrop-blur">
        <div className="flex items-center gap-3">
          <Button
            size="icon"
            variant="ghost"
            className="size-8 shrink-0"
            aria-label="Kembali ke daftar paket"
            onClick={onBack}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{detailQ.data?.package.title ?? pkg.title}</p>
            <p className="text-xs text-muted-foreground">
              {checkedCount}/{items.length} dicek · {correctCount} benar · tersimpan otomatis
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setSubmitConfirmOpen(true)} className="shrink-0">
            Kumpulkan
          </Button>
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_260px] lg:items-start lg:gap-6">
        <div className="flex flex-col gap-4">
          {questionBlock}
          <div className="hidden lg:block">{prevNext}</div>
        </div>

        <aside className="sticky top-16 hidden flex-col gap-3 lg:flex">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Navigasi Soal</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <QuestionNumberMap
                count={items.length}
                current={currentIndex}
                states={numStates}
                onJump={jumpTo}
              />
              <NumberMapLegend
                items={[
                  { state: 'correct', label: 'Benar' },
                  { state: 'wrong', label: 'Salah/belum' },
                  { state: 'idle', label: 'Kosong' },
                ]}
              />
              <Button size="sm" onClick={() => setSubmitConfirmOpen(true)} disabled={submitM.isPending}>
                Kumpulkan Paket
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>

      {/* Bottom bar mobile: prev | nomor | next */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {numPadOpen && (
          <div className="max-h-[50svh] overflow-y-auto border-b p-4">
            <QuestionNumberMap
              count={items.length}
              current={currentIndex}
              states={numStates}
              onJump={jumpTo}
              columns={6}
            />
          </div>
        )}
        <div className="grid grid-cols-3">
          <button
            type="button"
            onClick={() => jumpTo(currentIndex - 1)}
            disabled={currentIndex === 0}
            className="flex min-h-14 items-center justify-center gap-1 text-sm font-medium disabled:opacity-40"
          >
            <ChevronLeft className="size-5" /> Sebelumnya
          </button>
          <button
            type="button"
            onClick={() => setNumPadOpen((v) => !v)}
            className="flex min-h-14 items-center justify-center gap-1.5 text-sm font-medium text-primary"
            aria-expanded={numPadOpen}
          >
            <LayoutGrid className="size-5" /> Soal {currentIndex + 1}
          </button>
          <button
            type="button"
            onClick={() =>
              currentIndex === items.length - 1 ? setSubmitConfirmOpen(true) : jumpTo(currentIndex + 1)
            }
            className="flex min-h-14 items-center justify-center gap-1 text-sm font-medium"
          >
            {currentIndex === items.length - 1 ? 'Kumpulkan' : 'Selanjutnya'}{' '}
            <ChevronRight className="size-5" />
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={submitConfirmOpen}
        onOpenChange={setSubmitConfirmOpen}
        tone="primary"
        title="Kumpulkan paket latsol?"
        description={`${checkedCount} dari ${items.length} soal sudah dicek. Soal yang belum dicek tetap tersimpan jawabannya dan dinilai apa adanya.`}
        confirmLabel="Ya, kumpulkan"
        pending={submitM.isPending}
        onConfirm={() => submitM.mutate()}
      />
    </div>
  );
}
