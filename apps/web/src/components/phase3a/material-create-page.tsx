'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { apiFetch, ApiError } from '@/lib/api-client';
import {
  drillBackFromUrl,
  tingkatCode,
  type HierarchyLevel,
} from '@/lib/content-taxonomy';
import { MaterialForm, emptyMaterialForm } from './material-form';

function err(e: unknown, fb: string) {
  return e instanceof ApiError ? e.message : fb;
}

/** Halaman "Tambah Materi" — halaman terpisah (bukan modal). */
export function MaterialCreatePage({
  basePath,
  initial,
}: {
  basePath: string;
  initial?: { levelId?: string; subjectId?: string; category?: string };
}) {
  const qc = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [form, setForm] = useState(() => ({
    ...emptyMaterialForm(),
    levelId: initial?.levelId ?? '',
    subjectId: initial?.subjectId ?? '',
    category: initial?.category ?? '',
  }));

  // Prefill dari drill-down: turunkan program dari jenjang yang dipilih.
  const levelsAllQ = useQuery({
    queryKey: ['levels-all'],
    queryFn: () => apiFetch<HierarchyLevel[]>('/levels'),
    enabled: !!initial?.levelId,
  });
  useEffect(() => {
    const lvl = levelsAllQ.data?.find((l) => l.id === form.levelId);
    if (lvl) {
      const tk = tingkatCode(lvl) ?? 'none';
      setForm((f) => ({
        ...f,
        tingkat: f.tingkat || tk,
        programId: f.programId || lvl.program?.id || '',
      }));
    }
  }, [levelsAllQ.data, form.levelId]);

  const saveM = useMutation({
    mutationFn: () =>
      apiFetch('/materials', {
        method: 'POST',
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
          examId: form.examId || undefined,
          latsolPackageId: form.latsolPackageId || undefined,
        },
      }),
    onSuccess: () => {
      toast.success('Materi berhasil ditambahkan.');
      qc.invalidateQueries({ queryKey: ['materials'] });
      router.push(
        drillBackFromUrl(basePath, (k) => searchParams.get(k), {
          tingkat: form.tingkat,
          levelId: form.levelId,
          subjectId: form.subjectId,
          category: form.category,
        }),
      );
    },
    onError: (e) => toast.error(err(e, 'Gagal menambahkan materi.')),
  });

  // Jenjang + mapel + tipe wajib — materi dikategorikan per jenjang.
  const isValid =
    !!form.title.trim() && !!form.levelId && !!form.subjectId && !!form.category;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tambah Materi</h1>
          <p className="text-sm text-muted-foreground">
            Upload materi untuk Program/Level/Kelompok tertentu.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() =>
            router.push(
              drillBackFromUrl(basePath, (k) => searchParams.get(k), {
                tingkat: form.tingkat,
                levelId: form.levelId,
                subjectId: form.subjectId,
                category: form.category,
              }),
            )
          }
        >
          Batal
        </Button>
      </div>

      <MaterialForm form={form} onChange={setForm} />

      <div className="flex items-center justify-end gap-2 sticky bottom-0 bg-background py-3 border-t">
        <Button disabled={!isValid || saveM.isPending} onClick={() => saveM.mutate()}>
          {saveM.isPending ? 'Menyimpan...' : 'Simpan Materi'}
        </Button>
      </div>
    </div>
  );
}
