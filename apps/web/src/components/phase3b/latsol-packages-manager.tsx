"use client";
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { NotebookPen, Pencil, Play, Plus, Search, Settings2, Tag, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import type { LatsolPackageItem } from '@/lib/phase3b-types';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { ContentDrilldown, DrillBreadcrumb, useContentCategories, useContentLevels } from '@/components/shared/content-drilldown';
import { ContentCategoriesManager } from '@/components/shared/content-categories-manager';
import { Phase1aSelectField } from '@/components/phase1a/phase1a-form-dialog';
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

/** Fase 3b — Daftar paket latsol per Jenjang → Mapel → Tipe untuk Tutor/Admin Academic. */
export function LatsolPackagesManager({
  canManage,
  basePath = '/latsol',
  onPlay,
}: {
  canManage: boolean;
  basePath?: string;
  onPlay?: (packageId: string) => void;
}) {
  const qc = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [drill, setDrill] = useState<DrillValue>(() =>
    drillFromParams((k) => searchParams.get(k)),
  );
  const [catFilter, setCatFilter] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const listQ = useQuery({
    queryKey: ['latsol-packages', debouncedSearch],
    queryFn: () => {
      const p = new URLSearchParams();
      if (debouncedSearch) p.set('search', debouncedSearch);
      const qs = p.toString();
      return apiFetch<LatsolPackageItem[]>(`/latsol/packages${qs ? `?${qs}` : ''}`);
    },
  });

  const levelsQ = useContentLevels();
  const catsQ = useContentCategories();
  const [manageCats, setManageCats] = useState(false);
  const levels = levelsQ.data;

  const deleteM = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/latsol/packages/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Paket latsol berhasil dihapus.');
      qc.invalidateQueries({ queryKey: ['latsol-packages'] });
    },
    onError: (e) => toast.error(err(e, 'Gagal menghapus paket latsol.')),
  });

  const items = listQ.data ?? [];
  const filtered = applyDrill(items, drill, levels).filter(
    (i) => !catFilter || i.category === catFilter,
  );
  const done = drillDone(drill) || !!debouncedSearch;

  const createUrl = () => {
    const p = new URLSearchParams();
    if (drill.levelId && drill.levelId !== DRILL_ALL && drill.levelId !== DRILL_NONE) p.set('levelId', drill.levelId);
    if (drill.subjectId && drill.subjectId !== DRILL_ALL && drill.subjectId !== DRILL_NONE) p.set('subjectId', drill.subjectId);
    if (drill.category && drill.category !== DRILL_ALL && drill.category !== DRILL_NONE) p.set('category', drill.category);
    const qs = p.toString();
    return `${basePath}/baru${qs ? `?${qs}` : ''}`;
  };

  const addButton = canManage ? (
    <Button className="w-full sm:w-auto" onClick={() => router.push(createUrl())}>
      <Plus /> Buat Paket Baru
    </Button>
  ) : null;

  // Landing drill-down: Jenjang → Mapel → Tipe.
  if (!done) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Paket Latsol</h1>
            <p className="text-sm text-muted-foreground">
              Paket latihan dikategorikan per jenjang → mapel → tipe.
            </p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Cari paket..."
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
          itemNoun="Paket"
          loading={listQ.isLoading || levelsQ.isLoading}
          onManageCategories={canManage ? () => setManageCats(true) : undefined}
        />
        <ContentCategoriesManager open={manageCats} onOpenChange={setManageCats} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        {!debouncedSearch && <DrillBreadcrumb items={items} levels={levels} categories={catsQ.data} value={drill} onChange={setDrill} />}
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Paket Latsol</h1>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex w-full items-end gap-1.5 sm:w-auto">
          <div className="w-full sm:w-44">
            <Phase1aSelectField
              id="lp-cat"
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
              title="Kelola tipe (tambah Bab, dsb.)"
              onClick={() => setManageCats(true)}
            >
              <Settings2 className="size-4" />
            </Button>
          )}
        </div>
        <div className="relative w-full sm:w-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Cari paket..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {addButton}
      </div>
      {listQ.isLoading ? <Skeleton className="h-24 w-full" /> : null}
      {listQ.isError ? <p className="text-sm text-destructive">Gagal memuat paket latsol.</p> : null}
      {!listQ.isLoading && filtered.length === 0 ? (
        <EmptyState
          icon={NotebookPen}
          title="Belum ada paket latsol"
          description="Belum ada paket latihan soal untuk pilihan ini."
          action={canManage ? (
            <Button size="sm" onClick={() => router.push(createUrl())}><Plus /> Buat Paket Baru</Button>
          ) : undefined}
        />
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        {filtered.map((pkg) => (
          <Card key={pkg.id}>
            <CardContent className="flex gap-3 py-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-gold-100 text-brand-gold-700">
                <NotebookPen className="size-5" />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate font-medium">{pkg.title}</p>
                  {!pkg.isActive && <Badge variant="destructive">Non-aktif</Badge>}
                </div>
                {pkg.description && <p className="line-clamp-2 text-sm text-muted-foreground">{pkg.description}</p>}
                <div className="flex flex-wrap gap-1.5">
                  {pkg.category && <Badge variant="default"><Tag />{categoryLabel(pkg.category, catsQ.data)}</Badge>}
                  <Badge variant="outline" className="tabular-nums">{pkg._count.items} soal</Badge>
                  <Badge variant="secondary" className="tabular-nums">{pkg._count.attempts} attempt</Badge>
                  {pkg.subject && <Badge variant="secondary">{pkg.subject.name}</Badge>}
                  {pkg.program && <Badge variant="outline">{pkg.program.name}</Badge>}
                  {pkg.level && <Badge variant="outline">{pkg.level.name}</Badge>}
                </div>
                <div className="mt-1 flex flex-wrap gap-2">
                  {onPlay && pkg.isActive && (
                    <Button size="sm" onClick={() => onPlay(pkg.id)}>
                      <Play /> Kerjakan
                    </Button>
                  )}
                  {canManage && (
                    <>
                      <Button variant="outline" size="sm" onClick={() => router.push(`${basePath}/${pkg.id}/edit`)}>
                        <Pencil /> Edit
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={deleteM.isPending}
                        onClick={() => setDeleteTarget(pkg.id)}
                      >
                        <Trash2 /> Hapus
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
        title="Hapus paket latsol ini?"
        description="Paket latsol akan dihapus permanen dan tidak dapat dikembalikan."
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
