'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch, ApiError, resolveAssetUrl } from '@/lib/api-client';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { MathContent } from '@/components/shared/math-content';
import {
  ExamAttemptDetail,
  ExamAttemptStatus,
  SaveExamAnswerDto,
  ProctoringViolationType,
  ReportViolationResult,
} from '@/lib/phase3c-types';

function err(e: unknown, fb: string) {
  return e instanceof ApiError ? e.message : fb;
}

interface ExamTakerProps {
  /** Attempt yang sedang/telah dikerjakan siswa (dibuat lewat POST /exam-attempts/start dari ExamListStudent). */
  attemptId: string;
}

function attemptQueryKey(attemptId: string) {
  return ['exam-attempt', attemptId] as const;
}

const VIOLATION_LABEL: Record<ProctoringViolationType, string> = {
  [ProctoringViolationType.FULLSCREEN_EXIT]: 'keluar dari mode layar penuh',
  [ProctoringViolationType.VISIBILITY_CHANGE]: 'meninggalkan tab/jendela ujian',
  [ProctoringViolationType.BLUR]: 'berpindah fokus dari jendela ujian',
  [ProctoringViolationType.TAB_LEAVE]: 'meninggalkan tab ujian',
};

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Fase 3d — Proctoring realistis di sisi client.
 * Browser tidak bisa "dipaksa" tetap fullscreen/fokus, jadi kontrol yang
 * realistis adalah: minta fullscreen (butuh gesture user), lalu deteksi
 * kalau siswa keluar fullscreen / pindah tab / kehilangan fokus, dan
 * laporkan tiap kejadian ke server (server yang menegakkan threshold & lock).
 */
function useExamProctoring(params: {
  attemptId: string | null;
  active: boolean;
  onViolation: (result: ReportViolationResult, type: ProctoringViolationType) => void;
}) {
  const { attemptId, active, onViolation } = params;
  const [isFullscreen, setIsFullscreen] = useState(false);
  const cooldownUntilRef = useRef(0);

  const reportViolation = useCallback(
    async (violationType: ProctoringViolationType) => {
      if (!attemptId || !active) return;
      const now = Date.now();
      // Cegah spam laporan ganda (blur + visibilitychange sering terjadi bersamaan).
      if (now < cooldownUntilRef.current) return;
      cooldownUntilRef.current = now + 2500;
      try {
        const result = await apiFetch<ReportViolationResult>(
          `/exam-attempts/${attemptId}/violation`,
          { method: 'POST', body: { violationType } },
        );
        onViolation(result, violationType);
      } catch {
        // Best-effort: kegagalan lapor tidak boleh mengganggu siswa mengerjakan soal.
      }
    },
    [attemptId, active, onViolation],
  );

  useEffect(() => {
    if (!active) return;

    const handleVisibility = () => {
      if (document.hidden) reportViolation(ProctoringViolationType.VISIBILITY_CHANGE);
    };
    const handleBlur = () => reportViolation(ProctoringViolationType.BLUR);
    const handleFullscreenChange = () => {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);
      if (!fs) reportViolation(ProctoringViolationType.FULLSCREEN_EXIT);
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [active, reportViolation]);

  const requestFullscreen = useCallback(async () => {
    try {
      await document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } catch {
      // Beberapa browser/mode (mis. iframe tanpa allow) menolak fullscreen — abaikan, deteksi lain tetap jalan.
    }
  }, []);

  return { isFullscreen, requestFullscreen };
}

export function ExamTaker({ attemptId }: ExamTakerProps) {
  const qc = useQueryClient();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const [answers, setAnswers] = useState<Record<string, SaveExamAnswerDto>>({});
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [lastViolationMessage, setLastViolationMessage] = useState<string | null>(null);

  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const retryCounts = useRef<Record<string, number>>({});
  const timeUpHandledRef = useRef(false);

  // Source of truth = react-query cache. Polling otomatis saat status LOCKED
  // (mendeteksi unlock oleh pengawas tanpa siswa harus refresh manual).
  const attemptQ = useQuery({
    queryKey: attemptQueryKey(attemptId),
    queryFn: () => apiFetch<ExamAttemptDetail>(`/exam-attempts/${attemptId}`),
    enabled: !!attemptId,
    refetchInterval: (query) => (query.state.data?.status === 'LOCKED' ? 15000 : false),
  });
  const attempt = attemptQ.data ?? null;

  // Pulihkan jawaban yang sudah tersimpan di server saat halaman di-refresh /
  // attempt dilanjutkan — state lokal menang bila sudah ada isian baru.
  useEffect(() => {
    const items = attemptQ.data?.items;
    if (!items?.length) return;
    setAnswers((prev) => {
      const next = { ...prev };
      for (const it of items) {
        if (it.answer && !(it.questionId in next)) {
          next[it.questionId] = {
            selectedOptionIds: it.answer.selectedOptionIds ?? [],
            textAnswer: it.answer.textAnswer ?? undefined,
          };
        }
      }
      return next;
    });
  }, [attemptQ.data]);

  // Timer sisi klien: hanya menampilkan hitung mundur berdasarkan `now` yang di-tick
  // tiap detik. Waktu yang otoritatif tetap server (scheduled_end_at + auto-submit scheduler);
  // client tidak pernah memutuskan sendiri "waktu habis", hanya menampilkan & memicu refresh.
  useEffect(() => {
    if (!attempt || attempt.status !== 'IN_PROGRESS') return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [attempt?.id, attempt?.status]);

  const endTime = attempt ? new Date(attempt.exam.scheduledEndAt).getTime() : 0;
  const timeLeft = attempt ? Math.max(0, endTime - now) : 0;

  useEffect(() => {
    if (!attempt || attempt.status !== 'IN_PROGRESS') {
      timeUpHandledRef.current = false;
      return;
    }
    if (timeLeft <= 0 && !timeUpHandledRef.current) {
      timeUpHandledRef.current = true;
      // Server (auto-submit scheduler) yang menutup attempt; client hanya refetch untuk melihat status terbaru.
      attemptQ.refetch();
    }
    // attemptQ.refetch adalah fungsi stabil dari react-query, aman dipanggil di sini.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, attempt?.status]);

  const handleViolation = useCallback(
    (result: ReportViolationResult, type: ProctoringViolationType) => {
      setLastViolationMessage(`Terdeteksi ${VIOLATION_LABEL[type]}. ${result.message}`);
      qc.setQueryData(attemptQueryKey(attemptId), (prev: ExamAttemptDetail | undefined) =>
        prev
          ? {
              ...prev,
              violationCount: result.violationCount,
              status: result.locked ? ExamAttemptStatus.LOCKED : prev.status,
            }
          : prev,
      );
    },
    [attemptId, qc],
  );

  const proctoring = useExamProctoring({
    attemptId: attempt?.id ?? null,
    active: attempt?.status === 'IN_PROGRESS',
    onViolation: handleViolation,
  });

  const persistAnswer = async (questionId: string, answer: SaveExamAnswerDto) => {
    setSaveState('saving');
    try {
      await apiFetch(`/exam-attempts/${attemptId}/answers/${questionId}`, {
        method: 'PUT',
        body: answer,
      });
      retryCounts.current[questionId] = 0;
      setSaveState('saved');
    } catch {
      setSaveState('error');
      const attempts = (retryCounts.current[questionId] ?? 0) + 1;
      retryCounts.current[questionId] = attempts;
      if (attempts <= 5) {
        const backoffMs = Math.min(1000 * 2 ** attempts, 15000);
        setTimeout(() => persistAnswer(questionId, answer), backoffMs);
      }
    }
  };

  /** Autosave dengan debounce — mencegah request membanjiri server tiap keystroke. */
  const saveAnswer = (questionId: string, answer: SaveExamAnswerDto, debounceMs = 500) => {
    if (!attempt || attempt.status !== 'IN_PROGRESS') return;
    setAnswers((prev) => ({ ...prev, [questionId]: answer }));

    if (debounceTimers.current[questionId]) clearTimeout(debounceTimers.current[questionId]);
    debounceTimers.current[questionId] = setTimeout(() => {
      persistAnswer(questionId, answer);
    }, debounceMs);
  };

  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);

  const submitExam = () => {
    if (!attempt || attempt.status !== 'IN_PROGRESS') return;
    setSubmitConfirmOpen(true);
  };

  const doSubmitExam = async () => {
    setSubmitConfirmOpen(false);
    if (!attempt || attempt.status !== 'IN_PROGRESS') return;

    try {
      const data = await apiFetch<ExamAttemptDetail>(`/exam-attempts/${attempt.id}/submit`, {
        method: 'POST',
        body: {},
      });
      qc.setQueryData(attemptQueryKey(attemptId), data);
    } catch (e) {
      setError(err(e, 'Gagal mengumpulkan ujian'));
    }
  };

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  if (attemptQ.isLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  if (attemptQ.isError) {
    return (
      <div>
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-destructive">
              <p>{err(attemptQ.error, 'Gagal memuat detail ujian')}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!attempt) {
    return <div>Ujian tidak ditemukan</div>;
  }

  const isSubmitted = attempt.status === 'SUBMITTED';
  const isLocked = attempt.status === 'LOCKED';
  const isInProgress = attempt.status === 'IN_PROGRESS';

  const answeredCount = attempt.items.filter((it) => {
    const a = answers[it.questionId];
    return (a?.selectedOptionIds?.length ?? 0) > 0 || !!a?.textAnswer?.trim();
  }).length;

  const VIOLATION_THRESHOLD = 3;

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8 shrink-0"
                  aria-label="Kembali ke daftar ujian"
                  onClick={() =>
                    isInProgress
                      ? setLeaveConfirmOpen(true)
                      : router.push('/siswa/ujian')
                  }
                >
                  <ArrowLeft className="size-4" />
                </Button>
                <CardTitle>{attempt.exam.title}</CardTitle>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <Badge variant={isSubmitted ? 'default' : isLocked ? 'destructive' : 'secondary'}>
                  {isSubmitted ? 'Selesai' : isLocked ? 'Dikunci (Proctoring)' : 'Sedang Mengerjakan'}
                </Badge>
                {isInProgress && (
                  <div className="flex items-center gap-2">
                    <span className={timeLeft < 60000 ? 'text-destructive font-bold' : ''}>
                      Sisa waktu: {formatTime(timeLeft)}
                    </span>
                  </div>
                )}
                {isInProgress && attempt.items.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {answeredCount}/{attempt.items.length} terjawab
                  </span>
                )}
                {isInProgress && (
                  <span className="text-xs text-muted-foreground">
                    {saveState === 'saving' && 'Menyimpan...'}
                    {saveState === 'saved' && 'Tersimpan'}
                    {saveState === 'error' && 'Koneksi bermasalah, mencoba lagi...'}
                  </span>
                )}
              </div>
            </div>
            {isInProgress && (
              <div className="flex flex-col items-end gap-2">
                {!proctoring.isFullscreen && (
                  <Button variant="outline" size="sm" onClick={proctoring.requestFullscreen}>
                    Aktifkan Mode Layar Penuh
                  </Button>
                )}
                <Button onClick={submitExam} disabled={timeLeft <= 0}>
                  Kumpulkan
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Proctoring warning banner */}
      {isInProgress && attempt.violationCount > 0 && (
        <Card className="border-warning-300 bg-warning-50">
          <CardContent className="pt-4 text-sm text-warning-800">
            <p className="font-medium">
              Peringatan pengawasan: {attempt.violationCount}/{VIOLATION_THRESHOLD} pelanggaran.
            </p>
            {lastViolationMessage && <p>{lastViolationMessage}</p>}
            <p className="mt-1">
              Tetap di mode layar penuh dan jangan berpindah tab/jendela. Attempt akan otomatis dikunci
              jika ambang batas pelanggaran tercapai.
            </p>
          </CardContent>
        </Card>
      )}

      {isLocked && (
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="pt-4 text-sm">
            <p className="font-semibold text-destructive">Attempt ini dikunci karena pelanggaran proctoring.</p>
            <p className="text-muted-foreground mt-1">
              Alasan: {attempt.lockedReason || 'Pelanggaran mencapai ambang batas.'}
            </p>
            <p className="text-muted-foreground mt-1">
              Hubungi pengawas/tutor/admin akademik untuk membuka kembali attempt ini. Halaman ini akan
              otomatis memuat ulang status secara berkala.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Questions */}
      {(isInProgress || isLocked) && (
        <div className="space-y-6">
          {attempt.items.map((item, index) => {
            const currentAnswer = answers[item.questionId];
            const question = item.question;

            return (
              <Card key={item.questionId}>
                <CardHeader>
                  <CardTitle className="text-lg">
                    Soal {index + 1} ({item.points} poin)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="prose prose-sm max-w-none">
                    <MathContent text={question.content} />
                    {question.imageUrl && (
                      <img src={resolveAssetUrl(question.imageUrl)} alt="Gambar soal" className="max-w-full h-auto rounded-lg" />
                    )}
                  </div>

                  {question.type === 'SINGLE_CHOICE' && (
                    <RadioGroup
                      value={currentAnswer?.selectedOptionIds?.[0] || ''}
                      onValueChange={(value) => {
                        saveAnswer(item.questionId, { selectedOptionIds: [value], textAnswer: undefined }, 200);
                      }}
                      disabled={!isInProgress}
                    >
                      {question.options.map((option) => (
                        <div key={option.id} className="flex items-center space-x-2">
                          <RadioGroupItem value={option.id} id={`opt-${option.id}`} />
                          <Label htmlFor={`opt-${option.id}`} className="flex-1">
                            <MathContent text={option.content} />
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                  )}

                  {question.type === 'MULTIPLE_CHOICE' && (
                    <div className="space-y-2">
                      {question.options.map((option) => (
                        <div key={option.id} className="flex items-center space-x-2">
                          <Checkbox
                            checked={currentAnswer?.selectedOptionIds?.includes(option.id) || false}
                            onCheckedChange={(checked) => {
                              const isChecked = checked === true;
                              const currentIds = currentAnswer?.selectedOptionIds || [];
                              const newIds = isChecked
                                ? [...currentIds, option.id]
                                : currentIds.filter((id) => id !== option.id);
                              saveAnswer(item.questionId, { selectedOptionIds: newIds, textAnswer: undefined }, 200);
                            }}
                            disabled={!isInProgress}
                          />
                          <Label htmlFor={`opt-${option.id}`} className="flex-1">
                            <MathContent text={option.content} />
                          </Label>
                        </div>
                      ))}
                    </div>
                  )}

                  {question.type === 'TRUE_FALSE' && (
                    <RadioGroup
                      value={currentAnswer?.selectedOptionIds?.[0] || ''}
                      onValueChange={(value) => {
                        saveAnswer(item.questionId, { selectedOptionIds: [value], textAnswer: undefined }, 200);
                      }}
                      disabled={!isInProgress}
                    >
                      {question.options.map((option) => (
                        <div key={option.id} className="flex items-center space-x-2">
                          <RadioGroupItem value={option.id} id={`opt-${option.id}`} />
                          <Label htmlFor={`opt-${option.id}`} className="flex-1">
                            <MathContent text={option.content} />
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                  )}

                  {(question.type === 'SHORT_ANSWER' || question.type === 'ESSAY') && (
                    <Textarea
                      value={currentAnswer?.textAnswer || ''}
                      onChange={(e) => {
                        saveAnswer(item.questionId, { selectedOptionIds: [], textAnswer: e.target.value }, 800);
                      }}
                      placeholder={question.type === 'SHORT_ANSWER' ? 'Jawaban singkat...' : 'Jawaban essay...'}
                      rows={question.type === 'ESSAY' ? 8 : 2}
                      disabled={!isInProgress}
                    />
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Results (if submitted) */}
      {isSubmitted && (
        <Card>
          <CardHeader>
            <CardTitle>Hasil Ujian</CardTitle>
          </CardHeader>
          <CardContent>
            {attempt.resultReleased ? (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground">Skor Anda</div>
                  <div className="text-2xl font-bold">
                    {attempt.score} / {attempt.maxScore}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Waktu Submit</div>
                  <div>{new Date(attempt.submittedAt!).toLocaleString('id-ID')}</div>
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-lg font-semibold mb-2">Hasil Belum Dirilis</p>
                <p className="text-muted-foreground">
                  Hasil ujian akan tersedia setelah waktu ujian selesai untuk semua peserta.
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  Waktu selesai: {new Date(attempt.exam.scheduledEndAt).toLocaleString('id-ID')}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Review per soal (hanya setelah result released) */}
      {isSubmitted && attempt.resultReleased && attempt.items.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Pembahasan</h2>
          {attempt.items.map((item, index) => {
            const question = item.question;
            const answer = item.answer;
            return (
              <Card key={item.questionId}>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <span>Soal {index + 1} ({item.points} poin)</span>
                    {answer?.isCorrect === true && <Badge>Benar</Badge>}
                    {answer?.isCorrect === false && <Badge variant="destructive">Salah</Badge>}
                    {(answer?.isCorrect === null || answer?.isCorrect === undefined) && (
                      <Badge variant="secondary">Perlu penilaian manual</Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="prose prose-sm max-w-none">
                    <MathContent text={question.content} />
                  </div>

                  {question.options.length > 0 && (
                    <div className="flex flex-col gap-1">
                      {question.options.map((opt) => {
                        const isSelected = answer?.selectedOptionIds?.includes(opt.id);
                        return (
                          <div
                            key={opt.id}
                            className={`p-2 rounded ${
                              opt.isCorrect
                                ? 'bg-success-50 border border-success-300'
                                : isSelected
                                ? 'bg-destructive/10 border border-destructive/30'
                                : 'bg-muted'
                            }`}
                          >
                            <MathContent text={opt.content} />
                            {opt.isCorrect && <Badge className="ml-2">Kunci</Badge>}
                            {isSelected && !opt.isCorrect && <Badge variant="destructive" className="ml-2">Jawaban Anda</Badge>}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {answer?.textAnswer && (
                    <div>
                      <p className="text-muted-foreground mb-1">Jawaban Anda:</p>
                      <p>{answer.textAnswer}</p>
                    </div>
                  )}
                  {question.answerKey && (
                    <div>
                      <p className="text-muted-foreground mb-1">Kunci Jawaban:</p>
                      <p className="font-medium">{question.answerKey}</p>
                    </div>
                  )}
                  {question.explanation && (
                    <div className="bg-brand-blue-50 p-3 rounded-lg">
                      <p className="text-muted-foreground mb-1">Pembahasan:</p>
                      <MathContent text={question.explanation} />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {error && attempt && (
        <p className="text-sm text-muted-foreground">{error}</p>
      )}

      <ConfirmDialog
        open={submitConfirmOpen}
        onOpenChange={setSubmitConfirmOpen}
        tone="primary"
        title="Kumpulkan ujian sekarang?"
        description="Jawaban yang sudah terisi akan dikirim dan tidak bisa diubah lagi."
        confirmLabel="Ya, kumpulkan"
        onConfirm={doSubmitExam}
      />

      <ConfirmDialog
        open={leaveConfirmOpen}
        onOpenChange={setLeaveConfirmOpen}
        tone="primary"
        title="Tinggalkan halaman ujian?"
        description="Jawaban Anda sudah tersimpan otomatis di server — Anda bisa kembali dan melanjutkan selama waktu ujian masih berjalan."
        confirmLabel="Ya, kembali ke daftar"
        onConfirm={() => router.push('/siswa/ujian')}
      />
    </div>
  );
}
