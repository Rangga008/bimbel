"use client";

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CalendarClock, CircleAlert, FileCheck2, FileQuestion, Pencil, Plus, Settings2, Star, Trash2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { apiFetch, ApiError } from '@/lib/api-client';
import { ExamRow, ExamStatus } from '@/lib/phase3c-types';
import { useAuthStore } from '@/stores/auth-store';
import { ProctorUnlockPanel } from '@/components/phase3d/proctor-unlock-manager';
import { ContentDrilldown, DrillBreadcrumb, useContentCategories, useContentLevels } from '@/components/shared/content-drilldown';
import { ContentCategoriesManager } from '@/components/shared/content-categories-manager';
import { Phase1aSelectField } from '@/components/phase1a/phase1a-form-dialog';
import {
  applyDrill,
  categoryLabel,
  categoryOptions,
  drillDone,
  DRILL_ALL,
  DRILL_EMPTY,
  DRILL_NONE,
  type DrillValue,
} from '@/lib/content-taxonomy';
import { Tag } from 'lucide-react';

interface ExamsManagerProps {
  canManage: boolean;
  basePath?: string;
}

function err(e: unknown, fb: string) {
  return e instanceof ApiError ? e.message : fb;
}

/** Daftar ujian — buat/edit lewat halaman terpisah di bawah basePath. */
export function ExamsManager({ canManage, basePath = '/ujian' }: ExamsManagerProps) {
  const qc = useQueryClient();
  const router = useRouter();
  const me = useAuthStore((s) => s.user);
  const canUnlockProctoring = me?.permissions.includes('exam_proctor.unlock') ?? false;
  const [drill, setDrill] = useState<DrillValue>({ ...DRILL_EMPTY });
  const [catFilter, setCatFilter] = useState('');

  const examsQ = useQuery({
    queryKey: ['exams'],
    queryFn: () => apiFetch<ExamRow[]>('/exams'),
  });

  const levelsQ = useContentLevels();
  const catsQ = useContentCategories();
  const [manageCats, setManageCats] = useState(false);
  const levels = levelsQ.data;

  const deleteM = useMutation({
    mutationFn: (id: string) => apiFetch(`/exams/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Ujian dihapus.');
      qc.invalidateQueries({ queryKey: ['exams'] });
    },
    onError: (e) => toast.error(err(e, 'Gagal menghapus ujian.')),
  });

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const handleDelete = (id: string) => {
    if (!canManage) return;
    setDeleteTarget(id);
  };

  const getStatusBadge = (status: ExamStatus) => {
    const variants = {
      DRAFT: 'secondary',
      PUBLISHED: 'default',
      LOCKED: 'destructive',
    } as const;
    return <Badge variant={variants[status]}>{status}</Badge>;
  };

  if (examsQ.isLoading) {
    return <Skeleton className="h-24 w-full" />;
  }

  if (examsQ.isError) {
    return (
      <EmptyState
        icon={CircleAlert}
        title="Gagal memuat ujian"
        description={err(examsQ.error, 'Gagal memuat daftar ujian.')}
      />
    );
  }

  const allExams = examsQ.data ?? [];
  const exams = applyDrill(allExams, drill, levels).filter(
    (e) => !catFilter || e.category === catFilter,
  );
  const done = drillDone(drill);

  const createUrl = () => {
    const p = new URLSearchParams();
    if (drill.levelId && drill.levelId !== DRILL_ALL && drill.levelId !== DRILL_NONE) p.set('levelId', drill.levelId);
    if (drill.subjectId && drill.subjectId !== DRILL_ALL && drill.subjectId !== DRILL_NONE) p.set('subjectId', drill.subjectId);
    if (drill.category && drill.category !== DRILL_ALL && drill.category !== DRILL_NONE) p.set('category', drill.category);
    const qs = p.toString();
    return `${basePath}/baru${qs ? `?${qs}` : ''}`;
  };

  // Landing drill-down: Jenjang → Mapel → Tipe.
  if (!done) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Ujian</h1>
            <p className="text-sm text-muted-foreground">Ujian dikategorikan per jenjang → mapel → tipe.</p>
          </div>
          {canManage && (
            <Button onClick={() => router.push(`${basePath}/baru`)}>
              <Plus /> Buat Ujian
            </Button>
          )}
        </div>
        {canUnlockProctoring && (
          <Card>
            <CardContent className="pt-6">
              <ProctorUnlockPanel />
            </CardContent>
          </Card>
        )}
        <ContentDrilldown
          items={allExams}
          levels={levels}
          value={drill}
          onChange={setDrill}
          itemNoun="Ujian"
          loading={examsQ.isLoading || levelsQ.isLoading}
          onManageCategories={canManage ? () => setManageCats(true) : undefined}
        />
        <ContentCategoriesManager open={manageCats} onOpenChange={setManageCats} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <DrillBreadcrumb items={allExams} levels={levels} value={drill} onChange={setDrill} />
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Ujian</h1>
        </div>
        {canManage && (
          <Button onClick={() => router.push(createUrl())}>
            <Plus /> Buat Ujian
          </Button>
        )}
      </div>

      {canUnlockProctoring && (
        <Card>
          <CardContent className="pt-6">
            <ProctorUnlockPanel />
          </CardContent>
        </Card>
      )}

      <div className="w-full sm:w-52">
        <Phase1aSelectField
          id="exam-cat"
          label="Kategori"
          value={catFilter}
          onChange={setCatFilter}
          options={categoryOptions(catsQ.data)}
          placeholder="Semua kategori"
        />
      </div>

      {exams.length === 0 && (
        <EmptyState
          icon={FileCheck2}
          title="Belum ada ujian"
          description="Belum ada ujian yang dibuat."
          action={canManage ? (
            <Button size="sm" onClick={() => router.push(`${basePath}/baru`)}><Plus /> Buat Ujian</Button>
          ) : undefined}
        />
      )}
      <div className="grid gap-3">
        {exams.map((exam) => (
          <Card key={exam.id}>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-blue-50 text-primary">
                    <FileCheck2 className="size-5" />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <CardTitle className="flex flex-wrap items-center gap-2">
                      {exam.title}
                      {getStatusBadge(exam.status)}
                      {exam.category && <Badge variant="outline"><Tag />{categoryLabel(exam.category, catsQ.data)}</Badge>}
                    </CardTitle>
                    {exam.description && <p className="text-sm text-muted-foreground">{exam.description}</p>}
                    {(exam.level || exam.subject) && (
                      <p className="text-xs text-muted-foreground">
                        {[exam.level?.name, exam.subject?.name].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                </div>
                {canManage && exam.status === 'DRAFT' && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => router.push(`${basePath}/${exam.id}/edit`)}>
                      <Pencil /> Edit
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => handleDelete(exam.id)}>
                      <Trash2 /> Hapus
                    </Button>
                  </div>
                )}
                {canManage && exam.status === 'PUBLISHED' && (
                  <Button size="sm" variant="outline" onClick={() => router.push(`${basePath}/${exam.id}/edit`)}>
                    <Settings2 /> Kelola Status
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                <div className="flex items-center gap-2">
                  <CalendarClock className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground">Mulai</div>
                    <div className="truncate tabular-nums">{new Date(exam.scheduledStartAt).toLocaleString('id-ID')}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <CalendarClock className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground">Selesai</div>
                    <div className="truncate tabular-nums">{new Date(exam.scheduledEndAt).toLocaleString('id-ID')}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground">Peserta</div>
                    <div className="tabular-nums">{exam._count.attempts}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Star className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground">Nilai Maks</div>
                    <div className="tabular-nums">{exam.maxScore}</div>
                  </div>
                </div>
              </div>
              <div className="mt-3">
                <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <FileQuestion className="size-3.5" /> Soal ({exam.items.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {exam.items.map((item) => (
                    <Badge key={item.id} variant="outline" className="tabular-nums">
                      {item.question.type} ({item.points} poin)
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
        title="Hapus ujian ini?"
        description="Ujian beserta susunan soalnya akan dihapus permanen dan tidak dapat dikembalikan."
        confirmLabel="Ya, hapus"
        pending={deleteM.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteM.mutate(deleteTarget);
          setDeleteTarget(null);
        }}
      />
      <ContentCategoriesManager open={manageCats} onOpenChange={setManageCats} />
    </div>
  );
}
