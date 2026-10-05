"use client";

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronRight, GraduationCap, Layers, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { ComboboxField } from '@/components/shared/combobox-field';
import { apiFetch, ApiError } from '@/lib/api-client';
import type { MasterItem, ProgramItem } from '@/lib/phase1a-types';
import {
  Phase1aFormDialog,
  Phase1aSelectField,
  type Phase1aField,
} from '@/components/phase1a/phase1a-form-dialog';

const PROGRAM_FIELDS: Phase1aField[] = [
  { name: 'name', label: 'Nama program', placeholder: 'Kelas Reguler SD', required: true },
  { name: 'code', label: 'Kode', placeholder: 'REG-SD', required: true },
  { name: 'registrationFee', label: 'Biaya pendaftaran (Rp, opsional)', type: 'number', placeholder: '150000' },
  { name: 'description', label: 'Deskripsi (opsional)' },
];

const CATEGORY_OPTIONS = [
  { value: 'REGULER', label: 'Kelas Reguler' },
  { value: 'EXTRA', label: 'Kelas Extra' },
  { value: 'PRIVAT', label: 'Kelas Privat' },
];

export function categoryLabel(category?: string) {
  return CATEGORY_OPTIONS.find((c) => c.value === category)?.label ?? 'Kelas Reguler';
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

/** Daftar Program + dialog tambah program. Level & paket dikelola lewat halaman detail (Kelola). */
export function ProgramsListPart({
  canManage,
  basePath,
}: {
  canManage: boolean;
  basePath: string;
}) {
  const queryClient = useQueryClient();
  const [programOpen, setProgramOpen] = useState(false);
  const [programForm, setProgramForm] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  const programsQuery = useQuery({
    queryKey: ['programs'],
    queryFn: () => apiFetch<ProgramItem[]>('/programs'),
  });
  const subjectsQuery = useQuery({
    queryKey: ['master-subjects'],
    queryFn: () => apiFetch<MasterItem[]>('/master/subjects'),
  });

  const q = search.trim().toLowerCase();
  const programs = (programsQuery.data ?? []).filter((p) => {
    if (categoryFilter && (p.category ?? 'REGULER') !== categoryFilter) return false;
    if (subjectFilter && p.subjectId !== subjectFilter) return false;
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      p.code.toLowerCase().includes(q) ||
      (p.subject?.name ?? '').toLowerCase().includes(q) ||
      (p.subject?.code ?? '').toLowerCase().includes(q)
    );
  });

  const createProgram = useMutation({
    mutationFn: () =>
      apiFetch<ProgramItem>('/programs', {
        method: 'POST',
        body: {
          name: programForm.name,
          code: programForm.code,
          category: programForm.category || 'REGULER',
          registrationFee:
            programForm.registrationFee === '' || programForm.registrationFee === undefined
              ? undefined
              : Number(programForm.registrationFee),
          subjectId: programForm.subjectId || undefined,
          description: programForm.description || undefined,
        },
      }),
    onSuccess: () => {
      toast.success('Program dibuat.');
      setProgramOpen(false);
      setProgramForm({});
      queryClient.invalidateQueries({ queryKey: ['programs'] });
    },
    onError: (error) => toast.error(errorMessage(error, 'Gagal membuat program.')),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Program</h1>
          <p className="text-sm text-muted-foreground">
            {programsQuery.data ? `${programs.length} dari ${programsQuery.data.length} program` : 'Memuat...'}
          </p>
        </div>
        {canManage ? (
          <Button onClick={() => setProgramOpen(true)}>Tambah Program</Button>
        ) : null}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Cari nama / kode / mapel..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="w-full sm:w-48">
          <ComboboxField
            id="program-category-filter"
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={CATEGORY_OPTIONS}
            placeholder="- Semua kategori -"
          />
        </div>
        <div className="w-full sm:w-56">
          <ComboboxField
            id="program-subject-filter"
            value={subjectFilter}
            onChange={setSubjectFilter}
            options={(subjectsQuery.data ?? []).map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` }))}
            placeholder="- Semua mapel -"
          />
        </div>
      </div>
      {programsQuery.isLoading ? <Skeleton className="h-28 w-full" /> : null}
      {!programsQuery.isLoading && programs.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title={search || subjectFilter ? 'Program tidak ditemukan' : 'Belum ada program'}
          description={search || subjectFilter ? 'Coba ubah kata kunci atau filter mapel.' : 'Tambahkan program pertama.'}
        />
      ) : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {programs.map((program) => (
          <Card key={program.id}>
            <CardContent className="flex flex-col gap-2 py-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {program.name}{' '}
                    <span className="text-xs font-normal text-muted-foreground">{program.code}</span>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {categoryLabel(program.category)}
                    {program.subject ? ` · ${program.subject.code} — ${program.subject.name}` : ''}
                  </p>
                </div>
                <Badge variant={program.isActive ? 'secondary' : 'outline'}>{program.isActive ? 'Aktif' : 'Nonaktif'}</Badge>
              </div>
              <div className="flex items-center justify-between gap-2">
                <Badge variant="outline" className="tabular-nums"><Layers className="size-3.5" />{program._count?.levels ?? 0} level</Badge>
                <Link href={`${basePath}/program/${program.id}`}>
                  <Button variant="ghost" size="sm" className="px-0 text-primary">Kelola <ChevronRight /></Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Phase1aFormDialog
        open={programOpen}
        onOpenChange={setProgramOpen}
        title="Tambah Program"
        fields={PROGRAM_FIELDS}
        values={programForm}
        onChange={(n, v) => setProgramForm((p) => ({ ...p, [n]: v }))}
        onSubmit={() => createProgram.mutate()}
        isSubmitting={createProgram.isPending}
        submitLabel="Buat Program"
        extra={
          <>
          <Phase1aSelectField
            id="program-category"
            label="Kategori Kelas"
            value={programForm.category ?? 'REGULER'}
            onChange={(v) => setProgramForm((p) => ({ ...p, category: v }))}
            options={CATEGORY_OPTIONS}
            hint="Reguler = beberapa mapel per jenjang kelas; Extra = tambahan; Privat = 1-on-1."
          />
          {programForm.category === 'REGULER' || !programForm.category ? (
            <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
              Kelas reguler tidak memakai mapel utama — mapel diatur per jenjang lewat daftar mapel jenjang.
            </p>
          ) : (
            <Phase1aSelectField
              id="program-subject"
              label="Mata Pelajaran"
              value={programForm.subjectId ?? ''}
              onChange={(v) => setProgramForm((p) => ({ ...p, subjectId: v }))}
              options={(subjectsQuery.data ?? []).map((s) => ({
                value: s.id,
                label: `${s.code} — ${s.name}`,
              }))}
              placeholder="Pilih mapel dari master data"
              emptyText="Belum ada mapel — tambah di halaman Master Data."
              hint="Mapel utama (opsional) — kelas reguler biasanya multi-mapel, diatur per jenjang."
            />
          )}
          </>
        }
      />
    </div>
  );
}
