'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch, ApiError } from '@/lib/api-client';
import type { ProgramItem, QuestionRow } from '@/lib/phase3a-types';
import { drillBackFromUrl, tingkatCode } from '@/lib/content-taxonomy';
import { useContentLevels } from '@/components/shared/content-drilldown';
import { QuestionFormCard, type QuestionDraft } from './question-form-card';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';

function err(e: unknown, fb: string) {
  return e instanceof ApiError ? e.message : fb;
}

function questionToDraft(q: QuestionRow): QuestionDraft {
  // Dedup opsi berdasar konten — data korup lama (opsi dobel di DB) tidak
  // ikut terpelihara saat form dibuka & disimpan ulang.
  const seen = new Set<string>();
  return {
    tingkat: '',
    programId: q.programId ?? '',
    levelId: q.levelId ?? '',
    subjectId: q.subjectId ?? '',
    category: q.category ?? '',
    type: q.type as QuestionDraft['type'],
    content: q.content,
    imageUrl: q.imageUrl ?? '',
    difficulty: q.difficulty ?? '',
    points: q.points != null ? String(q.points) : '',
    explanation: q.explanation ?? '',
    explanationImageUrl: q.explanationImageUrl ?? '',
    answerKey: q.answerKey ?? '',
    isActive: q.isActive,
    options: q.options
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .filter((o) => {
        const key = `${o.content.trim().toLowerCase()}|${(o.imageUrl ?? '').trim()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((o) => ({
        id: o.id,
        content: o.content,
        imageUrl: o.imageUrl ?? undefined,
        isCorrect: o.isCorrect,
        sortOrder: o.sortOrder,
      })),
  };
}

/**
 * Form edit — dipisah sebagai komponen sendiri yang hanya di-mount SETELAH soal
 * selesai dimuat, supaya draft bisa diinisialisasi langsung dari data awal
 * (lazy `useState` initializer) tanpa perlu efek sinkronisasi terpisah.
 */
function QuestionEditForm({
  initial,
  questionId,
  basePath,
  programsData,
}: {
  initial: QuestionRow;
  questionId: string;
  basePath: string;
  programsData: ProgramItem[];
}) {
  const qc = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [draft, setDraft] = useState<QuestionDraft>(() => questionToDraft(initial));
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Tingkat disimpan terpisah dari data — turunkan dari jenjang soal.
  const levelsQ = useContentLevels();
  useEffect(() => {
    if (draft.tingkat || !draft.levelId) return;
    const lvl = levelsQ.data?.find((l) => l.id === draft.levelId);
    if (lvl) setDraft((d) => ({ ...d, tingkat: tingkatCode(lvl) ?? 'none' }));
  }, [levelsQ.data, draft.levelId, draft.tingkat]);

  const backUrl = drillBackFromUrl(basePath, (k) => searchParams.get(k), {
    tingkat: draft.tingkat,
    levelId: draft.levelId,
    subjectId: draft.subjectId,
    category: draft.category,
  });

  const saveM = useMutation({
    mutationFn: () =>
      apiFetch<QuestionRow>(`/questions/${questionId}`, {
        method: 'PATCH',
        body: {
          programId: draft.programId || undefined,
          levelId: draft.levelId || undefined,
          subjectId: draft.subjectId || undefined,
          category: draft.category || undefined,
          type: draft.type,
          content: draft.content,
          imageUrl: draft.imageUrl || undefined,
          difficulty: draft.difficulty || undefined,
          points: draft.points ? Number(draft.points) : undefined,
          explanation: draft.explanation || undefined,
          explanationImageUrl: draft.explanationImageUrl || undefined,
          answerKey: draft.answerKey || undefined,
          isActive: draft.isActive,
          options: draft.options,
        },
      }),
    onSuccess: () => {
      toast.success('Soal berhasil diperbarui.');
      qc.invalidateQueries({ queryKey: ['questions'] });
      qc.invalidateQueries({ queryKey: ['question', questionId] });
      qc.invalidateQueries({ queryKey: ['questions-summary'] });
      router.push(backUrl);
    },
    onError: (e) => toast.error(err(e, 'Gagal memperbarui soal.')),
  });

  const deleteM = useMutation({
    mutationFn: () => apiFetch(`/questions/${questionId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Soal dihapus.');
      qc.invalidateQueries({ queryKey: ['questions'] });
      qc.invalidateQueries({ queryKey: ['questions-summary'] });
      router.push(backUrl);
    },
    onError: (e) => toast.error(err(e, 'Gagal menghapus soal.')),
  });

  const needsOptions =
    draft.type === 'SINGLE_CHOICE' || draft.type === 'MULTIPLE_CHOICE' || draft.type === 'TRUE_FALSE';
  const isValid =
    // Jenjang + mapel + tipe wajib — bank soal dikategorikan per jenjang.
    !!draft.levelId && !!draft.subjectId && !!draft.category &&
    !!draft.content.trim() &&
    !(
      needsOptions &&
      (draft.options.length === 0 ||
        !draft.options.every((o) => o.content.trim() || o.imageUrl) ||
        (draft.type !== 'MULTIPLE_CHOICE' && draft.options.filter((o) => o.isCorrect).length > 1))
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Edit Soal</h1>
          <p className="text-sm text-muted-foreground">Perbarui konten, opsi, atau solusi soal ini.</p>
        </div>
        <Button variant="outline" onClick={() => router.push(backUrl)}>
          Batal
        </Button>
      </div>

      <QuestionFormCard index={0} draft={draft} onChange={setDraft} programsData={programsData} showActive />

      <div className="flex items-center justify-between gap-2 sticky bottom-0 bg-background py-3 border-t">
        <Button
          type="button"
          variant="destructive"
          disabled={deleteM.isPending}
          onClick={() => setDeleteOpen(true)}
        >
          {deleteM.isPending ? 'Menghapus...' : 'Hapus Soal'}
        </Button>
        <Button type="button" disabled={!isValid || saveM.isPending} onClick={() => saveM.mutate()}>
          {saveM.isPending ? 'Menyimpan...' : 'Simpan Perubahan'}
        </Button>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Hapus soal ini?"
        description="Soal akan dihapus permanen dari bank soal dan tidak dapat dikembalikan."
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

/** Halaman "Edit Soal" — halaman terpisah (bukan modal), 1 soal per halaman. */
export function QuestionEditPage({ basePath, questionId }: { basePath: string; questionId: string }) {
  const questionQ = useQuery({
    queryKey: ['question', questionId],
    queryFn: () => apiFetch<QuestionRow>(`/questions/${questionId}`),
  });

  const programsQ = useQuery({
    queryKey: ['programs-lite'],
    queryFn: () => apiFetch<ProgramItem[]>('/programs'),
  });

  if (questionQ.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (questionQ.isError || !questionQ.data) {
    return (
      <div className="text-sm text-destructive">
        {err(questionQ.error, 'Gagal memuat soal.')}
      </div>
    );
  }

  return (
    <QuestionEditForm
      initial={questionQ.data}
      questionId={questionId}
      basePath={basePath}
      programsData={programsQ.data || []}
    />
  );
}
