'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ChevronLeft, ChevronRight, LayoutGrid, Maximize } from 'lucide-react';
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
import { QuestionNumberMap, NumberMapLegend } from '@/components/shared/question-number-map';
import type { NumberMapState } from '@/components/shared/question-number-map';
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
  [ProctoringViolationType.TAB_LEAVE]: 'meninggalkan halaman ujian',
};

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const lastIndexKey = (attemptId: string) => `exam-attempt-${attemptId}-idx`;

/**
 * Fase 3d — Proctoring realistis di sisi client.
 * Browser tidak bisa "dipaksa" tetap fullscreen/fokus, jadi kontrol yang
 * realistis adalah: minta fullscreen (butuh gesture user), lalu deteksi
 * kalau siswa keluar fullscreen / pindah tab / kehilangan fokus, dan
 * laporkan ke server — server mengunci attempt saat itu juga.
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
    setIsFullscreen(!!document.fullscreenElement);

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
    if (!document.documentElement.requestFullscreen) return false;
    try {
      await document.documentElement.requestFullscreen();
      setIsFullscreen(true);
      return true;
    } catch {
      // Beberapa browser/mode (mis. iframe tanpa allow, iOS Safari) menolak
      // fullscreen — deteksi blur/visibility tetap berjalan sebagai cadangan.
      return false;
    }
  }, []);

  return { isFullscreen, requestFullscreen, reportViolation };
}

export function ExamTaker({ attemptId }: ExamTakerProps) {
  const qc = useQueryClient();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const [answers, setAnswers] = useState<Record<string, SaveExamAnswerDto>>({});
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [lastViolationMessage, setLastViolationMessage] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [numPadOpen, setNumPadOpen] = useState(false);
  const [fsDismissed, setFsDismissed] = useState(false);
  const [fsFailed, setFsFailed] = useState(false);
  const [timeUp, setTimeUp] = useState(false);

  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const retryCounts = useRef<Record<string, number>>({});
  const timeUpHandledRef = useRef(false);
  const indexRestoredRef = useRef(false);

  // Source of truth = react-query cache. Polling saat status LOCKED (menunggu
  // unlock pengawas) dan saat waktu habis (menunggu auto-submit server).
  const attemptQ = useQuery({
    queryKey: attemptQueryKey(attemptId),
    queryFn: () => apiFetch<ExamAttemptDetail>(`/exam-attempts/${attemptId}`),
    enabled: !!attemptId,
    refetchInterval: (query) => {
      const st = query.state.data?.status;
      if (st === 'LOCKED') return 15000;
      if (st === 'IN_PROGRESS' && timeUp) return 4000;
      return false;
    },
  });
  const attempt = attemptQ.data ?? null;

  const proctoringOn = attempt?.exam.proctoringEnabled !== false;

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
    // Pulihkan posisi soal terakhir (bertahan saat kunci → unlock → lanjut).
    if (!indexRestoredRef.current) {
      indexRestoredRef.current = true;
      const saved = Number(localStorage.getItem(lastIndexKey(attemptId)));
      if (Number.isFinite(saved) && saved >= 0) {
        setCurrentIndex(Math.min(saved, items.length - 1));
      }
    }
  }, [attemptQ.data, attemptId]);

  const jumpTo = (index: number) => {
    if (!attempt) return;
    // Mode subtes: indeks di-clamp ke soal subtes aktif, bukan seluruh ujian.
    const max = Math.max(0, visibleItemsRef.current.length - 1);
    const clamped = Math.max(0, Math.min(index, max));
    setCurrentIndex(clamped);
    localStorage.setItem(lastIndexKey(attemptId), String(clamped));
    setNumPadOpen(false);
  };
  const visibleItemsRef = useRef<{ questionId: string }[]>([]);

  // Timer sisi klien: hanya menampilkan hitung mundur. Waktu otoritatif tetap
  // server (scheduled_end_at + auto-submit scheduler) — client hanya menampilkan
  // & memicu refresh saat habis.
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
      setTimeUp(true);
      // Server (auto-submit scheduler) yang menutup attempt; client polling sampai status berubah.
      attemptQ.refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, attempt?.status]);

  // Waktu subtes habis → kumpulkan subtes otomatis (sekali per subtes).
  const subtesTimeUpRef = useRef<string | null>(null);
  useEffect(() => {
    const subtesStates = attempt?.subtesStates ?? [];
    const active = subtesStates.find((s) => s.startedAt && !s.submittedAt);
    if (!attempt || attempt.status !== 'IN_PROGRESS' || !active) {
      subtesTimeUpRef.current = null;
      return;
    }
    const subtes = (attempt.exam.subtes ?? []).find((s) => s.id === active.subtesId);
    if (!subtes || !active.startedAt) return;
    const left = new Date(active.startedAt).getTime() + subtes.durationMinutes * 60_000 - now;
    if (left <= 0 && subtesTimeUpRef.current !== active.subtesId) {
      subtesTimeUpRef.current = active.subtesId;
      void apiFetch(`/exam-attempts/${attemptId}/subtes/${active.subtesId}/submit`, {
        method: 'POST',
      })
        .catch(() => undefined)
        .finally(() => attemptQ.refetch());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, attempt?.status, attempt?.subtesStates]);

  const handleViolation = useCallback(
    (result: ReportViolationResult, type: ProctoringViolationType) => {
      setLastViolationMessage(`Terdeteksi ${VIOLATION_LABEL[type]}. ${result.message}`);
      qc.setQueryData(attemptQueryKey(attemptId), (prev: ExamAttemptDetail | undefined) =>
        prev
          ? {
              ...prev,
              violationCount: result.violationCount,
              status: result.autoSubmitted
                ? ExamAttemptStatus.SUBMITTED
                : result.locked
                  ? ExamAttemptStatus.LOCKED
                  : prev.status,
            }
          : prev,
      );
      if (result.autoSubmitted) {
        // Sinkronkan detail (skor/status) dari server.
        attemptQ.refetch();
      }
    },
    [attemptId, qc, attemptQ],
  );

  const proctoring = useExamProctoring({
    attemptId: attempt?.id ?? null,
    active: attempt?.status === 'IN_PROGRESS' && proctoringOn,
    onViolation: handleViolation,
  });

  // Coba masuk fullscreen otomatis saat attempt dimuat (sering ditolak tanpa
  // gesture — gerbang fullscreen di bawah yang menangani sisanya).
  const fsRequestedRef = useRef(false);
  useEffect(() => {
    if (attempt?.status === 'IN_PROGRESS' && proctoringOn && !fsRequestedRef.current) {
      fsRequestedRef.current = true;
      void proctoring.requestFullscreen();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt?.status, proctoringOn]);

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

  const [subtesConfirmOpen, setSubtesConfirmOpen] = useState(false);
  const [subtesBusy, setSubtesBusy] = useState(false);

  /** Mulai subtes — timer subtes berjalan sejak server menerima request. */
  const doStartSubtes = async (subtesId: string) => {
    setSubtesBusy(true);
    try {
      await apiFetch(`/exam-attempts/${attemptId}/subtes/${subtesId}/start`, {
        method: 'POST',
      });
      setCurrentIndex(0);
      await attemptQ.refetch();
    } catch (e) {
      setError(err(e, 'Gagal memulai subtes'));
    } finally {
      setSubtesBusy(false);
    }
  };

  /** Kumpulkan subtes aktif — terkunci permanen, lanjut ke subtes berikutnya. */
  const doSubmitSubtes = async () => {
    if (!activeSubtesId) return;
    setSubtesBusy(true);
    setSubtesConfirmOpen(false);
    try {
      await apiFetch(`/exam-attempts/${attemptId}/subtes/${activeSubtesId}/submit`, {
        method: 'POST',
      });
      setCurrentIndex(0);
      await attemptQ.refetch();
    } catch (e) {
      setError(err(e, 'Gagal mengumpulkan subtes'));
    } finally {
      setSubtesBusy(false);
    }
  };

  /** Keluar halaman saat ujian terproteksi → attempt dikunci server-side. */
  const handleBack = async () => {
    if (!attempt) return;
    if (attempt.status === 'IN_PROGRESS') {
      if (proctoringOn) {
        try {
          await apiFetch(`/exam-attempts/${attemptId}/violation`, {
            method: 'POST',
            body: { violationType: ProctoringViolationType.TAB_LEAVE },
          });
        } catch {
          // Tetap keluar walau laporan gagal.
        }
        router.back();
        return;
      }
      setLeaveConfirmOpen(true);
      return;
    }
    router.back();
  };

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const mm = m.toString().padStart(2, '0');
    const ss = s.toString().padStart(2, '0');
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
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

  // Mode multi-subtes (Try Out/UTBK): soal dikerjakan per subtes berurutan —
  // subtes aktif = yang sudah dimulai tapi belum dikumpulkan.
  const subtesList = attempt.exam.subtes ?? [];
  const hasSubtes = subtesList.length > 0;
  const subtesStates = attempt.subtesStates ?? [];
  const activeSubtesId =
    subtesStates.find((s) => s.startedAt && !s.submittedAt)?.subtesId ?? null;
  const activeSubtes = subtesList.find((s) => s.id === activeSubtesId) ?? null;
  const activeState = subtesStates.find((s) => s.subtesId === activeSubtesId);
  const subtesEnd = activeSubtes && activeState?.startedAt
    ? new Date(activeState.startedAt).getTime() + activeSubtes.durationMinutes * 60_000
    : 0;
  const subtesLeft = activeSubtes ? Math.max(0, subtesEnd - now) : 0;
  // Subtes berikutnya yang bisa dimulai = subtes pertama yang belum dikumpulkan.
  const nextSubtesId =
    subtesList.find((s) => !subtesStates.some((st) => st.subtesId === s.id && st.submittedAt))?.id ??
    null;
  const allSubtesDone = hasSubtes && !nextSubtesId;

  const visibleItems = hasSubtes
    ? attempt.items.filter((it) => it.subtesId === activeSubtesId)
    : attempt.items;
  visibleItemsRef.current = visibleItems;

  const isAnswered = (questionId: string) => {
    const a = answers[questionId];
    return (a?.selectedOptionIds?.length ?? 0) > 0 || !!a?.textAnswer?.trim();
  };
  const answeredCount = visibleItems.filter((it) => isAnswered(it.questionId)).length;

  const numStates: NumberMapState[] = visibleItems.map((it) =>
    isAnswered(it.questionId) ? 'answered' : 'idle',
  );

  const item = visibleItems[currentIndex] ?? null;
  const isLastVisible = currentIndex >= visibleItems.length - 1;
  const showFsGate =
    isInProgress && proctoringOn && !proctoring.isFullscreen && !fsDismissed && item;

  const questionBody = item ? (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 text-lg">
          <span>
            Soal {currentIndex + 1}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              dari {visibleItems.length} · {item.points} poin
            </span>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="prose prose-sm max-w-none">
          <MathContent text={item.question.content} />
          {item.question.imageUrl && (
            <img
              src={resolveAssetUrl(item.question.imageUrl)}
              alt="Gambar soal"
              className="max-w-full h-auto rounded-lg"
            />
          )}
        </div>

        {(item.question.type === 'SINGLE_CHOICE' || item.question.type === 'TRUE_FALSE') && (
          <RadioGroup
            value={answers[item.questionId]?.selectedOptionIds?.[0] || ''}
            onValueChange={(value) => {
              saveAnswer(item.questionId, { selectedOptionIds: [value], textAnswer: undefined }, 200);
            }}
            disabled={!isInProgress}
            className="gap-3"
          >
            {item.question.options.map((option) => (
              <div
                key={option.id}
                className="flex items-start gap-3 rounded-lg border border-border p-3"
              >
                <RadioGroupItem value={option.id} id={`opt-${option.id}`} className="mt-0.5" />
                <Label htmlFor={`opt-${option.id}`} className="flex-1 cursor-pointer font-normal">
                  <MathContent text={option.content} />
                </Label>
              </div>
            ))}
          </RadioGroup>
        )}

        {item.question.type === 'MULTIPLE_CHOICE' && (
          <div className="flex flex-col gap-3">
            {item.question.options.map((option) => (
              <div
                key={option.id}
                className="flex items-start gap-3 rounded-lg border border-border p-3"
              >
                <Checkbox
                  id={`opt-${option.id}`}
                  className="mt-0.5"
                  checked={answers[item.questionId]?.selectedOptionIds?.includes(option.id) || false}
                  onCheckedChange={(checked) => {
                    const currentIds = answers[item.questionId]?.selectedOptionIds || [];
                    const newIds =
                      checked === true
                        ? [...currentIds, option.id]
                        : currentIds.filter((id) => id !== option.id);
                    saveAnswer(item.questionId, { selectedOptionIds: newIds, textAnswer: undefined }, 200);
                  }}
                  disabled={!isInProgress}
                />
                <Label htmlFor={`opt-${option.id}`} className="flex-1 cursor-pointer font-normal">
                  <MathContent text={option.content} />
                </Label>
              </div>
            ))}
          </div>
        )}

        {(item.question.type === 'SHORT_ANSWER' || item.question.type === 'ESSAY') && (
          <Textarea
            value={answers[item.questionId]?.textAnswer || ''}
            onChange={(e) => {
              saveAnswer(item.questionId, { selectedOptionIds: [], textAnswer: e.target.value }, 800);
            }}
            placeholder={item.question.type === 'SHORT_ANSWER' ? 'Jawaban singkat...' : 'Jawaban essay...'}
            rows={item.question.type === 'ESSAY' ? 8 : 2}
            disabled={!isInProgress}
          />
        )}
      </CardContent>
    </Card>
  ) : null;

  const prevNext = (
    <div className="flex items-center justify-between gap-2">
      <Button
        variant="outline"
        onClick={() => jumpTo(currentIndex - 1)}
        disabled={currentIndex === 0}
      >
        <ChevronLeft /> Sebelumnya
      </Button>
      {isLastVisible ? (
        <Button
          onClick={() => (hasSubtes ? setSubtesConfirmOpen(true) : submitExam())}
          disabled={!isInProgress || timeLeft <= 0 || subtesBusy}
        >
          {hasSubtes ? 'Kumpulkan Subtes' : 'Kumpulkan'}
        </Button>
      ) : (
        <Button onClick={() => jumpTo(currentIndex + 1)}>
          Selanjutnya <ChevronRight />
        </Button>
      )}
    </div>
  );

  return (
    <div className="space-y-6 pb-20 lg:pb-0">
      {/* Top bar — sticky di mobile, tombol kumpulkan kanan atas. */}
      <div className="sticky top-0 z-30 -mx-4 border-b bg-background/95 px-4 py-2.5 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex items-center gap-3">
          <Button
            size="icon"
            variant="ghost"
            className="size-8 shrink-0"
            aria-label="Kembali ke daftar ujian"
            onClick={handleBack}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{attempt.exam.title}</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              <Badge
                variant={isSubmitted ? 'default' : isLocked ? 'destructive' : 'secondary'}
                className="h-5 text-[10px]"
              >
                {isSubmitted ? 'Selesai' : isLocked ? 'Dikunci (Proctoring)' : 'Sedang Mengerjakan'}
              </Badge>
              {isInProgress && hasSubtes && (
                <span className="font-medium text-primary">
                  {activeSubtes ? `Subtes: ${activeSubtes.name}` : 'Pilih subtes'}
                </span>
              )}
              {isInProgress && (
                <span>
                  {answeredCount}/{visibleItems.length} terjawab
                </span>
              )}
              {isInProgress && (
                <span>
                  {saveState === 'saving' && 'Menyimpan...'}
                  {saveState === 'saved' && 'Tersimpan otomatis'}
                  {saveState === 'error' && 'Koneksi bermasalah, mencoba lagi...'}
                </span>
              )}
            </div>
          </div>
          {isInProgress && activeSubtes && (
            <div
              className={`shrink-0 rounded-md px-2.5 py-1 font-mono text-sm font-bold tabular-nums ${
                subtesLeft < 60000 ? 'bg-destructive/10 text-destructive' : 'bg-brand-blue-50 text-brand-blue-800'
              }`}
              title="Sisa waktu subtes aktif"
            >
              {formatTime(subtesLeft)}
            </div>
          )}
          {isInProgress && (
            <div
              className={`shrink-0 rounded-md px-2.5 py-1 font-mono text-sm font-bold tabular-nums ${
                timeLeft < 60000 ? 'bg-destructive/10 text-destructive' : 'bg-muted'
              }`}
              title="Sisa waktu ujian"
            >
              {hasSubtes && <span className="mr-1 text-[10px] font-normal">UJIAN</span>}
              {formatTime(timeLeft)}
            </div>
          )}
          {isInProgress && !hasSubtes && (
            <Button size="sm" onClick={submitExam} disabled={timeLeft <= 0} className="shrink-0">
              Kumpulkan
            </Button>
          )}
        </div>
      </div>

      {/* Notifikasi pelanggaran — server mengunci pada pelanggaran pertama. */}
      {isInProgress && attempt.violationCount > 0 && (
        <Card className="border-warning-300 bg-warning-50">
          <CardContent className="pt-4 text-sm text-warning-800">
            <p className="font-medium">Peringatan pengawasan tercatat.</p>
            {lastViolationMessage && <p>{lastViolationMessage}</p>}
            <p className="mt-1">
              Tetap di halaman ujian — keluar aplikasi/halaman akan mengunci attempt dan
              harus dibuka pengawas.
            </p>
          </CardContent>
        </Card>
      )}

      {isLocked && (
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="pt-4 text-sm">
            <p className="font-semibold text-destructive">Attempt ini dikunci karena pelanggaran proctoring.</p>
            <p className="text-muted-foreground mt-1">
              Alasan: {attempt.lockedReason || 'Terdeteksi keluar dari halaman ujian.'}
            </p>
            <p className="text-muted-foreground mt-1">
              Hubungi pengawas/tutor/admin akademik untuk membuka kembali attempt ini — setelah
              dibuka Anda lanjut dari soal terakhir. Bila tidak dibuka sampai waktu habis,
              jawaban yang sudah tersimpan akan otomatis dikumpulkan. Halaman ini memuat ulang
              status secara berkala.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Lobi subtes — ujian multi-subtes (Try Out/UTBK): siswa memulai
          subtes satu per satu secara berurutan; subtes yang dikumpulkan
          terkunci permanen. */}
      {hasSubtes && isInProgress && !activeSubtesId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {allSubtesDone ? 'Semua subtes selesai' : 'Pilih subtes berikutnya'}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              Subtes dikerjakan berurutan — subtes yang sudah dikumpulkan tidak
              bisa dibuka lagi. Waktu subtes berjalan sejak tombol Mulai ditekan.
            </p>
            {subtesList.map((s, idx) => {
              const st = subtesStates.find((x) => x.subtesId === s.id);
              const done = !!st?.submittedAt;
              const count = attempt.items.filter((it) => it.subtesId === s.id).length;
              const canStart = s.id === nextSubtesId;
              return (
                <div
                  key={s.id}
                  className={`flex items-center gap-3 rounded-lg border p-3 ${
                    done ? 'opacity-60' : canStart ? 'border-primary/50 bg-primary/5' : ''
                  }`}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{s.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {count} soal · {s.durationMinutes} menit
                    </p>
                  </div>
                  {done ? (
                    <Badge variant="secondary" className="shrink-0">Selesai</Badge>
                  ) : canStart ? (
                    <Button
                      size="sm"
                      className="shrink-0"
                      disabled={subtesBusy}
                      onClick={() => doStartSubtes(s.id)}
                    >
                      {subtesBusy ? 'Memulai…' : 'Mulai Subtes'}
                    </Button>
                  ) : (
                    <Badge variant="outline" className="shrink-0">Terkunci</Badge>
                  )}
                </div>
              );
            })}
            <div className="mt-2 flex items-center justify-between gap-2 rounded-md border border-dashed p-3">
              <p className="text-xs text-muted-foreground">
                {allSubtesDone
                  ? 'Semua subtes sudah dikumpulkan — kumpulkan ujian untuk mengakhiri.'
                  : 'Selesaikan semua subtes dulu, atau kumpulkan ujian sekarang (subtes yang belum selesai ditutup).'}
              </p>
              <Button
                size="sm"
                variant={allSubtesDone ? 'default' : 'outline'}
                onClick={submitExam}
                disabled={timeLeft <= 0 || subtesBusy}
                className="shrink-0"
              >
                Kumpulkan Ujian
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Layout TKA: soal di kiri, peta nomor di kanan (desktop). */}
      {(isInProgress || isLocked) && item && (
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_260px] lg:items-start lg:gap-6">
          <div className="flex flex-col gap-4">
            {questionBody}
            <div className="hidden lg:block">{prevNext}</div>
          </div>

          {/* Sidebar navigasi nomor — desktop saja. */}
          <aside className="sticky top-16 hidden flex-col gap-3 lg:flex">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Navigasi Soal</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <QuestionNumberMap
                  count={visibleItems.length}
                  current={currentIndex}
                  states={numStates}
                  onJump={jumpTo}
                />
                <NumberMapLegend
                  items={[
                    { state: 'answered', label: 'Terjawab' },
                    { state: 'idle', label: 'Belum' },
                  ]}
                />
              </CardContent>
            </Card>
          </aside>
        </div>
      )}

      {/* Bottom bar navigasi — mobile saja: prev | nomor | next. */}
      {isInProgress && item && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
          {numPadOpen && (
            <div className="max-h-[50svh] overflow-y-auto border-b p-4">
              <QuestionNumberMap
                count={visibleItems.length}
                current={currentIndex}
                states={numStates}
                onJump={jumpTo}
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
                isLastVisible
                  ? hasSubtes
                    ? setSubtesConfirmOpen(true)
                    : submitExam()
                  : jumpTo(currentIndex + 1)
              }
              className="flex min-h-14 items-center justify-center gap-1 text-sm font-medium"
            >
              {isLastVisible ? (hasSubtes ? 'Kumpulkan' : 'Kumpulkan') : 'Selanjutnya'}{' '}
              <ChevronRight className="size-5" />
            </button>
          </div>
        </div>
      )}

      {/* Gerbang layar penuh — ujian terproteksi wajib fullscreen. */}
      {showFsGate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 p-6 backdrop-blur-sm">
          <Card className="w-full max-w-sm">
            <CardContent className="flex flex-col items-center gap-4 pt-6 text-center">
              <Maximize className="size-10 text-primary" />
              <div>
                <p className="font-semibold">Ujian ini menggunakan mode layar penuh</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Selama ujian, keluar dari layar penuh/aplikasi akan mengunci attempt Anda dan
                  harus dibuka pengawas.
                </p>
                {fsFailed && (
                  <p className="mt-2 text-xs text-warning-700">
                    Browser menolak mode layar penuh — Anda tetap diawasi lewat deteksi pindah
                    tab/aplikasi.
                  </p>
                )}
              </div>
              <Button
                className="w-full"
                onClick={async () => {
                  const ok = await proctoring.requestFullscreen();
                  if (!ok) setFsFailed(true);
                }}
              >
                Masuk Mode Layar Penuh
              </Button>
              {fsFailed && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline"
                  onClick={() => setFsDismissed(true)}
                >
                  Lanjutkan tanpa layar penuh
                </button>
              )}
            </CardContent>
          </Card>
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
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div>
                    <div className="text-sm text-muted-foreground">Skor Anda</div>
                    <div className="text-2xl font-bold">
                      {attempt.score} / {attempt.maxScore}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Benar / Salah</div>
                    <div className="text-2xl font-bold">
                      <span className="text-emerald-700">
                        {attempt.items.filter((i) => i.answer?.isCorrect === true).length}
                      </span>
                      {' / '}
                      <span className="text-destructive">
                        {attempt.items.filter((i) => i.answer?.isCorrect === false).length}
                      </span>
                    </div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-sm text-muted-foreground">Waktu Submit</div>
                    <div>{new Date(attempt.submittedAt!).toLocaleString('id-ID')}</div>
                  </div>
                </div>

                {/* Rekap per subtes — try out multi-mapel. */}
                {(attempt.subtesResults?.length ?? 0) > 0 && (
                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                          <th className="px-3 py-2 font-medium">Subtes</th>
                          <th className="px-3 py-2 text-right font-medium">Benar</th>
                          <th className="px-3 py-2 text-right font-medium">Skor</th>
                          <th className="px-3 py-2 font-medium">Akurasi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {attempt.subtesResults!.map((r) => (
                          <tr key={r.subtesId} className="border-b last:border-0">
                            <td className="px-3 py-2 font-medium">{r.name}</td>
                            <td className="px-3 py-2 text-right">
                              <span className="text-emerald-700">{r.correct}</span>
                              <span className="text-muted-foreground"> / {r.total}</span>
                            </td>
                            <td className="px-3 py-2 text-right font-semibold">
                              {r.score}
                              <span className="font-normal text-muted-foreground"> / {r.maxScore}</span>
                            </td>
                            <td className="px-3 py-2">
                              <div className="h-2 w-full min-w-24 overflow-hidden rounded-full bg-muted">
                                <div
                                  className="h-full rounded-full bg-emerald-600"
                                  style={{
                                    width: `${r.maxScore ? Math.round((r.score / r.maxScore) * 100) : 0}%`,
                                  }}
                                />
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
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
          {attempt.items.map((it, index) => {
            const question = it.question;
            const answer = it.answer;
            const prevSubtes = index > 0 ? attempt.items[index - 1].subtesId : undefined;
            const showSubtesHeader = hasSubtes && it.subtesId !== prevSubtes;
            return (
              <div key={it.questionId} className="space-y-4">
              {showSubtesHeader && (
                <div className="flex items-center gap-2 pt-2">
                  <Badge variant="default" className="text-xs">
                    Subtes {subtesList.findIndex((s) => s.id === it.subtesId) + 1}
                  </Badge>
                  <h3 className="text-sm font-semibold">{it.subtesName ?? 'Subtes'}</h3>
                </div>
              )}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <span>Soal {index + 1} ({it.points} poin)</span>
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
              </div>
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
        open={subtesConfirmOpen}
        onOpenChange={setSubtesConfirmOpen}
        tone="primary"
        title={`Kumpulkan subtes "${activeSubtes?.name ?? ''}"?`}
        description="Jawaban subtes ini akan dikunci dan tidak bisa diubah lagi. Anda akan lanjut ke subtes berikutnya."
        confirmLabel="Ya, kumpulkan subtes"
        pending={subtesBusy}
        onConfirm={doSubmitSubtes}
      />

      <ConfirmDialog
        open={leaveConfirmOpen}
        onOpenChange={setLeaveConfirmOpen}
        tone="primary"
        title="Tinggalkan halaman ujian?"
        description="Jawaban Anda sudah tersimpan otomatis di server — Anda bisa kembali dan melanjutkan selama waktu ujian masih berjalan."
        confirmLabel="Ya, kembali ke daftar"
        onConfirm={() => router.back()}
      />
    </div>
  );
}
