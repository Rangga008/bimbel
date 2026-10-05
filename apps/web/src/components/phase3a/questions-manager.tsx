"use client";
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { CircleCheck, FileQuestion, FileUp, ImageIcon, Pencil, Plus, Search, Settings2, Tag, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch, ApiError, resolveAssetUrl } from '@/lib/api-client';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import type { QuestionRow, QuestionSummary } from '@/lib/phase3a-types';
import { QUESTION_TYPES, DIFFICULTY_LEVELS } from '@/lib/phase3a-types';
import { Phase1aSelectField } from '@/components/phase1a/phase1a-form-dialog';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { MathContent } from '@/components/shared/math-content';
import { ContentDrilldown, DrillBreadcrumb, useContentCategories, useContentLevels } from '@/components/shared/content-drilldown';
import { ContentCategoriesManager } from '@/components/shared/content-categories-manager';
import { QuestionImportDialog } from '@/components/phase3a/question-import-dialog';
import {
  applyDrill,
  categoryLabel,
  categoryOptions,
  drillDone,
  drillFromParams,
  DRILL_ALL,
  DRILL_EMPTY,
  DRILL_NONE,
  type DrillValue,
} from '@/lib/content-taxonomy';

function err(e: unknown, fb: string) {
  return e instanceof ApiError ? e.message : fb;
}

/** Fase 3a — Question Bank per Jenjang → Mapel → Tipe + filter tipe soal/kesulitan. */
export function QuestionsManager({ canManage, basePath }: { canManage: boolean; basePath: string }) {
  const qc = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [drill, setDrill] = useState<DrillValue>(() =>
    drillFromParams((k) => searchParams.get(k)),
  );
  const [type, setType] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const listQ = useQuery({
    queryKey: ['questions', type, difficulty, debouncedSearch],
    queryFn: () => {
      const p = new URLSearchParams();
      if (type) p.set('type', type);
      if (difficulty) p.set('difficulty', difficulty);
      if (debouncedSearch) p.set('search', debouncedSearch);
      const qs = p.toString();
      return apiFetch<QuestionRow[]>(`/questions${qs ? `?${qs}` : ''}`);
    },
  });

  const summaryQ = useQuery({
    queryKey: ['questions-summary'],
    queryFn: () => apiFetch<QuestionSummary>('/questions/summary'),
  });

  const levelsQ = useContentLevels();
  const catsQ = useContentCategories();
  const [manageCats, setManageCats] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const levels = levelsQ.data;

  const deleteM = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/questions/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Soal berhasil dihapus.');
      qc.invalidateQueries({ queryKey: ['questions'] });
      qc.invalidateQueries({ queryKey: ['questions-summary'] });
    },
    onError: (e) => toast.error(err(e, 'Gagal menghapus soal.')),
  });

  const items = listQ.data ?? [];
  const filtered = applyDrill(items, drill, levels).filter(
    (i) => !catFilter || i.category === catFilter,
  );
  const done = drillDone(drill) || !!debouncedSearch || !!type || !!difficulty || !!catFilter;

  const createUrl = () => {
    const p = new URLSearchParams();
    if (drill.levelId && drill.levelId !== DRILL_ALL && drill.levelId !== DRILL_NONE) p.set('levelId', drill.levelId);
    if (drill.subjectId && drill.subjectId !== DRILL_ALL && drill.subjectId !== DRILL_NONE) p.set('subjectId', drill.subjectId);
    if (drill.category && drill.category !== DRILL_ALL && drill.category !== DRILL_NONE) p.set('category', drill.category);
    const qs = p.toString();
    return `${basePath}/baru${qs ? `?${qs}` : ''}`;
  };

  const addButton = canManage ? (
    <div className="flex w-full flex-wrap gap-2 sm:w-auto">
      <Button
        variant="outline"
        className="w-full sm:w-auto"
        onClick={() => setImportOpen(true)}
      >
        <FileUp /> Import Word/Excel
      </Button>
      <Button className="w-full sm:w-auto" onClick={() => router.push(createUrl())}>
        <Plus /> Tambah Soal
      </Button>
    </div>
  ) : null;

  // Landing drill-down: Jenjang → Mapel → Tipe.
  if (!done) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Bank Soal</h1>
            <p className="text-sm text-muted-foreground">
              Bank soal dikategorikan per jenjang → mapel → tipe.
            </p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Cari soal (konten/pembahasan)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          {addButton}
        </div>
        <ContentDrilldown
          items={items}
          levels={levels}
          categories={catsQ.data}
          value={drill}
          onChange={setDrill}
          itemNoun="Soal"
          loading={listQ.isLoading || levelsQ.isLoading}
          onManageCategories={canManage ? () => setManageCats(true) : undefined}
        />
        <ContentCategoriesManager open={manageCats} onOpenChange={setManageCats} />
        <QuestionImportDialog open={importOpen} onOpenChange={setImportOpen} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        {!debouncedSearch && !type && !difficulty && !catFilter && <DrillBreadcrumb items={items} levels={levels} categories={catsQ.data} value={drill} onChange={setDrill} />}
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Bank Soal</h1>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-40">
          <Phase1aSelectField
            id="q-type"
            label="Tipe Soal"
            value={type}
            onChange={setType}
            options={QUESTION_TYPES.map((t) => ({ value: t.value, label: t.label }))}
            placeholder="Semua tipe"
          />
        </div>
        <div className="flex w-full items-end gap-1.5 sm:w-auto">
          <div className="w-full sm:w-44">
            <Phase1aSelectField
              id="q-category"
              label="Kategori"
              value={catFilter}
              onChange={setCatFilter}
              options={categoryOptions(catsQ.data)}
              placeholder="Semua kategori"
            />
          </div>
          {canManage && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              title="Kelola tipe soal (tambah Bab, dsb.)"
              onClick={() => setManageCats(true)}
            >
              <Settings2 className="size-4" />
            </Button>
          )}
        </div>
        <div className="w-full sm:w-40">
          <Phase1aSelectField
            id="q-difficulty"
            label="Tingkat"
            value={difficulty}
            onChange={setDifficulty}
            options={DIFFICULTY_LEVELS.map((d) => ({ value: d.value, label: d.label }))}
            placeholder="Semua tingkat"
          />
        </div>
        <div className="relative w-full sm:w-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Cari soal (konten/pembahasan)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {addButton}
      </div>
      {summaryQ.data && (
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-blue-50 text-primary">
              <FileQuestion className="size-5" />
            </div>
            <div className="text-sm">
              <p className="font-medium tabular-nums">Total {summaryQ.data.total} soal aktif</p>
              <p className="text-xs text-muted-foreground">
                Tipe: {Object.entries(summaryQ.data.byType).map(([k, v]) => `${k}: ${v}`).join(', ') || '—'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
      {listQ.isLoading ? <Skeleton className="h-24 w-full" /> : null}
      {listQ.isError ? <p className="text-sm text-destructive">Gagal memuat soal.</p> : null}
      {!listQ.isLoading && filtered.length === 0 ? (
        <EmptyState
          icon={FileQuestion}
          title="Belum ada soal"
          description="Belum ada soal untuk pilihan ini. Coba kategori lain atau tambah soal baru."
          action={canManage ? (
            <Button size="sm" onClick={() => router.push(createUrl())}><Plus /> Tambah Soal</Button>
          ) : undefined}
        />
      ) : null}
      <div className="grid gap-3">
        {filtered.map((q) => (
          <Card key={q.id}>
            <CardContent className="flex gap-3 py-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <FileQuestion className="size-5" />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="flex-1 text-sm font-medium leading-snug">
                    {q.content.slice(0, 100)}{q.content.length > 100 ? '…' : ''}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {q.category && <Badge variant="default"><Tag />{categoryLabel(q.category, catsQ.data)}</Badge>}
                    {q.subject && <Badge variant="secondary">{q.subject.name}</Badge>}
                    <Badge variant="outline">{QUESTION_TYPES.find((t) => t.value === q.type)?.label || q.type}</Badge>
                    {q.difficulty && <Badge variant="secondary">{DIFFICULTY_LEVELS.find((d) => d.value === q.difficulty)?.label || q.difficulty}</Badge>}
                    {!q.isActive && <Badge variant="destructive">Non-aktif</Badge>}
                  </div>
                </div>
                {q.imageUrl && (
                  <a href={resolveAssetUrl(q.imageUrl)} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                    <ImageIcon className="size-4" /> Lihat Gambar
                  </a>
                )}
                {q.options.length > 0 && (
                  <div className="flex flex-col gap-1 rounded-lg bg-muted/50 p-2.5">
                    {q.options.map((opt) => (
                      <div key={opt.id} className="flex items-center gap-2 text-sm">
                        {opt.isCorrect ? (
                          <CircleCheck className="size-4 shrink-0 text-success-600" />
                        ) : (
                          <span className="size-4 shrink-0 rounded-full border border-muted-foreground/40" />
                        )}
                        {opt.imageUrl && (
                          <img
                            src={resolveAssetUrl(opt.imageUrl)}
                            alt="Gambar opsi"
                            className="h-10 max-w-[140px] rounded border bg-background object-contain"
                          />
                        )}
                        <span className={opt.isCorrect ? 'font-medium text-success-700' : 'text-muted-foreground'}>
                          <MathContent text={opt.content} />
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {q.answerKey && (
                  <p className="text-sm text-muted-foreground">Kunci isian singkat: <span className="font-medium text-foreground">{q.answerKey}</span></p>
                )}
                {q.explanation && (
                  <p className="text-sm text-muted-foreground">Solusi: {q.explanation.slice(0, 100)}{q.explanation.length > 100 ? '…' : ''}</p>
                )}
                {q.points ? <p className="text-xs text-muted-foreground tabular-nums">Poin: {q.points}</p> : null}
                {canManage && (
                  <div className="mt-1 flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => router.push(`${basePath}/${q.id}/edit`)}
                    >
                      <Pencil /> Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={deleteM.isPending}
                      onClick={() => setDeleteTarget(q.id)}
                    >
                      <Trash2 /> Hapus
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
        title="Hapus soal ini?"
        description="Soal akan dihapus permanen dari bank soal dan tidak dapat dikembalikan."
        confirmLabel="Ya, hapus"
        pending={deleteM.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteM.mutate(deleteTarget);
          setDeleteTarget(null);
        }}
      />
      <ContentCategoriesManager open={manageCats} onOpenChange={setManageCats} />
        <QuestionImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
