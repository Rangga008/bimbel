"use client";
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Phone, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatar } from '@/components/shared/user-avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { apiFetch, ApiError } from '@/lib/api-client';
import type { MasterItem, StudentItem, TutorItem } from '@/lib/phase1a-types';
import type { HierarchyLevel } from '@/lib/content-taxonomy';

function err(e: unknown, fb: string) {
  return e instanceof ApiError ? e.message : fb;
}

type StudentRow = StudentItem & {
  groupMembers?: Array<{
    group: {
      id: string;
      name: string;
      level: { id: string; name: string } | null;
    };
  }>;
  enrollments?: Array<{ level: { id: string; name: string } | null }>;
};

/** Nama jenjang siswa — gabungan jenjang pendaftaran + kelompok yang diikuti. */
function studentLevelNames(s: StudentRow): string[] {
  const names = new Set<string>();
  (s.enrollments ?? []).forEach((e) => e.level?.name && names.add(e.level.name));
  (s.groupMembers ?? []).forEach((m) => m.group.level?.name && names.add(m.group.level.name));
  return [...names];
}

const inputCls =
  'h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring';

/**
 * Popup tambah siswa ke kelompok — pilih jenjang dulu, lalu centang siswa.
 * Baris menampilkan nama + no HP + jenjang/kelompok agar admin yakin orangnya benar.
 */
export function AddGroupStudentsDialog({
  open,
  onOpenChange,
  groupId,
  excludeIds,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  excludeIds: Set<string>;
  onAdded: () => void;
}) {
  const qc = useQueryClient();
  const [levelId, setLevelId] = useState('');
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const levelsQ = useQuery({
    queryKey: ['levels-all'],
    queryFn: () => apiFetch<HierarchyLevel[]>('/levels'),
    enabled: open,
  });
  const studentsQ = useQuery({
    queryKey: ['students', 'picker', levelId],
    queryFn: () =>
      apiFetch<StudentRow[]>(
        `/students${levelId ? `?levelId=${encodeURIComponent(levelId)}` : ''}`,
      ),
    enabled: open,
  });

  const addM = useMutation({
    mutationFn: async (ids: string[]) => {
      // Endpoint menerima 1 siswa per request — kirim berurutan agar
      // kegagalan di tengah tetap meninggalkan siswa yang sudah masuk.
      for (const studentId of ids) {
        await apiFetch(`/groups/${groupId}/students`, {
          method: 'POST',
          body: { studentId },
        });
      }
      return ids.length;
    },
    onSuccess: (n) => {
      toast.success(`${n} siswa ditambahkan ke kelompok.`);
      setPicked(new Set());
      qc.invalidateQueries({ queryKey: ['groups', groupId] });
      onAdded();
      onOpenChange(false);
    },
    onError: (e) => {
      toast.error(err(e, 'Gagal menambahkan siswa.'));
      // Sebagian mungkin sudah masuk sebelum error — segarkan daftar.
      qc.invalidateQueries({ queryKey: ['groups', groupId] });
      onAdded();
    },
  });

  const levelOptions = useMemo(() => {
    const opts = (levelsQ.data ?? [])
      .filter((l) => l.id)
      .map((l) => ({
        value: l.id,
        label: l.program?.name ? `${l.name} — ${l.program.name}` : l.name,
      }));
    return opts;
  }, [levelsQ.data]);

  const q = search.trim().toLowerCase();
  const rows = (studentsQ.data ?? [])
    .filter((s) => !excludeIds.has(s.id))
    .filter(
      (s) =>
        q === '' ||
        s.user.name.toLowerCase().includes(q) ||
        (s.user.phone ?? '').replace(/\D/g, '').includes(q.replace(/\D/g, '') || '\u0000'),
    );

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setPicked(new Set());
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Tambah Siswa ke Kelompok</DialogTitle>
          <DialogDescription>
            Pilih jenjang dulu untuk mempersempit, lalu centang siswa yang mau dimasukkan.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <select
              className={inputCls}
              value={levelId}
              onChange={(e) => setLevelId(e.target.value)}
              aria-label="Filter jenjang"
            >
              <option value="">Semua jenjang</option>
              <option value="none">— Tanpa jenjang —</option>
              {levelOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Cari nama / no HP…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="flex max-h-72 flex-col gap-1 overflow-y-auto rounded-md border p-1.5">
            {studentsQ.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : rows.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                {levelId
                  ? 'Tidak ada siswa di jenjang ini yang bisa ditambahkan.'
                  : 'Semua siswa sudah jadi anggota atau tidak ada yang cocok.'}
              </p>
            ) : (
              rows.map((s) => {
                const checked = picked.has(s.id);
                const levels = studentLevelNames(s);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggle(s.id)}
                    className={`flex items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors ${
                      checked
                        ? 'border-emerald-600 bg-emerald-50'
                        : 'border-transparent hover:bg-muted'
                    }`}
                  >
                    <span
                      className={`flex size-5 shrink-0 items-center justify-center rounded border ${
                        checked
                          ? 'border-emerald-600 bg-emerald-600 text-white'
                          : 'border-muted-foreground/40'
                      }`}
                    >
                      {checked ? <Check className="size-3.5" /> : null}
                    </span>
                    <UserAvatar
                      name={s.user.name}
                      avatarUrl={s.user.avatarUrl}
                      className="size-8"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {s.user.name}
                      </span>
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        {s.user.phone ? (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="size-3" />
                            {s.user.phone}
                          </span>
                        ) : (
                          'tanpa no HP'
                        )}
                        {levels.length > 0 ? (
                          <span className="text-muted-foreground/80">
                            · {levels.join(', ')}
                          </span>
                        ) : null}
                      </span>
                    </span>
                    {!s.isActive ? (
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        Nonaktif
                      </Badge>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {picked.size > 0 ? `${picked.size} siswa dipilih` : 'Belum ada yang dipilih'}
            </p>
            <Button
              size="sm"
              disabled={picked.size === 0 || addM.isPending}
              onClick={() => addM.mutate([...picked])}
            >
              {addM.isPending ? 'Menambahkan...' : `Tambah ${picked.size || ''} Siswa`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Popup tambah tutor ke kelompok — filter per mapel (spesialisasi) dulu,
 * lalu klik tutor untuk menugaskan. Baris: nama + mapel + no HP.
 */
export function AddGroupTutorDialog({
  open,
  onOpenChange,
  groupId,
  excludeIds,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  excludeIds: Set<string>;
  onAdded: () => void;
}) {
  const qc = useQueryClient();
  const [subjectName, setSubjectName] = useState('');
  const [search, setSearch] = useState('');
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  const subjectsQ = useQuery({
    queryKey: ['master-subjects'],
    queryFn: () => apiFetch<MasterItem[]>('/master/subjects'),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });
  const tutorsQ = useQuery({
    queryKey: ['tutors'],
    queryFn: () => apiFetch<TutorItem[]>('/tutors'),
    enabled: open,
  });

  const addM = useMutation({
    mutationFn: (tutorId: string) =>
      apiFetch(`/groups/${groupId}/tutors`, {
        method: 'POST',
        body: { tutorId },
      }),
    onSuccess: (_res, tutorId) => {
      toast.success('Tutor ditugaskan.');
      // Dialog tetap terbuka — admin bisa menugaskan tutor lain sekaligus.
      setAddedIds((prev) => new Set(prev).add(tutorId));
      qc.invalidateQueries({ queryKey: ['groups', groupId] });
      onAdded();
    },
    onError: (e) => toast.error(err(e, 'Gagal menugaskan tutor.')),
  });

  const q = search.trim().toLowerCase();
  const spec = subjectName.trim().toLowerCase();
  const rows = (tutorsQ.data ?? [])
    .filter((t) => !excludeIds.has(t.id) && !addedIds.has(t.id))
    .filter(
      (t) =>
        spec === '' ||
        (t.specialization ?? '').toLowerCase().includes(spec),
    )
    .filter(
      (t) =>
        q === '' ||
        t.user.name.toLowerCase().includes(q) ||
        (t.user.phone ?? '').replace(/\D/g, '').includes(q.replace(/\D/g, '') || '\u0000'),
    );

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setAddedIds(new Set());
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Tugaskan Tutor ke Kelompok</DialogTitle>
          <DialogDescription>
            Filter per mapel (spesialisasi tutor) dulu, lalu klik tutor untuk menugaskan —
            bisa lebih dari satu.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <select
              className={inputCls}
              value={subjectName}
              onChange={(e) => setSubjectName(e.target.value)}
              aria-label="Filter mapel"
            >
              <option value="">Semua mapel</option>
              {(subjectsQ.data ?? []).map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Cari nama / no HP…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="flex max-h-72 flex-col gap-1 overflow-y-auto rounded-md border p-1.5">
            {tutorsQ.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : rows.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                {subjectName
                  ? `Tidak ada tutor dengan mapel "${subjectName}".`
                  : 'Semua tutor sudah ditugaskan atau tidak ada yang cocok.'}
              </p>
            ) : (
              rows.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  disabled={addM.isPending}
                  onClick={() => addM.mutate(t.id)}
                  className="flex items-center gap-3 rounded-md border border-transparent px-3 py-2 text-left transition-colors hover:bg-muted"
                >
                  <UserAvatar
                    name={t.user.name}
                    avatarUrl={t.user.avatarUrl}
                    className="size-8"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {t.user.name}
                    </span>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      {t.specialization ? (
                        <span>{t.specialization}</span>
                      ) : (
                        'mapel belum diisi'
                      )}
                      {t.user.phone ? (
                        <span className="inline-flex items-center gap-1">
                          · <Phone className="size-3" />
                          {t.user.phone}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  {!t.isActive ? (
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      Nonaktif
                    </Badge>
                  ) : null}
                </button>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
