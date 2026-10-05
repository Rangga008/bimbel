"use client";

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { apiFetch, ApiError } from '@/lib/api-client';
import type { LevelItem, MasterItem, ProgramItem } from '@/lib/phase1a-types';
import { Phase1aSelectField } from '@/components/phase1a/phase1a-form-dialog';

function err(e: unknown, fb: string) {
  return e instanceof ApiError ? e.message : fb;
}

interface LevelFormState {
  programId: string;
  name: string;
  sortOrder: string;
  isActive: boolean;
  gradeLevelId: string;
  subjectId: string;
  price: string;
  priceUnit: string;
  subjectIds: string;
}

const EMPTY_FORM: LevelFormState = {
  programId: '',
  name: '',
  sortOrder: '0',
  isActive: true,
  gradeLevelId: '',
  subjectId: '',
  price: '',
  priceUnit: 'MONTH',
  subjectIds: '',
};

const PRICE_UNIT_OPTIONS = [
  { value: 'MONTH', label: 'Per bulan' },
  { value: 'SESSION', label: 'Per pertemuan' },
  { value: 'YEAR', label: 'Per tahun ajaran' },
];

/**
 * Halaman "Level" — tampilan lintas program dari semua Level (flat + searchable),
 * pelengkap dari alur Program -> Level bertingkat di halaman "Program".
 * CRUD lewat endpoint yang sama (`/levels`).
 */
export function LevelsManager({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const [programFilter, setProgramFilter] = useState('');
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLevel, setEditingLevel] = useState<LevelItem | null>(null);
  const [form, setForm] = useState<LevelFormState>(EMPTY_FORM);

  const levelsQ = useQuery({
    queryKey: ['levels', programFilter],
    queryFn: () => apiFetch<LevelItem[]>(`/levels${programFilter ? `?programId=${programFilter}` : ''}`),
  });

  const programsQ = useQuery({
    queryKey: ['programs-lite'],
    queryFn: () => apiFetch<ProgramItem[]>('/programs'),
  });

  const subjectsQ = useQuery({
    queryKey: ['master-subjects'],
    queryFn: () => apiFetch<MasterItem[]>('/master/subjects'),
  });
  const gradeLevelsQ = useQuery({
    queryKey: ['master-grade-levels'],
    queryFn: () => apiFetch<MasterItem[]>('/master/grade-levels'),
  });

  const saveM = useMutation({
    mutationFn: () => {
      if (editingLevel) {
        return apiFetch(`/levels/${editingLevel.id}`, {
          method: 'PATCH',
          body: {
            name: form.name || undefined,
            gradeLevelId:
              form.gradeLevelId === '__none__' ? null : form.gradeLevelId || undefined,
            subjectId:
              form.subjectId === '__none__' ? null : form.subjectId || undefined,
            sortOrder: form.sortOrder === '' ? undefined : Number(form.sortOrder),
            price: form.price === '' ? null : Number(form.price),
            priceUnit: form.priceUnit === '__none__' ? null : form.priceUnit || undefined,
            subjectIds: form.subjectIds.split(',').filter(Boolean),
            isActive: form.isActive,
          },
        });
      }
      return apiFetch('/levels', {
        method: 'POST',
        body: {
          programId: form.programId,
          gradeLevelId: form.gradeLevelId || undefined,
          subjectId: form.subjectId || undefined,
          name: form.name || undefined,
          price: form.price === '' ? undefined : Number(form.price),
          priceUnit: form.priceUnit === '__none__' ? undefined : form.priceUnit || undefined,
          subjectIds: form.subjectIds.split(',').filter(Boolean),
          sortOrder: form.sortOrder === '' ? undefined : Number(form.sortOrder),
        },
      });
    },
    onSuccess: () => {
      toast.success(editingLevel ? 'Level diperbarui.' : 'Level dibuat.');
      closeDialog();
      qc.invalidateQueries({ queryKey: ['levels'] });
      qc.invalidateQueries({ queryKey: ['levels-lite'] });
    },
    onError: (e) => toast.error(err(e, editingLevel ? 'Gagal memperbarui level.' : 'Gagal membuat level.')),
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingLevel(null);
    setForm(EMPTY_FORM);
  };

  const openCreate = () => {
    setEditingLevel(null);
    setForm({ ...EMPTY_FORM, programId: programFilter });
    setDialogOpen(true);
  };

  const openEdit = (level: LevelItem) => {
    setEditingLevel(level);
    setForm({
      programId: level.programId,
      name: level.name,
      sortOrder: String(level.sortOrder ?? 0),
      isActive: level.isActive,
      gradeLevelId: level.gradeLevelId ?? '__none__',
      subjectId: level.subjectId ?? '__none__',
      price: level.price === null || level.price === undefined ? '' : String(level.price),
      priceUnit: level.priceUnit ?? 'MONTH',
      subjectIds: (level.levelSubjects ?? []).map((ls) => ls.subjectId).join(','),
    });
    setDialogOpen(true);
  };

  const levels = levelsQ.data ?? [];
  const filteredLevels = search
    ? levels.filter(
        (l) =>
          l.name.toLowerCase().includes(search.toLowerCase()) ||
          (l.program?.name ?? '').toLowerCase().includes(search.toLowerCase()),
      )
    : levels;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Level</h1>
        <p className="text-sm text-muted-foreground">
          Daftar semua Jenjang lintas Program — kelola dari halaman ini atau dari detail &quot;Program&quot;.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-44">
          <Phase1aSelectField
            id="lvl-program-filter"
            label="Program"
            value={programFilter}
            onChange={setProgramFilter}
            options={programsQ.data?.map((p) => ({ value: p.id, label: p.name })) || []}
          />
        </div>
        <div className="grid w-full gap-1.5 sm:w-56">
          <Label htmlFor="lvl-search">Cari</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="lvl-search"
              placeholder="Cari nama level/program..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        {canManage && (
          <Button className="w-full sm:w-auto" onClick={openCreate}>
            <Plus className="size-4" />
            Tambah Level
          </Button>
        )}
      </div>

      {levelsQ.isLoading ? <Skeleton className="h-24 w-full" /> : null}
      {levelsQ.isError ? <p className="text-sm text-destructive">Gagal memuat level.</p> : null}
      {!levelsQ.isLoading && filteredLevels.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada level untuk filter ini.</p>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        {filteredLevels.map((level) => (
          <Card key={level.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2 text-base">
                <span className="truncate">{level.name}</span>
                <div className="flex gap-1">
                  {level.gradeLevel ? <Badge variant="outline">{level.gradeLevel.code}</Badge> : null}
                  {!level.isActive && <Badge variant="destructive">Non-aktif</Badge>}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <p className="text-muted-foreground">Program: {level.program?.name ?? '—'}</p>
              <p className="text-muted-foreground">
                {level.gradeLevel ? `Level Kelas: ${level.gradeLevel.name} · ` : ''}
                Mapel: {level.subject?.name ?? level.program?.subject?.name ?? '—'}
              </p>
              {(level.levelSubjects ?? []).length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {(level.levelSubjects ?? []).map((ls) => (
                    <Badge key={ls.subjectId} variant="outline" className="text-[11px]">
                      {ls.subject?.name ?? ls.subjectId}
                    </Badge>
                  ))}
                </div>
              ) : null}
              <p className="text-muted-foreground">
                Harga: {level.price !== null && level.price !== undefined ? `Rp ${Number(level.price).toLocaleString('id-ID')}` : '—'}
                {level.priceUnit ? ` / ${PRICE_UNIT_OPTIONS.find((u) => u.value === level.priceUnit)?.label.toLowerCase() ?? level.priceUnit}` : ''}
                {' · '}Urutan: {level.sortOrder}
              </p>
              {canManage && (
                <Button variant="outline" size="sm" className="w-fit mt-1" onClick={() => openEdit(level)}>
                  Edit
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) closeDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingLevel ? `Edit Level — ${editingLevel.name}` : 'Tambah Level'}</DialogTitle>
            <DialogDescription>
              {editingLevel ? 'Perbarui nama, urutan, atau status aktif level ini.' : 'Buat level baru di bawah sebuah Program.'}
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              saveM.mutate();
            }}
          >
            {!editingLevel && (
              <div className="flex flex-col gap-1.5">
                <Phase1aSelectField
                  id="lvl-program"
                  label="Program"
                  value={form.programId}
                  onChange={(v) => setForm({ ...form, programId: v })}
                  options={programsQ.data?.map((p) => ({ value: p.id, label: p.name })) || []}
                  required
                />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Phase1aSelectField
                id="lvl-grade"
                label="Level Kelas"
                value={form.gradeLevelId}
                onChange={(v) => {
                  const gl = gradeLevelsQ.data?.find((g) => g.id === v);
                  setForm({
                    ...form,
                    gradeLevelId: v,
                    // Auto-isi nama & urutan dari master (masih bisa diedit).
                    ...(v && !editingLevel
                      ? {
                          name: form.name || gl?.name || '',
                          sortOrder:
                            form.sortOrder && form.sortOrder !== '0'
                              ? form.sortOrder
                              : String(gl?.sortOrder ?? 0),
                        }
                      : {}),
                  });
                }}
                options={[
                  ...(editingLevel
                    ? [{ value: '__none__', label: '— Tanpa level kelas —' }]
                    : []),
                  ...(gradeLevelsQ.data ?? []).map((g) => ({
                    value: g.id,
                    label: `${g.code} — ${g.name}`,
                  })),
                ]}
                placeholder="Pilih dari master data"
                emptyText="Belum ada level kelas — tambah di Master Data."
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Phase1aSelectField
                id="lvl-subject"
                label="Mata Pelajaran"
                value={form.subjectId}
                onChange={(v) => setForm({ ...form, subjectId: v })}
                options={[
                  ...(editingLevel
                    ? [{ value: '__none__', label: '— Ikuti program —' }]
                    : []),
                  ...(subjectsQ.data ?? []).map((s) => ({
                    value: s.id,
                    label: `${s.code} — ${s.name}`,
                  })),
                ]}
                placeholder="Ikuti mapel program / pilih lain"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lvl-name">Nama Level *</Label>
              <Input
                id="lvl-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Contoh: SMP — otomatis dari Level Kelas"
                required={!form.gradeLevelId || form.gradeLevelId === '__none__'}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="lvl-price">Harga (Rp)</Label>
                <Input
                  id="lvl-price"
                  type="number"
                  min={0}
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  placeholder="450000"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Phase1aSelectField
                  id="lvl-price-unit"
                  label="Satuan"
                  value={form.priceUnit}
                  onChange={(v) => setForm({ ...form, priceUnit: v })}
                  options={PRICE_UNIT_OPTIONS}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-medium">Mapel dalam jenjang (opsional)</p>
              <div className="flex max-h-36 flex-wrap gap-2 overflow-y-auto rounded-md border p-2">
                {(subjectsQ.data ?? []).map((s) => {
                  const selected = form.subjectIds.split(',').includes(s.id);
                  return (
                    <label key={s.id} htmlFor={`lvl-ms-${s.id}`} className="flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs has-checked:bg-accent">
                      <input
                        id={`lvl-ms-${s.id}`}
                        type="checkbox"
                        checked={selected}
                        onChange={() => {
                          const set = new Set(form.subjectIds.split(',').filter(Boolean));
                          if (set.has(s.id)) set.delete(s.id);
                          else set.add(s.id);
                          setForm({ ...form, subjectIds: [...set].join(',') });
                        }}
                        className="size-3.5"
                      />
                      {s.code} — {s.name}
                    </label>
                  );
                })}
              </div>
            </div>

            {editingLevel && (
              <div className="flex items-center gap-2">
                <input
                  id="lvl-active"
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  className="h-4 w-4"
                />
                <Label htmlFor="lvl-active">Aktif</Label>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>
                Batal
              </Button>
              <Button type="submit" disabled={saveM.isPending || (!editingLevel && !form.programId)}>
                {saveM.isPending ? 'Menyimpan...' : editingLevel ? 'Simpan Perubahan' : 'Buat Level'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
