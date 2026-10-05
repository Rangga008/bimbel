'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { CalendarClock, CircleAlert, MonitorCheck, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { apiFetch, ApiError } from '@/lib/api-client';
import type { ExamRow } from '@/lib/phase3c-types';
import { ProctorUnlockPanel } from '@/components/phase3d/proctor-unlock-manager';

function err(e: unknown, fb: string) {
  return e instanceof ApiError ? e.message : fb;
}

/**
 * Menu "Proctoring" — pusat pengawasan ujian, terpisah dari daftar ujian.
 * Berisi ujian yang sedang bisa diawasi (PUBLISHED) + panel attempt terkunci.
 */
export function ProctoringHubPage({ examBasePath }: { examBasePath: string }) {
  const router = useRouter();
  const examsQ = useQuery({
    queryKey: ['exams'],
    queryFn: () => apiFetch<ExamRow[]>('/exams'),
    refetchInterval: 30000,
  });

  if (examsQ.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (examsQ.isError) {
    return (
      <EmptyState
        icon={CircleAlert}
        title="Gagal memuat ujian"
        description={err(examsQ.error, 'Daftar ujian tidak bisa dimuat.')}
      />
    );
  }

  const live = (examsQ.data ?? [])
    .filter((e) => e.status === 'PUBLISHED')
    .sort(
      (a, b) =>
        new Date(a.scheduledEndAt).getTime() - new Date(b.scheduledEndAt).getTime(),
    );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Proctoring</h1>
        <p className="text-sm text-muted-foreground">
          Pusat pengawasan ujian — pilih ujian untuk melihat kelompok peserta dan
          status pengerjaan, atau buka attempt yang terkunci di bawah.
        </p>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Ujian Aktif (PUBLISHED)</h2>
        {live.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center text-sm text-muted-foreground">
              Tidak ada ujian yang sedang dipublikasikan.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {live.map((exam) => (
              <Card key={exam.id}>
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                      {exam.title}
                      <Badge variant="default">Dipublikasi</Badge>
                    </CardTitle>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        router.push(`${examBasePath}/${exam.id}/proctoring`)
                      }
                    >
                      <MonitorCheck /> Pantau Peserta
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <CalendarClock className="size-4" />
                      {new Date(exam.scheduledStartAt).toLocaleString('id-ID')} —{' '}
                      {new Date(exam.scheduledEndAt).toLocaleString('id-ID')}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Users className="size-4" />
                      {exam._count.attempts} attempt
                    </span>
                    {(exam.level || exam.subject) && (
                      <span>
                        {[exam.level?.name, exam.subject?.name]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <ProctorUnlockPanel />
    </div>
  );
}
