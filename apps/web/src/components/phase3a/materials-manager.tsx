"use client";
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { BookOpen, FileText, GraduationCap, Layers, Pencil, Plus, Search, Settings2, Tag, Trash2, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch, ApiError, resolveAssetUrl } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import type { MaterialRow, GroupItem } from '@/lib/phase3a-types';
import { Phase1aSelectField } from '@/components/phase1a/phase1a-form-dialog';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { ContentDrilldown, DrillBreadcrumb, useContentCategories, useContentLevels, useDrillState } from '@/components/shared/content-drilldown';
import { ContentCategoriesManager } from '@/components/shared/content-categories-manager';
import {
  applyDrill,
  categoryLabel,
  categoryOptions,
  drillDone,
  drillQuery,
  DRILL_ALL,
  DRILL_EMPTY,
  DRILL_NONE,
} from '@/lib/content-taxonomy';

function err(e: unknown, fb: string) {
  return e instanceof ApiError ? e.message : fb;
}

/** Fase 3a — Daftar materi per Jenjang → Mapel → Tipe. Tambah/Edit lewat halaman terpisah. */
export function MaterialsManager({ canManage, basePath = '/materi' }: { canManage: boolean; basePath?: string }) {
  const qc = useQueryClient();
  const router = useRouter();
  const [drill, setDrill] = useDrillState();
  const [groupId, setGroupId] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const roles = useAuthStore((s) => s.user?.roles ?? []);
  // Siswa tak punya akses /groups — kelompoknya sudah dibatasi backend.
  const showGroupFilter = canManage || roles.includes('TUTOR');
  // Portal induk ("/admin-academic/materi" → "/admin-academic") untuk tautan
  // konten terkait ke halaman latsol/ujian di portal yang sama.
  const portalBase = basePath.replace(/\/materi.*$/, '') || '';

  const listQ = useQuery({
    queryKey: ['materials', groupId, debouncedSearch],
    queryFn: () => {
      const p = new URLSearchParams();
      if (groupId) p.set('groupId', groupId);
      if (debouncedSearch) p.set('search', debouncedSearch);
      const qs = p.toString();
      return apiFetch<MaterialRow[]>(`/materials${qs ? `?${qs}` : ''}`);
    },
  });

  const groupsQ = useQuery({
    queryKey: ['groups-lite'],
    queryFn: () => apiFetch<GroupItem[]>('/groups'),
    enabled: showGroupFilter,
  });

  const levelsQ = useContentLevels();
  const catsQ = useContentCategories();
  const [manageCats, setManageCats] = useState(false);
  const levels = levelsQ.data;

  const deleteM = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/materials/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Materi berhasil dihapus.');
      qc.invalidateQueries({ queryKey: ['materials'] });
    },
    onError: (e) => toast.error(err(e, 'Gagal menghapus materi.')),
  });

  const items = listQ.data ?? [];
  const filtered = applyDrill(items, drill, levels).filter(
    (i) => !catFilter || i.category === catFilter,
  );
  const done = drillDone(drill) || !!debouncedSearch;

  const createUrl = () => {
    const p = new URLSearchParams(drillQuery(drill));
    if (drill.levelId && drill.levelId !== DRILL_ALL && drill.levelId !== DRILL_NONE) p.set('levelId', drill.levelId);
    if (drill.subjectId && drill.subjectId !== DRILL_ALL && drill.subjectId !== DRILL_NONE) p.set('subjectId', drill.subjectId);
    if (drill.category && drill.category !== DRILL_ALL && drill.category !== DRILL_NONE) p.set('category', drill.category);
    const qs = p.toString();
    return `${basePath}/baru${qs ? `?${qs}` : ''}`;
  };

  const addButton = canManage ? (
    <Button className="w-full sm:w-auto" onClick={() => router.push(createUrl())}>
      <Plus /> Tambah Materi
    </Button>
  ) : null;

  // Landing drill-down: Jenjang → Mapel → Tipe.
  if (!done) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Materi</h1>
            <p className="text-sm text-muted-foreground">
              Materi dikategorikan per jenjang → mapel → tipe.
            </p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Cari materi..."
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
          itemNoun="Materi"
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
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Materi</h1>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex w-full items-end gap-1.5 sm:w-auto">
          <div className="w-full sm:w-44">
            <Phase1aSelectField
              id="mat-cat"
              label="Tipe"
              value={catFilter}
              onChange={setCatFilter}
              options={categoryOptions(catsQ.data)}
            />
          </div>
          {canManage && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              title="Kelola tipe materi (tambah Bab, dsb.)"
              onClick={() => setManageCats(true)}
            >
              <Settings2 className="size-4" />
            </Button>
          )}
        </div>
        {showGroupFilter && (
          <div className="w-full sm:w-44">
            <Phase1aSelectField
              id="mat-group"
              label="Kelompok"
              value={groupId}
              onChange={setGroupId}
              options={groupsQ.data?.map((g) => ({ value: g.id, label: g.name })) || []}
            />
          </div>
        )}
        <div className="relative w-full sm:w-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Cari materi..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {addButton}
      </div>
      {listQ.isLoading ? <Skeleton className="h-24 w-full" /> : null}
      {listQ.isError ? <p className="text-sm text-destructive">Gagal memuat materi.</p> : null}
      {!listQ.isLoading && filtered.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Belum ada materi"
          description="Belum ada materi untuk pilihan ini. Coba kategori lain atau tambah materi baru."
          action={canManage ? (
            <Button size="sm" onClick={() => router.push(createUrl())}><Plus /> Tambah Materi</Button>
          ) : undefined}
        />
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        {filtered.map((m) => (
          <Card key={m.id}>
            <CardContent className="flex gap-3 py-4">
              {m.imageUrl ? (
                <img
                  src={resolveAssetUrl(m.imageUrl)}
                  alt={m.title}
                  className="size-16 shrink-0 rounded-lg border object-cover"
                />
              ) : (
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-blue-50 text-primary">
                  <BookOpen className="size-5" />
                </div>
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate font-medium">{m.title}</p>
                  {!m.isActive && <Badge variant="outline">Non-aktif</Badge>}
                </div>
                <p className="line-clamp-2 text-sm text-muted-foreground">{m.description || 'Tidak ada deskripsi'}</p>
                <div className="flex flex-wrap gap-1.5">
                  {m.category && <Badge variant="default"><Tag />{categoryLabel(m.category, catsQ.data)}</Badge>}
                  {m.subject && <Badge variant="secondary"><BookOpen />{m.subject.name}</Badge>}
                  {m.level && <Badge variant="outline"><Layers />{m.level.name}</Badge>}
                  {m.program && <Badge variant="outline"><GraduationCap />{m.program.name}</Badge>}
                  {m.group && <Badge variant="outline"><Users />{m.group.name}</Badge>}
                </div>
                {m.content && (
                  <Badge variant="secondary" className="self-start">Isi teks</Badge>
                )}
                {m.fileUrl && (
                  <a href={resolveAssetUrl(m.fileUrl)} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                    <FileText className="size-4" /> Lihat File
                  </a>
                )}
                {(m.latsolPackage || m.exam) && (
                  <div className="mt-1 flex flex-wrap gap-2">
                    {m.latsolPackage && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          router.push(`${portalBase}/latsol?play=${m.latsolPackage!.id}`)
                        }
                      >
                        <FileText /> {m.latsolPackage.title}
                      </Button>
                    )}
                    {m.exam && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push(`${portalBase}/ujian?exam=${m.exam!.id}`)}
                      >
                        <GraduationCap /> {m.exam.title}
                      </Button>
                    )}
                  </div>
                )}
                {canManage && (
                  <div className="mt-1 flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => router.push(`${basePath}/${m.id}/edit${drillQuery(drill)}`)}>
                      <Pencil /> Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={deleteM.isPending}
                      onClick={() => setDeleteTarget(m.id)}
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
        title="Hapus materi ini?"
        description="Materi akan dihapus permanen dan tidak dapat dikembalikan."
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
