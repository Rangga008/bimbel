'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch, ApiError } from '@/lib/api-client';
import type { MaterialRow } from '@/lib/phase3a-types';
import { MaterialForm, type MaterialFormState } from './material-form';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';

function err(e: unknown, fb: string) {
  return e instanceof ApiError ? e.message : fb;
}

function toForm(m: MaterialRow): MaterialFormState {
  return {
    tingkat: '',
    programId: m.programId ?? '',
    levelId: m.levelId ?? '',
    groupId: m.groupId ?? '',
    subjectId: m.subjectId ?? '',
    category: m.category ?? '',
    title: m.title,
    description: m.description ?? '',
    content: m.content ?? '',
    imageUrl: m.imageUrl ?? '',
    fileUrl: m.fileUrl ?? '',
    fileType: m.fileType ?? '',
    fileSize: m.fileSize != null ? String(m.fileSize) : '',
    isActive: m.isActive,
  };
}

function MaterialEditForm({
  initial,
  materialId,
  basePath,
}: {
  initial: MaterialRow;
  materialId: string;
  basePath: string;
}) {
  const qc = useQueryClient();
  const router = useRouter();
  const [form, setForm] = useState<MaterialFormState>(() => toForm(initial));
  const [deleteOpen, setDeleteOpen] = useState(false);

  const saveM = useMutation({
    mutationFn: () =>
      apiFetch(`/materials/${materialId}`, {
        method: 'PATCH',
        body: {
          programId: form.programId || undefined,
          levelId: form.levelId || undefined,
          groupId: form.groupId || undefined,
          subjectId: form.subjectId || undefined,
          category: form.category || undefined,
          title: form.title,
          description: form.description || undefined,
          content: form.content || undefined,
          imageUrl: form.imageUrl || undefined,
          fileUrl: form.fileUrl || undefined,
          fileType: form.fileType || undefined,
          fileSize: form.fileSize ? Number(form.fileSize) : undefined,
          isActive: form.isActive,
        },
      }),
    onSuccess: () => {
      toast.success('Materi berhasil diperbarui.');
      qc.invalidateQueries({ queryKey: ['materials'] });
      router.push(basePath);
    },
    onError: (e) => toast.error(err(e, 'Gagal memperbarui materi.')),
  });

  const deleteM = useMutation({
    mutationFn: () => apiFetch(`/materials/${materialId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Materi dihapus.');
      qc.invalidateQueries({ queryKey: ['materials'] });
      router.push(basePath);
    },
    onError: (e) => toast.error(err(e, 'Gagal menghapus materi.')),
  });

  // Jenjang + mapel + tipe wajib — materi dikategorikan per jenjang.
  const isValid =
    !!form.title.trim() && !!form.levelId && !!form.subjectId && !!form.category;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Edit Materi</h1>
          <p className="text-sm text-muted-foreground">Perbarui detail materi ini.</p>
        </div>
        <Button variant="outline" onClick={() => router.push(basePath)}>
          Batal
        </Button>
      </div>

      <MaterialForm form={form} onChange={setForm} showActive />

      <div className="flex items-center justify-between gap-2 sticky bottom-0 bg-background py-3 border-t">
        <Button
          type="button"
          variant="destructive"
          disabled={deleteM.isPending}
          onClick={() => setDeleteOpen(true)}
        >
          {deleteM.isPending ? 'Menghapus...' : 'Hapus Materi'}
        </Button>
        <Button type="button" disabled={!isValid || saveM.isPending} onClick={() => saveM.mutate()}>
          {saveM.isPending ? 'Menyimpan...' : 'Simpan Perubahan'}
        </Button>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Hapus materi ini?"
        description="Materi akan dihapus permanen dan tidak dapat dikembalikan."
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

/** Halaman "Edit Materi" — halaman terpisah (bukan modal). */
export function MaterialEditPage({ basePath, materialId }: { basePath: string; materialId: string }) {
  const materialQ = useQuery({
    queryKey: ['material', materialId],
    queryFn: () => apiFetch<MaterialRow>(`/materials/${materialId}`),
  });

  if (materialQ.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (materialQ.isError || !materialQ.data) {
    return <div className="text-sm text-destructive">{err(materialQ.error, 'Gagal memuat materi.')}</div>;
  }

  return <MaterialEditForm initial={materialQ.data} materialId={materialId} basePath={basePath} />;
}
