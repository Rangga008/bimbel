'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ArrowLeft, FileQuestion, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { apiFetch, ApiError } from '@/lib/api-client';
import { LatsolPackageForm, emptyLatsolPackageForm } from './latsol-package-form';
import type { LatsolPackageFormState } from './latsol-package-form';
import { tingkatCode } from '@/lib/content-taxonomy';
import { useContentLevels } from '@/components/shared/content-drilldown';

function err(e: unknown, fb: string) {
  return e instanceof ApiError ? e.message : fb;
}

interface LatsolPackageDetail {
  id: string;
  programId: string | null;
  levelId: string | null;
  subjectId: string | null;
  category: string | null;
  title: string;
  description: string | null;
  items: Array<{
    questionId: string;
    subtes: { id: string } | null;
  }>;
  subtes: Array<{
    id: string;
    name: string;
    subjectId: string | null;
    subject?: { id: string; name: string } | null;
  }>;
}

export function toLatsolForm(pkg: LatsolPackageDetail): LatsolPackageFormState {
  const subtes = pkg.subtes.map((s) => ({
    name: s.name,
    subjectId: s.subjectId ?? s.subject?.id ?? '',
    questionIds: pkg.items
      .filter((it) => it.subtes?.id === s.id)
      .map((it) => it.questionId),
  }));
  return {
    ...emptyLatsolPackageForm(),
    programId: pkg.programId ?? '',
    levelId: pkg.levelId ?? '',
    subjectId: pkg.subjectId ?? '',
    category: pkg.category ?? '',
    title: pkg.title,
    description: pkg.description ?? '',
    questionIds: subtes.length
      ? []
      : pkg.items.map((it) => it.questionId),
    subtes: subtes.map((s) => ({
      name: s.name,
      subjectId: s.subjectId,
      pickerFilters: {
        ...emptyLatsolPackageForm().pickerFilters,
        subjectId: s.subjectId,
      },
      questionIds: s.questionIds,
    })),
  };
}

/** Body PATCH konten — subtes mode bila ada, flat mode sebaliknya. */
export function buildLatsolContentsPayload(
  form: LatsolPackageFormState,
): Record<string, unknown> {
  if (form.subtes.length) {
    return {
      subtes: form.subtes.map((s) => ({
        name: s.name.trim() || 'Bagian',
        subjectId: s.subjectId || undefined,
        questionIds: s.questionIds,
      })),
    };
  }
  return { questionIds: form.questionIds };
}

/** Halaman Kelola Soal paket latsol — dipisah dari pengaturan (detail),
 *  sama seperti ujian: pilih/buat/impor soal per subtes lalu simpan. */
export function LatsolQuestionsPage({
  basePath,
  packageId,
}: {
  basePath: string;
  packageId: string;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const [form, setForm] = useState<LatsolPackageFormState | null>(null);

  const packageQ = useQuery({
    queryKey: ['latsol-package', packageId],
    queryFn: () => apiFetch<LatsolPackageDetail>(`/latsol/packages/${packageId}`),
  });

  useEffect(() => {
    if (packageQ.data) setForm(toLatsolForm(packageQ.data));
  }, [packageQ.data]);

  // Prefill tingkat dari jenjang paket agar filter picker konsisten.
  const levelsQ = useContentLevels();
  useEffect(() => {
    if (!form || form.tingkat || !form.levelId) return;
    const lvl = levelsQ.data?.find((l) => l.id === form.levelId);
    if (lvl) setForm((f) => (f ? { ...f, tingkat: tingkatCode(lvl) ?? 'none' } : f));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelsQ.data]);

  const saveM = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch(`/latsol/packages/${packageId}`, { method: 'PATCH', body }),
    onSuccess: async () => {
      toast.success('Soal paket latsol disimpan.');
      await qc.invalidateQueries({ queryKey: ['latsol-packages'] });
      await qc.invalidateQueries({ queryKey: ['latsol-package', packageId] });
      router.push(`${basePath}/${packageId}/edit`);
    },
    onError: (e) => toast.error(err(e, 'Gagal menyimpan soal.')),
  });

  if (packageQ.isLoading || !form || !packageQ.data) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (packageQ.isError) {
    return <EmptyState icon={FileQuestion} title="Paket latsol tidak ditemukan" />;
  }

  const pkg = packageQ.data;

  return (
    <div className="flex flex-col gap-4 pb-20">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-bold">
            <Button
              size="icon"
              variant="outline"
              onClick={() => router.push(`${basePath}/${packageId}/edit`)}
              aria-label="Kembali ke pengaturan"
            >
              <ArrowLeft />
            </Button>
            Kelola Soal
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {pkg.title} · {form.subtes.length > 0
              ? `${form.subtes.length} subtes`
              : 'paket satu bagian'}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push(`${basePath}/${packageId}/edit`)}
        >
          <Settings2 className="mr-1 h-4 w-4" /> Pengaturan Paket
        </Button>
      </div>

      <LatsolPackageForm form={form} onChange={setForm} questionsOnly />

      <div className="sticky bottom-0 z-10 -mx-1 border-t bg-background/95 px-1 py-3 backdrop-blur">
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => router.push(`${basePath}/${packageId}/edit`)}
          >
            Batal
          </Button>
          <Button
            disabled={saveM.isPending}
            onClick={() => saveM.mutate(buildLatsolContentsPayload(form))}
          >
            {saveM.isPending ? 'Menyimpan...' : 'Simpan Soal'}
          </Button>
        </div>
      </div>
    </div>
  );
}
