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
import { ExamForm, emptyExamForm, type ExamFormState } from './exam-form';

function err(e: unknown, fb: string) {
  return e instanceof ApiError ? e.message : fb;
}

/** Susun payload create/update dari state form — mode subtes vs mode biasa. */
export function buildExamPayload(form: ExamFormState) {
  const subtesMode = form.subtes.length > 0;
  return {
    programId: form.pickerFilters.programId || undefined,
    levelId: form.pickerFilters.levelId || undefined,
    subjectId: subtesMode ? undefined : form.pickerFilters.subjectId || undefined,
    category: form.category || undefined,
    title: form.title,
    description: form.description || undefined,
    scheduledStartAt: form.scheduledStartAt,
    scheduledEndAt: form.scheduledEndAt,
    durationMinutes: form.durationMinutes,
    proctoringEnabled: form.proctoringEnabled,
    showResultImmediately: form.showResultImmediately,
    notes: form.notes || undefined,
    groupIds: form.groupIds,
    // Selalu kirim `subtes` — array kosong membersihkan subtes lama saat
    // ujian yang tadinya multi-subtes diubah jadi ujian biasa.
    subtes: form.subtes.map((s) => ({
      name: s.name.trim(),
      subjectId: s.subjectId || s.pickerFilters.subjectId || undefined,
      durationMinutes: Number(s.durationMinutes) || 1,
    })),
    ...(subtesMode
      ? {
          items: form.subtes.flatMap((s, idx) =>
            s.questionIds.map((questionId) => ({ questionId, subtesIdx: idx })),
          ),
        }
      : { questionIds: form.questionIds }),
  };
}

/** Validasi form — subtes wajib nama + durasi + minimal 1 soal. */
export function examFormValid(form: ExamFormState): boolean {
  const baseOk =
    !!form.title.trim() &&
    !!form.pickerFilters.levelId &&
    !!form.category &&
    !!form.scheduledStartAt &&
    !!form.scheduledEndAt;
  if (!baseOk) return false;
  if (form.subtes.length > 0) {
    return form.subtes.every(
      (s) => s.name.trim() && Number(s.durationMinutes) > 0 && s.questionIds.length > 0,
    );
  }
  return !!form.pickerFilters.subjectId && form.questionIds.length > 0;
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
  const searchParams = useSearchParams();
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
        body: buildExamPayload(form),
      }),
    onSuccess: () => {
      toast.success('Ujian berhasil dibuat.');
      qc.invalidateQueries({ queryKey: ['exams'] });
      router.push(
        drillBackFromUrl(basePath, (k) => searchParams.get(k), {
          tingkat: form.pickerFilters.tingkat,
          levelId: form.pickerFilters.levelId,
          subjectId: form.pickerFilters.subjectId,
          category: form.category,
        }),
      );
    },
    onError: (e) => toast.error(err(e, 'Gagal membuat ujian.')),
  });

  // Jenjang + tipe wajib — ujian dikategorikan per jenjang; mapel wajib
  // hanya di mode biasa (mode subtes punya mapel per subtes).
  const isValid = examFormValid(form);

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
              drillBackFromUrl(basePath, (k) => searchParams.get(k), {
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
