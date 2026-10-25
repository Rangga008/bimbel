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

/** datetime-local (waktu lokal/WIB admin) → ISO UTC untuk disimpan server. */
export function localInputToIso(v: string): string {
  return v ? new Date(v).toISOString() : v;
}

/** ISO UTC dari server → nilai input datetime-local (waktu lokal). */
export function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Susun payload create/update dari state form — mode subtes vs mode biasa. */
export function buildExamPayload(form: ExamFormState) {
  const subtesMode = form.subtes.length > 0;
  return {
    // null (bukan undefined) supaya field benar-benar dikosongkan saat
    // disimpan — undefined berarti "jangan ubah" sehingga nilai lama balik.
    programId: form.pickerFilters.programId || null,
    levelId: form.pickerFilters.levelId || null,
    subjectId: subtesMode ? null : form.pickerFilters.subjectId || null,
    category: form.category || undefined,
    title: form.title,
    description: form.description || undefined,
    scheduledStartAt: localInputToIso(form.scheduledStartAt),
    scheduledEndAt: localInputToIso(form.scheduledEndAt),
    durationMinutes: form.durationMinutes,
    proctoringEnabled: form.proctoringEnabled,
    showResultImmediately: form.showResultImmediately,
    isPublic: form.isPublic,
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

/** Payload khusus bagian soal — dipakai halaman Kelola Soal (PATCH). */
export function buildQuestionsPayload(form: ExamFormState) {
  return form.subtes.length > 0
    ? {
        items: form.subtes.flatMap((s, idx) =>
          s.questionIds.map((questionId) => ({ questionId, subtesIdx: idx })),
        ),
      }
    : { questionIds: form.questionIds };
}

/** Validasi pengaturan ujian — tanpa soal (soal diatur di halaman detail).
 *  Subtes wajib nama + durasi; soalnya ditambah belakangan. */
export function examSettingsValid(form: ExamFormState): boolean {
  const baseOk =
    !!form.title.trim() &&
    !!form.category &&
    !!form.scheduledStartAt &&
    !!form.scheduledEndAt &&
    new Date(form.scheduledEndAt) > new Date(form.scheduledStartAt);
  if (!baseOk) return false;
  if (form.subtes.length > 0) {
    return form.subtes.every((s) => s.name.trim() && Number(s.durationMinutes) > 0);
  }
  return true;
}

/** Validasi form lengkap — subtes wajib nama + durasi + minimal 1 soal. */
export function examFormValid(form: ExamFormState): boolean {
  if (!examSettingsValid(form)) return false;
  if (form.subtes.length > 0) {
    return form.subtes.every((s) => s.questionIds.length > 0);
  }
  // Mapel opsional — ujian campuran/try out boleh tanpa mapel tunggal.
  return form.questionIds.length > 0;
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

  const backUrl = () =>
    drillBackFromUrl(basePath, (k) => searchParams.get(k), {
      tingkat: form.pickerFilters.tingkat,
      levelId: form.pickerFilters.levelId,
      subjectId: form.pickerFilters.subjectId,
      category: form.category,
    });

  const saveM = useMutation({
    mutationFn: () =>
      apiFetch<{ id: string }>('/exams', {
        method: 'POST',
        body: buildExamPayload(form),
      }),
    // Langkah 2: buka halaman detail — di sanalah soal ditambah/diimpor.
    onSuccess: (created) => {
      toast.success('Ujian dibuat — sekarang tambahkan soalnya di halaman detail.');
      qc.invalidateQueries({ queryKey: ['exams'] });
      router.push(`${basePath}/${created.id}/edit`);
    },
    onError: (e) => toast.error(err(e, 'Gagal membuat ujian.')),
  });

  // Jenjang + tipe + jadwal wajib; soal tidak wajib di langkah ini.
  const isValid = examSettingsValid(form);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Buat Ujian</h1>
          <p className="text-sm text-muted-foreground">
            <strong>Langkah 1 dari 2</strong> — atur detail ujian (judul, jadwal, subtes, peserta).
            Setelah tersimpan, Anda diarahkan ke halaman detail untuk menambah, mengedit,
            dan mengimpor soal. Ujian disimpan sebagai <strong>Draft</strong>.
          </p>
        </div>
        <Button variant="outline" onClick={() => router.push(backUrl())}>
          Batal
        </Button>
      </div>

      <ExamForm form={form} onChange={setForm} withQuestions={false} />

      <div className="flex items-center justify-end gap-2 sticky bottom-0 bg-background py-3 border-t">
        <Button disabled={!isValid || saveM.isPending} onClick={() => saveM.mutate()}>
          {saveM.isPending ? 'Menyimpan...' : 'Buat & Lanjut Atur Soal'}
        </Button>
      </div>
    </div>
  );
}
