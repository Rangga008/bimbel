'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ArrowLeft, FileQuestion, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { apiFetch, ApiError } from '@/lib/api-client';
import { ExamRow } from '@/lib/phase3c-types';
import { ExamForm } from '@/components/phase3c/exam-form';
import { ExamBacaanPanel } from '@/components/phase3c/exam-bacaan-panel';
import type { ExamFormState } from '@/components/phase3c/exam-form';
import { toForm } from '@/components/phase3c/exam-edit-page';
import { buildQuestionsPayload } from '@/components/phase3c/exam-create-page';

function err(e: unknown, fb: string) {
  return e instanceof ApiError ? e.message : fb;
}

/** Halaman Kelola Soal ujian — dipisah dari pengaturan (detail) supaya
 *  fokus: pilih/buat/impor soal lalu simpan. Dipakai admin & tutor. */
export function ExamQuestionsPage({
  basePath,
  examId,
}: {
  basePath: string;
  examId: string;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const [form, setForm] = useState<ExamFormState | null>(null);

  const examQ = useQuery({
    queryKey: ['exam', examId],
    queryFn: () => apiFetch<ExamRow>(`/exams/${examId}`),
  });

  useEffect(() => {
    if (examQ.data) setForm(toForm(examQ.data));
  }, [examQ.data]);

  const saveM = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch(`/exams/${examId}`, { method: 'PATCH', body }),
    onSuccess: async () => {
      toast.success('Soal ujian disimpan.');
      await qc.invalidateQueries({ queryKey: ['exams'] });
      await qc.invalidateQueries({ queryKey: ['exam', examId] });
      router.push(`${basePath}/${examId}/edit`);
    },
    onError: (e) => toast.error(err(e, 'Gagal menyimpan soal.')),
  });

  if (examQ.isLoading || !form || !examQ.data) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (examQ.isError) {
    return <EmptyState icon={FileQuestion} title="Ujian tidak ditemukan" />;
  }

  const exam = examQ.data;

  return (
    <div className="flex flex-col gap-4 pb-20">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-bold">
            <Button
              size="icon"
              variant="outline"
              onClick={() => router.push(`${basePath}/${examId}/edit`)}
              aria-label="Kembali ke pengaturan"
            >
              <ArrowLeft />
            </Button>
            Kelola Soal
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {exam.title} · {form.subtes.length > 0
              ? `${form.subtes.length} subtes`
              : 'ujian satu bagian'}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push(`${basePath}/${examId}/edit`)}
        >
          <Settings2 className="mr-1 h-4 w-4" /> Pengaturan Ujian
        </Button>
      </div>

      <ExamForm form={form} onChange={setForm} questionsOnly />

      <ExamBacaanPanel form={form} />

      <div className="sticky bottom-0 z-10 -mx-1 border-t bg-background/95 px-1 py-3 backdrop-blur">
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => router.push(`${basePath}/${examId}/edit`)}
          >
            Batal
          </Button>
          <Button
            disabled={saveM.isPending}
            onClick={() => saveM.mutate(buildQuestionsPayload(form))}
          >
            {saveM.isPending ? 'Menyimpan...' : 'Simpan Soal'}
          </Button>
        </div>
      </div>
    </div>
  );
}
