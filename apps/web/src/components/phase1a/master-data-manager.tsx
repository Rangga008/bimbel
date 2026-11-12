"use client";

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch, ApiError } from '@/lib/api-client';
import type { MasterItem } from '@/lib/phase1a-types';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Phase1aFormDialog,
  type Phase1aField,
} from '@/components/phase1a/phase1a-form-dialog';

const SUBJECT_FIELDS: Phase1aField[] = [
  { name: 'code', label: 'Kode mapel', placeholder: 'MTK', required: true },
  { name: 'name', label: 'Nama mapel', placeholder: 'Matematika', required: true },
];

const GRADE_FIELDS: Phase1aField[] = [
  { name: 'code', label: 'Kode level kelas', placeholder: 'SMP-7', required: true },
  { name: 'name', label: 'Nama level kelas', placeholder: 'SMP Kelas 7', required: true },
  { name: 'sortOrder', label: 'Urutan', type: 'number', required: true },
];

function err(e: unknown, fb: string) {
  return e instanceof ApiError ? e.message : fb;
}

type MasterKind = 'subjects' | 'grade-levels';

/** Subject dari API — membawa lampiran jenjang (levelSubjects). */
type SubjectRow = MasterItem & {
  levelSubjects?: { levelId: string }[];
};

/** Jenjang untuk checkbox lampiran mapel. */
type LevelOpt = {
  id: string;
  name: string;
  program?: { name: string } | null;
  gradeLevel?: { name: string } | null;
};

/** Query keys konsumen mapel/jenjang — wajib di-invalidate agar sinkron. */
const MAPLE_KEYS = [
  'master-subjects',
  'subjects',
  'levels-all',
  'content-hierarchy-levels',
  'levels',
  'programs-lite',
];

function invalidateMapel(qc: ReturnType<typeof useQueryClient>, kind: MasterKind) {
  qc.invalidateQueries({ queryKey: ['master', kind] });
  if (kind === 'subjects') {
    for (const k of MAPLE_KEYS) qc.invalidateQueries({ queryKey: [k] });
  } else {
    qc.invalidateQueries({ queryKey: ['master-grade-levels'] });
  }
}

/**
 * Satu panel master data (Mapel atau Level Kelas): daftar + tambah +
 * aktif/nonaktif. Dipakai admin akademik/owner — tutor hanya membaca via
 * dropdown di form Program/Level.
 */
function MasterPanel({
  kind,
  title,
  description,
  fields,
  canManage,
}: {
  kind: MasterKind;
  title: string;
  description: string;
  fields: Phase1aField[];
  canManage: boolean;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({ sortOrder: '0' });
  // Lampiran jenjang saat tambah mapel (subjects saja).
  const [attachIds, setAttachIds] = useState<string[]>([]);
  // Dialog "Atur Jenjang" per mapel.
  const [attachItem, setAttachItem] = useState<SubjectRow | null>(null);

  const listQ = useQuery({
    queryKey: ['master', kind],
    queryFn: () => apiFetch<MasterItem[]>(`/master/${kind}?all=true`),
  });

  // Jenjang untuk pelampiran mapel — hanya di panel subjects.
  const levelsQ = useQuery({
    queryKey: ['levels-all'],
    queryFn: () => apiFetch<LevelOpt[]>('/levels'),
    enabled: kind === 'subjects',
  });
  const levelName = (l: LevelOpt) =>
    l.program?.name ? `${l.program.name} — ${l.name}` : l.name;

  const createM = useMutation({
    mutationFn: () =>
      apiFetch(`/master/${kind}`, {
        method: 'POST',
        body: {
          code: form.code,
          name: form.name,
          ...(fields.some((f) => f.name === 'sortOrder')
            ? { sortOrder: Number(form.sortOrder || 0) }
            : {}),
          ...(kind === 'subjects' && attachIds.length
            ? { levelIds: attachIds }
            : {}),
        },
      }),
    onSuccess: () => {
      toast.success(`${title} ditambahkan.`);
      setOpen(false);
      setForm({ sortOrder: '0' });
      setAttachIds([]);
      invalidateMapel(qc, kind);
    },
    onError: (e) => toast.error(err(e, `Gagal menambah ${title.toLowerCase()}.`)),
  });

  const toggleM = useMutation({
    mutationFn: (item: MasterItem) =>
      apiFetch<MasterItem>(`/master/${kind}/${item.id}`, {
        method: 'PATCH',
        body: { isActive: !item.isActive },
      }),
    onSuccess: (item: MasterItem) => {
      toast.success(
        item.isActive ? `${title} diaktifkan.` : `${title} dinonaktifkan.`,
      );
      invalidateMapel(qc, kind);
    },
    onError: (e) => toast.error(err(e, 'Gagal mengubah status.')),
  });

  // Simpan set lampiran jenjang untuk satu mapel.
  const attachM = useMutation({
    mutationFn: (input: { id: string; levelIds: string[] }) =>
      apiFetch(`/master/${kind}/${input.id}`, {
        method: 'PATCH',
        body: { levelIds: input.levelIds },
      }),
    onSuccess: () => {
      toast.success('Lampiran jenjang disimpan.');
      setAttachItem(null);
      invalidateMapel(qc, kind);
    },
    onError: (e) => toast.error(err(e, 'Gagal menyimpan lampiran jenjang.')),
  });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <div>
          <CardTitle>{title}</CardTitle>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        {canManage ? (
          <Button size="sm" onClick={() => setOpen(true)}>
            Tambah
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {listQ.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : listQ.data?.length ? (
          <div className="flex flex-col divide-y">
            {listQ.data.map((item) => {
              const sub = item as SubjectRow;
              const attached = sub.levelSubjects?.length ?? 0;
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-2 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Badge variant="secondary" className="font-mono">
                      {item.code}
                    </Badge>
                    <span className="text-sm">{item.name}</span>
                    {!item.isActive ? (
                      <Badge variant="outline" className="text-muted-foreground">
                        Nonaktif
                      </Badge>
                    ) : null}
                    {kind === 'subjects' ? (
                      <span className="truncate text-xs text-muted-foreground">
                        {attached
                          ? `→ ${attached} jenjang`
                          : 'belum dilampirkan ke jenjang'}
                      </span>
                    ) : null}
                  </div>
                  {canManage ? (
                    <div className="flex shrink-0 items-center gap-1">
                      {kind === 'subjects' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setAttachItem(sub)}
                        >
                          Atur Jenjang
                        </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleM.mutate(item)}
                        disabled={toggleM.isPending}
                      >
                        {item.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                      </Button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Belum ada data.
          </p>
        )}
      </CardContent>
      <Phase1aFormDialog
        open={open}
        onOpenChange={setOpen}
        title={`Tambah ${title}`}
        fields={fields}
        values={form}
        onChange={(n, v) => setForm((p) => ({ ...p, [n]: v }))}
        onSubmit={() => createM.mutate()}
        isSubmitting={createM.isPending}
        submitLabel="Simpan"
        extra={
          kind === 'subjects' ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">Lampirkan ke jenjang</p>
              <p className="text-xs text-muted-foreground">
                Mapel hanya muncul di pemilih Materi/Ujian pada jenjang yang
                dilampirkan — centang jenjang yang memakai mapel ini.
              </p>
              <div className="grid max-h-48 grid-cols-1 gap-1 overflow-y-auto rounded-md border p-2 sm:grid-cols-2">
                {(levelsQ.data ?? []).map((l) => (
                  <label
                    key={l.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-muted"
                  >
                    <Checkbox
                      checked={attachIds.includes(l.id)}
                      onCheckedChange={(c) =>
                        setAttachIds((prev) =>
                          c ? [...prev, l.id] : prev.filter((x) => x !== l.id),
                        )
                      }
                    />
                    <span className="truncate">{levelName(l)}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : undefined
        }
      />
      <AttachLevelsDialog
        item={attachItem}
        levels={levelsQ.data ?? []}
        levelName={levelName}
        onClose={() => setAttachItem(null)}
        onSave={(levelIds) =>
          attachItem && attachM.mutate({ id: attachItem.id, levelIds })
        }
        isSaving={attachM.isPending}
      />
    </Card>
  );
}

/** Dialog atur jenjang tempat sebuah mapel dilampirkan. */
function AttachLevelsDialog({
  item,
  levels,
  levelName,
  onClose,
  onSave,
  isSaving,
}: {
  item: SubjectRow | null;
  levels: LevelOpt[];
  levelName: (l: LevelOpt) => string;
  onClose: () => void;
  onSave: (levelIds: string[]) => void;
  isSaving: boolean;
}) {
  const [ids, setIds] = useState<string[] | null>(null);

  return (
    <Dialog
      open={!!item}
      onOpenChange={(o) => {
        if (!o) {
          setIds(null);
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Jenjang untuk {item?.name ?? 'mapel'}</DialogTitle>
        </DialogHeader>
        <AttachBody
          key={item?.id ?? 'none'}
          initial={(item?.levelSubjects ?? []).map((ls) => ls.levelId)}
          levels={levels}
          levelName={levelName}
          onChange={setIds}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button
            onClick={() => item && onSave(ids ?? (item.levelSubjects ?? []).map((ls) => ls.levelId))}
            disabled={isSaving}
          >
            {isSaving ? 'Menyimpan…' : 'Simpan Lampiran'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Body checkbox lampiran — state internal, parent baca via onChange. */
function AttachBody({
  initial,
  levels,
  levelName,
  onChange,
}: {
  initial: string[];
  levels: LevelOpt[];
  levelName: (l: LevelOpt) => string;
  onChange: (ids: string[]) => void;
}) {
  const [ids, setIds] = useState<string[]>(initial);
  const toggle = (id: string, on: boolean) => {
    const next = on ? [...ids, id] : ids.filter((x) => x !== id);
    setIds(next);
    onChange(next);
  };
  if (!levels.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Belum ada jenjang — buat dulu di halaman Level.
      </p>
    );
  }
  return (
    <div className="grid max-h-72 grid-cols-1 gap-1 overflow-y-auto rounded-md border p-2">
      {levels.map((l) => (
        <label
          key={l.id}
          className="flex cursor-pointer items-center gap-2 rounded px-1 py-1.5 text-sm hover:bg-muted"
        >
          <Checkbox
            checked={ids.includes(l.id)}
            onCheckedChange={(c) => toggle(l.id, !!c)}
          />
          <span className="truncate">{levelName(l)}</span>
        </label>
      ))}
    </div>
  );
}

/** Halaman "Master Data" — Mapel (kode mapel) & Level Kelas untuk dropdown. */
export function MasterDataManager({ canManage }: { canManage: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Master Data</h1>
        <p className="text-sm text-muted-foreground">
          Data rujukan untuk form Program/Level/Kelompok — mapel & level kelas
          dipilih dari sini supaya konsisten (tidak diketik manual).
        </p>
      </div>
      <MasterPanel
        kind="subjects"
        title="Mata Pelajaran"
        description="Kode mapel dipakai di Program (cth: MTK, BIN, BIG)."
        fields={SUBJECT_FIELDS}
        canManage={canManage}
      />
      <MasterPanel
        kind="grade-levels"
        title="Level Kelas"
        description="Jenjang kelas dipakai di Level program (cth: SMP-7, SMA-10)."
        fields={GRADE_FIELDS}
        canManage={canManage}
      />
    </div>
  );
}
