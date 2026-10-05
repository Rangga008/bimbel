"use client";
import { useQuery } from '@tanstack/react-query';
import { GraduationCap, Layers, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { apiFetch } from '@/lib/api-client';
import type { GroupListItem } from '@/lib/phase1b-types';

export function TutorGroupsList() {
  const q = useQuery({
    queryKey: ['groups-mine'],
    queryFn: () => apiFetch<GroupListItem[]>('/groups/mine'),
  });
  if (q.isLoading) return <Skeleton className="h-20 w-full" />;
  if (q.isError) {
    return (
      <EmptyState icon={Users} title="Gagal memuat kelompok" description="Kelompok yang Anda ampu gagal dimuat. Coba muat ulang." />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Kelompok</h1>
        <p className="text-sm text-muted-foreground">
          {q.data?.length ? `${q.data.length} kelompok yang Anda ampu` : 'Memuat...'}
        </p>
      </div>
      {q.data?.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Belum ada kelompok"
          description="Anda belum ditugaskan ke kelompok mana pun."
        />
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        {q.data?.map((g) => (
          <Card key={g.id}>
            <CardContent className="flex gap-3 py-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-blue-50 text-primary">
                <Users className="size-5" />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <p className="truncate font-medium">{g.name}</p>
                <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                  <GraduationCap className="size-3.5 shrink-0" /> {g.program.name}
                  {g.level ? <span className="flex items-center gap-1"><Layers className="size-3.5 shrink-0" />{g.level.name}</span> : null}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline" className="tabular-nums"><Users />{g._count.members} siswa</Badge>
                  <Badge variant="outline" className="tabular-nums">{g._count.tutors} tutor</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
