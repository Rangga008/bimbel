'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch, ApiError } from '@/lib/api-client';
import { LatsolPackageForm, type LatsolPackageFormState } from './latsol-package-form';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';

function err(e: unknown, fb: string) {
  return e instanceof ApiError ? e.message : fb;
}

interface LatsolPackageDetail {
  id: string;
  programId: string | null;
  levelId: string | null;
  subjectId: string | null;
  category?: string | null;
  title: string;
  description: string | null;
  isActive: boolean;
  items: Array<{ questionId: string }>;
}

function toForm(pkg: LatsolPackageDetail): LatsolPackageFormState {
  return {
    programId: pkg.programId ?? '',
    levelId: pkg.levelId ?? '',
    subjectId: pkg.subjectId ?? '',
    category: pkg.category ?? '',
    title: pkg.title,
    description: pkg.description ?? '',
    questionIds: pkg.items.map((it) => it.questionId),
  };
}

function LatsolPackageEditForm({
  initial,
  packageId,
  basePath,
}: {
  initial: LatsolPackageDetail;
  packageId: string;
  basePath: string;
}) {
  const qc = useQueryClient();
  const router = useRouter();
  const [form, setForm] = useState<LatsolPackageFormState>(() => toForm(initial));
  const [deleteOpen, setDeleteOpen] = useState(false);

  const saveM = useMutation({
    mutationFn: () =>
      apiFetch(`/latsol/packages/${packageId}`, {
        method: 'PATCH',
        body: {
          programId: form.programId || undefined,
          levelId: form.levelId || undefined,
          subjectId: form.subjectId || undefined,
          category: form.category || undefined,
          title: form.title,
          description: form.description || undefined,
          questionIds: form.questionIds,
        },
      }),
    onSuccess: () => {
      toast.success('Paket latsol berhasil diperbarui.');
      qc.invalidateQueries({ queryKey: ['latsol-packages'] });
      qc.invalidateQueries({ queryKey: ['latsol-package', packageId] });
      router.push(basePath);
    },
    onError: (e) => toast.error(err(e, 'Gagal memperbarui paket latsol.')),
  });

  const deleteM = useMutation({
    mutationFn: () => apiFetch(`/latsol/packages/${packageId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Paket latsol dihapus.');
      qc.invalidateQueries({ queryKey: ['latsol-packages'] });
      router.push(basePath);
    },
    onError: (e) => toast.error(err(e, 'Gagal menghapus paket latsol.')),
  });

  // Jenjang + mapel + tipe wajib — paket latsol dikategorikan per jenjang.
  const isValid =
    !!form.title.trim() && !!form.levelId && !!form.subjectId && !!form.category &&
    form.questionIds.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Edit Paket Latsol</h1>
          <p className="text-sm text-muted-foreground">Perbarui detail paket atau daftar soal di dalamnya.</p>
        </div>
        <Button variant="outline" onClick={() => router.push(basePath)}>
          Batal
        </Button>
      </div>

      <LatsolPackageForm form={form} onChange={setForm} />

      <div className="flex items-center justify-between gap-2 sticky bottom-0 bg-background py-3 border-t">
        <Button
          type="button"
          variant="destructive"
          disabled={deleteM.isPending}
          onClick={() => setDeleteOpen(true)}
        >
          {deleteM.isPending ? 'Menghapus...' : 'Hapus Paket'}
        </Button>
        <Button type="button" disabled={!isValid || saveM.isPending} onClick={() => saveM.mutate()}>
          {saveM.isPending ? 'Menyimpan...' : 'Simpan Perubahan'}
        </Button>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Hapus paket latsol ini?"
        description="Paket latsol akan dihapus permanen dan tidak dapat dikembalikan."
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

/** Halaman "Edit Paket Latsol" — halaman terpisah (bukan modal). */
export function LatsolPackageEditPage({ basePath, packageId }: { basePath: string; packageId: string }) {
  const packageQ = useQuery({
    queryKey: ['latsol-package', packageId],
    queryFn: () => apiFetch<LatsolPackageDetail>(`/latsol/packages/${packageId}`),
  });

  if (packageQ.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (packageQ.isError || !packageQ.data) {
    return <div className="text-sm text-destructive">{err(packageQ.error, 'Gagal memuat paket latsol.')}</div>;
  }

  return <LatsolPackageEditForm initial={packageQ.data} packageId={packageId} basePath={basePath} />;
}
