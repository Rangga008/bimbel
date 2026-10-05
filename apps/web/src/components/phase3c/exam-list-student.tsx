'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch, ApiError } from '@/lib/api-client';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import {
  ContentDrilldown,
  DrillBreadcrumb,
  useContentCategories,
  useContentLevels,
} from '@/components/shared/content-drilldown';
import {
  applyDrill,
  drillDone,
  drillFromParams,
  type DrillValue,
} from '@/lib/content-taxonomy';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { ExamAttempt, ExamRow, ExamStatus } from '@/lib/phase3c-types';
import { useRouter, useSearchParams } from 'next/navigation';

function err(e: unknown, fb: string) {
  return e instanceof ApiError ? e.message : fb;
}

async function fetchExamsWithAttempts() {
  const exams = await apiFetch<ExamRow[]>('/exams-available');
  const attemptsResults = await Promise.all(
    exams.map(async (exam) => {
      try {
        const attempts = await apiFetch<ExamAttempt[]>(`/exams/${exam.id}/my-attempts`);
        return { examId: exam.id, attempts };
      } catch {
        return { examId: exam.id, attempts: [] as ExamAttempt[] };
      }
    }),
  );
  const attemptsMap: Record<string, ExamAttempt> = {};
  attemptsResults.forEach(({ examId, attempts }) => {
    if (attempts.length > 0) attemptsMap[examId] = attempts[0];
  });
  return { exams, attemptsMap };
}

export function ExamListStudent() {
  const qc = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  // Drill Tingkat → Jenjang → Mapel → Tipe, sama seperti halaman konten lain.
  // Posisi drill disimpan di URL supaya tombol kembali tidak me-reset langkah.
  const [drill, setDrill] = useState<DrillValue>(() =>
    drillFromParams((k) => searchParams.get(k)),
  );
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);

  const dataQ = useQuery({
    queryKey: ['exams-with-my-attempts'],
    queryFn: fetchExamsWithAttempts,
  });

  const levelsQ = useContentLevels();
  const catsQ = useContentCategories();

  const [startTarget, setStartTarget] = useState<ExamRow | null>(null);

  const startM = useMutation({
    mutationFn: (examId: string) => apiFetch<{ id: string }>('/exam-attempts/start', { method: 'POST', body: { examId } }),
    onSuccess: (data) => {
      setStartTarget(null);
      router.push(`/siswa/ujian/${data.id}`);
    },
    onError: (e) => toast.error(err(e, 'Gagal memulai ujian')),
  });

  const continueExam = (attemptId: string) => {
    router.push(`/siswa/ujian/${attemptId}`);
  };

  const viewResult = (attemptId: string, resultReleased?: boolean) => {
    if (!resultReleased) {
      toast.error('Hasil ujian belum dirilis. Silakan tunggu sampai waktu ujian selesai untuk semua peserta.');
      return;
    }
    router.push(`/siswa/ujian/${attemptId}`);
  };

  const getStatusBadge = (status: ExamStatus) => {
    const cfg = {
      DRAFT: { variant: 'secondary', label: 'Draft' },
      PUBLISHED: { variant: 'default', label: 'Dibuka' },
      LOCKED: { variant: 'destructive', label: 'Terkunci' },
      ENDED: { variant: 'outline', label: 'Berakhir' },
    } as const;
    const c = cfg[status] ?? { variant: 'secondary' as const, label: status };
    return <Badge variant={c.variant}>{c.label}</Badge>;
  };

  const getExamStatus = (exam: ExamRow) => {
    // Ujian yang diakhiri manual oleh pengawas tetap dianggap selesai
    // meski jadwal belum lewat.
    if (exam.status === 'ENDED') return 'ENDED';
    const now = new Date();
    const start = new Date(exam.scheduledStartAt);
    const end = new Date(exam.scheduledEndAt);

    if (now < start) return 'NOT_STARTED';
    if (now > end) return 'ENDED';
    return 'ACTIVE';
  };

  if (dataQ.isLoading) {
    return <Skeleton className="h-24 w-full" />;
  }

  if (dataQ.isError) {
    return <div className="text-sm text-destructive">{err(dataQ.error, 'Gagal memuat daftar ujian.')}</div>;
  }

  const exams = dataQ.data?.exams ?? [];
  const myAttempts = dataQ.data?.attemptsMap ?? {};
  // Ujian PUBLISHED selalu tampil; ujian ENDED hanya tampil bila siswa
  // punya attempt (untuk melihat hasil yang sudah dirilis).
  const visibleExams = exams.filter(
    (exam) => exam.status === 'PUBLISHED' || (exam.status === 'ENDED' && myAttempts[exam.id]),
  );
  const levels = levelsQ.data;
  const drilled = applyDrill(visibleExams, drill, levels);
  const list = debouncedSearch
    ? drilled.filter((e) =>
        e.title.toLowerCase().includes(debouncedSearch.toLowerCase()),
      )
    : drilled;
  const done = drillDone(drill) || !!debouncedSearch;

  const startExam = (examId: string) => {
    qc.invalidateQueries({ queryKey: ['exams-with-my-attempts'] });
    startM.mutate(examId);
  };

  // Landing drill-down: Tingkat → Jenjang → Mapel → Tipe — untuk siswa/tutor
  // jenjang & mapel sudah dibatasi scope program yang mereka ikuti/ampu.
  if (!done) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Ujian</h1>
            <p className="text-sm text-muted-foreground">
              Ujian dikelompokkan per jenjang → mapel → tipe.
            </p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Cari ujian..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        <ContentDrilldown
          items={visibleExams}
          levels={levels}
          categories={catsQ.data}
          value={drill}
          onChange={setDrill}
          itemNoun="Ujian"
          loading={dataQ.isLoading || levelsQ.isLoading}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        {!debouncedSearch && (
          <DrillBreadcrumb
            items={visibleExams}
            levels={levels}
            categories={catsQ.data}
            value={drill}
            onChange={setDrill}
          />
        )}
        <h1 className="mt-1 text-2xl font-bold">Ujian Tersedia</h1>
      </div>
      <div className="relative w-full sm:w-64">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Cari ujian..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="grid gap-4">
        {list.map((exam) => {
          const examStatus = getExamStatus(exam);
          const attempt = myAttempts[exam.id];

          return (
            <Card key={exam.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2">
                      {exam.title}
                      {getStatusBadge(exam.status)}
                    </CardTitle>
                    {exam.description && (
                      <p className="text-sm text-muted-foreground">{exam.description}</p>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm mb-4">
                  <div>
                    <div className="text-muted-foreground">Mulai</div>
                    <div>{new Date(exam.scheduledStartAt).toLocaleString('id-ID')}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Selesai</div>
                    <div>{new Date(exam.scheduledEndAt).toLocaleString('id-ID')}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">
                      {exam.items.length} soal
                      {exam.durationMinutes ? ` · ${exam.durationMinutes} menit` : ''}
                    </div>
                    <div>Nilai maks {exam.maxScore}</div>
                  </div>
                </div>

                {examStatus === 'NOT_STARTED' && <Button disabled>Belum Dimulai</Button>}

                {examStatus === 'ACTIVE' && (
                  <>
                    {attempt && attempt.status === 'IN_PROGRESS' ? (
                      <Button onClick={() => continueExam(attempt.id)}>Lanjutkan</Button>
                    ) : attempt && attempt.status === 'LOCKED' ? (
                      <Button variant="destructive" onClick={() => continueExam(attempt.id)}>
                        Dikunci — Lihat Status
                      </Button>
                    ) : attempt && attempt.status === 'SUBMITTED' ? (
                      <Button
                        onClick={() => viewResult(attempt.id, attempt.resultReleased)}
                        variant="outline"
                        disabled={!attempt.resultReleased}
                      >
                        {attempt.resultReleased ? 'Lihat Hasil' : 'Hasil Belum Dirilis'}
                      </Button>
                    ) : (
                      <Button onClick={() => setStartTarget(exam)} disabled={startM.isPending}>
                        Mulai Ujian
                      </Button>
                    )}
                  </>
                )}

                {examStatus === 'ENDED' && (
                  <>
                    {attempt ? (
                      <Button
                        onClick={() => viewResult(attempt.id, attempt.resultReleased)}
                        variant="outline"
                        disabled={!attempt.resultReleased}
                      >
                        {attempt.resultReleased ? 'Lihat Hasil' : 'Hasil Belum Dirilis'}
                      </Button>
                    ) : (
                      <Button disabled>Ujian Selesai</Button>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {visibleExams.length === 0 && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">Tidak ada ujian yang tersedia saat ini.</p>
          </CardContent>
        </Card>
      )}
      {visibleExams.length > 0 && list.length === 0 && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              Tidak ada ujian di kategori ini — coba pilihan lain.
            </p>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={!!startTarget}
        onOpenChange={(open) => {
          if (!open) setStartTarget(null);
        }}
        tone="primary"
        title={`Mulai "${startTarget?.title ?? 'ujian'}"?`}
        description={
          startTarget
            ? `${startTarget.items.length} soal · nilai maks ${startTarget.maxScore}` +
              `${startTarget.durationMinutes ? ` · durasi ${startTarget.durationMinutes} menit` : ''}. ` +
              'Selama ujian jangan berpindah tab/jendela — pelanggaran akan dicatat dan bisa mengunci attempt Anda.'
            : undefined
        }
        confirmLabel="Ya, mulai sekarang"
        pending={startM.isPending}
        onConfirm={() => startTarget && startExam(startTarget.id)}
      />
    </div>
  );
}
