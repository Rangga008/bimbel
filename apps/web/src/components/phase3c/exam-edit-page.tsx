'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch, ApiError } from '@/lib/api-client';
import type { ExamRow, UpdateExamDto } from '@/lib/phase3c-types';
import { drillBackFromUrl, tingkatCode } from '@/lib/content-taxonomy';
import { useContentLevels } from '@/components/shared/content-drilldown';
import { ExamForm, emptyExamForm, type ExamFormState } from './exam-form';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';

function err(e: unknown, fb: string) {
  return e instanceof ApiError ? e.message : fb;
}

function toForm(exam: ExamRow): ExamFormState {
  return {
    ...emptyExamForm(),
    category: exam.category ?? '',
    pickerFilters: {
      tingkat: '',
      category: exam.category ?? '',
      programId: exam.programId ?? '',
      levelId: exam.levelId ?? '',
      subjectId: exam.subjectId ?? '',
    },
    title: exam.title,
    description: exam.description || '',
    scheduledStartAt: exam.scheduledStartAt.slice(0, 16),
    scheduledEndAt: exam.scheduledEndAt.slice(0, 16),
    durationMinutes: exam.durationMinutes || undefined,
    proctoringEnabled: exam.proctoringEnabled ?? true,
    notes: exam.notes || '',
    questionIds: exam.items.map((item) => item.questionId),
    status: exam.status,
  };
}

function ExamEditForm({
  initial,
  examId,
  basePath,
}: {
  initial: ExamRow;
  examId: string;
  basePath: string;
}) {
  const qc = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [form, setForm] = useState<ExamFormState>(() => toForm(initial));
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Tingkat disimpan terpisah dari data — turunkan dari jenjang ujian.
  const levelsQ = useContentLevels();
  useEffect(() => {
    if (form.pickerFilters.tingkat || !form.pickerFilters.levelId) return;
    const lvl = levelsQ.data?.find((l) => l.id === form.pickerFilters.levelId);
    if (lvl)
      setForm((f) => ({
        ...f,
        pickerFilters: { ...f.pickerFilters, tingkat: tingkatCode(lvl) ?? 'none' },
      }));
  }, [levelsQ.data, form.pickerFilters.levelId, form.pickerFilters.tingkat]);

  const backUrl = drillBackFromUrl(basePath, (k) => searchParams.get(k), {
    tingkat: form.pickerFilters.tingkat,
    levelId: form.pickerFilters.levelId,
    subjectId: form.pickerFilters.subjectId,
    category: form.category,
  });

  const saveM = useMutation({
    mutationFn: () => {
      const body: UpdateExamDto = {
        programId: form.pickerFilters.programId || undefined,
        levelId: form.pickerFilters.levelId || undefined,
        subjectId: form.pickerFilters.subjectId || undefined,
        category: form.category || undefined,
        title: form.title,
        description: form.description || undefined,
        scheduledStartAt: form.scheduledStartAt,
        scheduledEndAt: form.scheduledEndAt,
        durationMinutes: form.durationMinutes,
        proctoringEnabled: form.proctoringEnabled,
        notes: form.notes || undefined,
        questionIds: form.questionIds,
        status: form.status,
      };
      return apiFetch(`/exams/${examId}`, { method: 'PATCH', body });
    },
    onSuccess: () => {
      toast.success('Ujian berhasil diperbarui.');
      qc.invalidateQueries({ queryKey: ['exams'] });
      router.push(backUrl);
    },
    onError: (e) => toast.error(err(e, 'Gagal memperbarui ujian.')),
  });

  const deleteM = useMutation({
    mutationFn: () => apiFetch(`/exams/${examId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Ujian dihapus.');
      qc.invalidateQueries({ queryKey: ['exams'] });
      router.push(backUrl);
    },
    onError: (e) => toast.error(err(e, 'Gagal menghapus ujian.')),
  });

  // Jenjang + mapel + tipe wajib — ujian dikategorikan per jenjang.
  const isValid =
    !!form.title.trim() &&
    !!form.pickerFilters.levelId &&
    !!form.pickerFilters.subjectId &&
    !!form.category &&
    !!form.scheduledStartAt &&
    !!form.scheduledEndAt &&
    form.questionIds.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Edit Ujian</h1>
          <p className="text-sm text-muted-foreground">
            Perbarui detail, status, atau daftar soal ujian ini.
          </p>
        </div>
        <Button variant="outline" onClick={() => router.push(backUrl)}>
          Batal
        </Button>
      </div>

      <ExamForm form={form} onChange={setForm} showStatus />

      <div className="flex items-center justify-between gap-2 sticky bottom-0 bg-background py-3 border-t">
        <Button
          type="button"
          variant="destructive"
          disabled={deleteM.isPending}
          onClick={() => setDeleteOpen(true)}
        >
          {deleteM.isPending ? 'Menghapus...' : 'Hapus Ujian'}
        </Button>
        <Button type="button" disabled={!isValid || saveM.isPending} onClick={() => saveM.mutate()}>
          {saveM.isPending ? 'Menyimpan...' : 'Simpan Perubahan'}
        </Button>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Hapus ujian ini?"
        description="Ujian beserta susunan soalnya akan dihapus permanen dan tidak dapat dikembalikan."
        confirmLabel="Ya, hapus"
        pending={deleteM.isPending}
        onConfirm={() => {
          setDeleteOpen(false);
          deleteM.mutate();
        }}
      />
    </div>
  );
}

/** Halaman "Edit Ujian" — halaman terpisah (bukan modal). */
export function ExamEditPage({ basePath, examId }: { basePath: string; examId: string }) {
  const examQ = useQuery({
    queryKey: ['exam', examId],
    queryFn: () => apiFetch<ExamRow>(`/exams/${examId}`),
  });

  if (examQ.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (examQ.isError || !examQ.data) {
    return <div className="text-sm text-destructive">{err(examQ.error, 'Gagal memuat ujian.')}</div>;
  }

  return <ExamEditForm initial={examQ.data} examId={examId} basePath={basePath} />;
}
