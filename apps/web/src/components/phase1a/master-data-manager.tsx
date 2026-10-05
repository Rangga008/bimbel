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

  const listQ = useQuery({
    queryKey: ['master', kind],
    queryFn: () => apiFetch<MasterItem[]>(`/master/${kind}?all=true`),
  });

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
        },
      }),
    onSuccess: () => {
      toast.success(`${title} ditambahkan.`);
      setOpen(false);
      setForm({ sortOrder: '0' });
      qc.invalidateQueries({ queryKey: ['master', kind] });
      // Dropdown di form Program/Level memakai key ini — segarkan juga.
      qc.invalidateQueries({
        queryKey: [kind === 'subjects' ? 'master-subjects' : 'master-grade-levels'],
      });
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
      qc.invalidateQueries({ queryKey: ['master', kind] });
    },
    onError: (e) => toast.error(err(e, 'Gagal mengubah status.')),
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
            {listQ.data.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-2 py-2"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="font-mono">
                    {item.code}
                  </Badge>
                  <span className="text-sm">{item.name}</span>
                  {!item.isActive ? (
                    <Badge variant="outline" className="text-muted-foreground">
                      Nonaktif
                    </Badge>
                  ) : null}
                </div>
                {canManage ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleM.mutate(item)}
                    disabled={toggleM.isPending}
                  >
                    {item.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                  </Button>
                ) : null}
              </div>
            ))}
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
      />
    </Card>
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
