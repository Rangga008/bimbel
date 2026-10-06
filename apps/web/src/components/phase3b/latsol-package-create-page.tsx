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
import { LatsolPackageForm, emptyLatsolPackageForm } from './latsol-package-form';

function err(e: unknown, fb: string) {
  return e instanceof ApiError ? e.message : fb;
}

/** Halaman "Buat Paket Latsol" — halaman terpisah (bukan modal). */
export function LatsolPackageCreatePage({
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
    ...emptyLatsolPackageForm(),
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
      apiFetch('/latsol/packages', {
        method: 'POST',
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
      toast.success('Paket latsol berhasil dibuat.');
      qc.invalidateQueries({ queryKey: ['latsol-packages'] });
      router.push(
        drillBackFromUrl(basePath, (k) => searchParams.get(k), {
          tingkat: form.tingkat,
          levelId: form.levelId,
          subjectId: form.subjectId,
          category: form.category,
        }),
      );
    },
    onError: (e) => toast.error(err(e, 'Gagal membuat paket latsol.')),
  });

  // Jenjang + mapel + tipe wajib — paket latsol dikategorikan per jenjang.
  const isValid =
    !!form.title.trim() && !!form.levelId && !!form.subjectId && !!form.category &&
    form.questionIds.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Buat Paket Latsol</h1>
          <p className="text-sm text-muted-foreground">Pilih soal dari bank soal untuk dikumpulkan menjadi paket latihan.</p>
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

      <LatsolPackageForm form={form} onChange={setForm} />

      <div className="flex items-center justify-end gap-2 sticky bottom-0 bg-background py-3 border-t">
        <Button disabled={!isValid || saveM.isPending} onClick={() => saveM.mutate()}>
          {saveM.isPending ? 'Menyimpan...' : 'Simpan Paket'}
        </Button>
      </div>
    </div>
  );
}
