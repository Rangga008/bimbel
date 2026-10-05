"use client";
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Plus, Search, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { ComboboxField } from '@/components/shared/combobox-field';
import { apiFetch } from '@/lib/api-client';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import type { GroupListItem } from '@/lib/phase1b-types';

export function GroupsManager({ canManage, basePath }: { canManage: boolean; basePath: string }) {
  const [search, setSearch] = useState('');
  const [programFilter, setProgramFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const th = 'px-3 py-2 text-left font-medium whitespace-nowrap';
  const td = 'px-3 py-2 align-top';
  const groupsQ = useQuery({
    queryKey: ['groups', debouncedSearch],
    queryFn: () => apiFetch<GroupListItem[]>(`/groups${debouncedSearch ? `?search=${encodeURIComponent(debouncedSearch)}` : ''}`),
  });
  const programsQ = useQuery({
    queryKey: ['programs'],
    queryFn: () => apiFetch<Array<{ id: string; name: string; levels?: Array<{ id: string; name: string }> }>>('/programs'),
  });
  const levelOptions = useMemo(() => {
    const all = (groupsQ.data ?? [])
      .filter((g) => !programFilter || g.programId === programFilter)
      .map((g) => g.level)
      .filter((l): l is { id: string; name: string } => !!l);
    return [...new Map(all.map((l) => [l.id, l])).values()];
  }, [groupsQ.data, programFilter]);
  const groups = (groupsQ.data ?? []).filter((g) => {
    if (programFilter && g.programId !== programFilter) return false;
    if (levelFilter && g.levelId !== levelFilter) return false;
    return true;
  });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Kelompok</h1>
          <p className="text-sm text-muted-foreground">
            {groupsQ.data ? `${groupsQ.data.length} kelompok belajar` : 'Memuat...'}
          </p>
        </div>
        {canManage ? (
          <Link href={`${basePath}/kelompok/baru`}>
            <Button><Plus /> Tambah Kelompok</Button>
          </Link>
        ) : null}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Cari nama / kode..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="w-full sm:w-56">
          <ComboboxField
            id="group-program-filter"
            value={programFilter}
            onChange={(v) => { setProgramFilter(v); setLevelFilter(''); }}
            options={(programsQ.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
            placeholder="- Semua program -"
          />
        </div>
        <div className="w-full sm:w-56">
          <ComboboxField
            id="group-level-filter"
            value={levelFilter}
            onChange={setLevelFilter}
            options={levelOptions.map((l) => ({ value: l.id, label: l.name }))}
            placeholder="- Semua jenjang -"
          />
        </div>
      </div>
      {groupsQ.isLoading ? <Skeleton className="h-20 w-full" /> : null}
      {groupsQ.isError ? (
        <EmptyState icon={Users} title="Gagal memuat kelompok" description="Coba muat ulang halaman." />
      ) : null}
      {!groupsQ.isLoading && !groupsQ.isError && groups.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Belum ada kelompok"
          description="Belum ada kelompok belajar yang cocok dengan pencarian."
          action={canManage ? <Link href={`${basePath}/kelompok/baru`}><Button size="sm"><Plus /> Tambah Kelompok</Button></Link> : undefined}
        />
      ) : null}
      {groups.length > 0 ? (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className={th}>Kelompok</th>
                <th className={th}>Program / Jenjang</th>
                <th className={th}>Siswa</th>
                <th className={th}>Tutor</th>
                <th className={th}>Status</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.id} className="border-b last:border-0">
                  <td className={`${td} font-medium whitespace-nowrap`}>
                    {g.name}
                    {g.code ? <p className="text-xs font-normal text-muted-foreground">{g.code}</p> : null}
                  </td>
                  <td className={`${td} text-muted-foreground`}>
                    {g.program.name}{g.level ? ` — ${g.level.name}` : ''}
                  </td>
                  <td className={`${td} tabular-nums whitespace-nowrap`}>{g._count.members}</td>
                  <td className={`${td} tabular-nums whitespace-nowrap`}>{g._count.tutors}</td>
                  <td className={`${td} whitespace-nowrap`}>
                    <Badge variant={g.isActive ? 'secondary' : 'outline'}>{g.isActive ? 'Aktif' : 'Nonaktif'}</Badge>
                  </td>
                  <td className={`${td} text-right whitespace-nowrap`}>
                    <Link href={`${basePath}/kelompok/${g.id}`}>
                      <Button variant="ghost" size="sm" className="text-primary">Kelola <ChevronRight /></Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
