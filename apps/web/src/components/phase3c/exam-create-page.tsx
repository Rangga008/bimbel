'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { apiFetch, ApiError } from '@/lib/api-client';
import {
  drillBackUrl,
  tingkatCode,
  type HierarchyLevel,
} from '@/lib/content-taxonomy';
import { ExamForm, emptyExamForm } from './exam-form';

function err(e: unknown, fb: string) {
  return e instanceof ApiError ? e.message : fb;
}

/** Halaman "Buat Ujian" — halaman terpisah (bukan modal). */
export function ExamCreatePage({
  basePath,
  initial,
}: {
  basePath: string;
  initial?: { levelId?: string; subjectId?: string; category?: string; programId?: string };
}) {
  const qc = useQueryClient();
  const router = useRouter();
  const [form, setForm] = useState(() => {
    const f = emptyExamForm();
    f.category = initial?.category ?? '';
    f.pickerFilters = {
      ...f.pickerFilters,
      levelId: initial?.levelId ?? '',
      subjectId: initial?.subjectId ?? '',
    };
    return f;
  });

  // Prefill dari drill-down: turunkan program dari jenjang yang dipilih.
  const levelsAllQ = useQuery({
    queryKey: ['levels-all'],
    queryFn: () => apiFetch<HierarchyLevel[]>('/levels'),
    enabled: !!initial?.levelId,
  });
  useEffect(() => {
    const lvl = levelsAllQ.data?.find((l) => l.id === form.pickerFilters.levelId);
    if (lvl) {
      const tk = tingkatCode(lvl) ?? 'none';
      setForm((f) => ({
        ...f,
        pickerFilters: {
          ...f.pickerFilters,
          tingkat: f.pickerFilters.tingkat || tk,
          programId: f.pickerFilters.programId || lvl.program?.id || '',
        },
      }));
    }
  }, [levelsAllQ.data, form.pickerFilters.levelId]);

  const saveM = useMutation({
    mutationFn: () =>
      apiFetch('/exams', {
        method: 'POST',
        body: {
          programId: form.pickerFilters.programId || undefined,
          levelId: form.pickerFilters.levelId || undefined,
          subjectId: form.pickerFilters.subjectId || undefined,
          category: form.category || undefined,
          title: form.title,
          description: form.description || undefined,
          scheduledStartAt: form.scheduledStartAt,
          scheduledEndAt: form.scheduledEndAt,
          durationMinutes: form.durationMinutes,
          notes: form.notes || undefined,
          questionIds: form.questionIds,
        },
      }),
    onSuccess: () => {
      toast.success('Ujian berhasil dibuat.');
      qc.invalidateQueries({ queryKey: ['exams'] });
      router.push(
        drillBackUrl(basePath, {
          tingkat: form.pickerFilters.tingkat,
          levelId: form.pickerFilters.levelId,
          subjectId: form.pickerFilters.subjectId,
          category: form.category,
        }),
      );
    },
    onError: (e) => toast.error(err(e, 'Gagal membuat ujian.')),
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
          <h1 className="text-2xl font-semibold tracking-tight">Buat Ujian</h1>
          <p className="text-sm text-muted-foreground">
            Ujian baru disimpan sebagai <strong>Draft</strong> — belum terlihat siswa sampai dipublikasikan.
            Jadwal mulai/selesai bersifat global (server-authoritative).
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() =>
            router.push(
              drillBackUrl(basePath, {
                tingkat: form.pickerFilters.tingkat,
                levelId: form.pickerFilters.levelId,
                subjectId: form.pickerFilters.subjectId,
                category: form.category,
              }),
            )
          }
        >
          Batal
        </Button>
      </div>

      <ExamForm form={form} onChange={setForm} />

      <div className="flex items-center justify-end gap-2 sticky bottom-0 bg-background py-3 border-t">
        <Button disabled={!isValid || saveM.isPending} onClick={() => saveM.mutate()}>
          {saveM.isPending ? 'Menyimpan...' : 'Simpan sebagai Draft'}
        </Button>
      </div>
    </div>
  );
}
