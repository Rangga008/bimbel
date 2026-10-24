'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { KeyRound, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch, ApiError } from '@/lib/api-client';
import type { ExamRow, UpdateExamDto } from '@/lib/phase3c-types';
import { drillBackFromUrl, tingkatCode } from '@/lib/content-taxonomy';
import { useContentLevels } from '@/components/shared/content-drilldown';
import { ExamForm, emptyExamForm, emptySubtes, type ExamFormState } from './exam-form';
import { buildExamPayload, examFormValid } from './exam-create-page';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';

function err(e: unknown, fb: string) {
  return e instanceof ApiError ? e.message : fb;
}

function toForm(exam: ExamRow): ExamFormState {
  const hasSubtes = (exam.subtes?.length ?? 0) > 0;
  const basePicker = {
    tingkat: '',
    category: exam.category ?? '',
    programId: exam.programId ?? '',
    levelId: exam.levelId ?? '',
  };
  return {
    ...emptyExamForm(),
    category: exam.category ?? '',
    pickerFilters: { ...basePicker, subjectId: exam.subjectId ?? '' },
    title: exam.title,
    description: exam.description || '',
    scheduledStartAt: exam.scheduledStartAt.slice(0, 16),
    scheduledEndAt: exam.scheduledEndAt.slice(0, 16),
    durationMinutes: exam.durationMinutes || undefined,
    proctoringEnabled: exam.proctoringEnabled ?? true,
    showResultImmediately: exam.showResultImmediately ?? false,
    notes: exam.notes || '',
    // Mode subtes → soal dipetakan per subtesId; mode biasa → semua item.
    subtes: hasSubtes
      ? (exam.subtes ?? []).map((s) => ({
          ...emptySubtes({ ...basePicker, subjectId: s.subjectId ?? '' }),
          name: s.name,
          durationMinutes: String(s.durationMinutes),
          subjectId: s.subjectId ?? '',
          questionIds: exam.items
            .filter((it) => it.subtesId === s.id)
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((it) => it.questionId),
        }))
      : [],
    questionIds: exam.items
      .filter((it) => !it.subtesId)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((item) => item.questionId),
    groupIds: (exam.groups ?? []).map((g) => g.groupId ?? g.group?.id).filter(Boolean) as string[],
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
        ...buildExamPayload(form),
        // Status dikirim hanya bila berubah — mengirim status ENDED/LOCKED
        // apa adanya memicu validasi transisi di server.
        status: form.status !== initial.status ? form.status : undefined,
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

  const regenCodeM = useMutation({
    mutationFn: () =>
      apiFetch<{ accessCode: string }>(`/exams/${examId}/access-code/regenerate`, {
        method: 'POST',
      }),
    onSuccess: (d) => {
      toast.success(`Kode akses baru: ${d.accessCode}`);
      qc.setQueryData(['exam', examId], (old: ExamRow | undefined) =>
        old ? { ...old, accessCode: d.accessCode } : old,
      );
      qc.invalidateQueries({ queryKey: ['exams'] });
    },
    onError: (e) => toast.error(err(e, 'Gagal membuat ulang kode akses.')),
  });

  // Jenjang + tipe wajib; mapel hanya wajib di mode biasa.
  const isValid = examFormValid(form);

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

      {/* Kode akses — dibagikan ke peserta luar; mereka memasukkannya di
          halaman Ujian untuk membuka akses tanpa jadi anggota kelompok. */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3">
        <KeyRound className="size-5 shrink-0 text-brand-gold-700" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Kode Akses Ujian</p>
          <p className="text-xs text-muted-foreground">
            Bagikan ke peserta luar — mereka memasukkannya di halaman Ujian untuk ikut mengerjakan.
          </p>
        </div>
        <button
          type="button"
          title="Klik untuk menyalin"
          onClick={() => {
            if (initial.accessCode) {
              navigator.clipboard?.writeText(initial.accessCode);
              toast.success('Kode akses disalin.');
            }
          }}
          className="rounded-md border bg-background px-3 py-1.5 font-mono text-lg font-semibold tracking-[0.3em] hover:bg-muted"
        >
          {initial.accessCode ?? '—'}
        </button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={regenCodeM.isPending}
          onClick={() => regenCodeM.mutate()}
        >
          <RefreshCw className="size-4" /> Buat Ulang
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
