'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch, ApiError } from '@/lib/api-client';
import { ExamAttempt, ExamRow, ExamStatus } from '@/lib/phase3c-types';
import { useRouter } from 'next/navigation';

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

  const dataQ = useQuery({
    queryKey: ['exams-with-my-attempts'],
    queryFn: fetchExamsWithAttempts,
  });

  const startM = useMutation({
    mutationFn: (examId: string) => apiFetch<{ id: string }>('/exam-attempts/start', { method: 'POST', body: { examId } }),
    onSuccess: (data) => router.push(`/siswa/ujian/${data.id}`),
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
    const variants = {
      DRAFT: 'secondary',
      PUBLISHED: 'default',
      LOCKED: 'destructive',
    } as const;
    return <Badge variant={variants[status]}>{status}</Badge>;
  };

  const getExamStatus = (exam: ExamRow) => {
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
  const publishedExams = exams.filter((exam) => exam.status === 'PUBLISHED');

  const startExam = (examId: string) => {
    qc.invalidateQueries({ queryKey: ['exams-with-my-attempts'] });
    startM.mutate(examId);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Ujian Tersedia</h1>

      <div className="grid gap-4">
        {publishedExams.map((exam) => {
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
                    <div className="text-muted-foreground">Nilai Maks</div>
                    <div>{exam.maxScore}</div>
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
                      <Button onClick={() => startExam(exam.id)} disabled={startM.isPending}>
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

      {publishedExams.length === 0 && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">Tidak ada ujian yang tersedia saat ini.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
