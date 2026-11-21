"use client";
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, ChevronDown, GraduationCap, Layers, Mail, Phone, User, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { apiFetch } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import type { GroupDetail, GroupListItem } from '@/lib/phase1b-types';

/** Daftar siswa satu kelompok — dimuat saat kartu dibuka. */
function GroupMembers({ groupId }: { groupId: string }) {
  const q = useQuery({
    queryKey: ['groups-mine-detail', groupId],
    queryFn: () => apiFetch<GroupDetail>(`/groups/mine/${groupId}`),
  });
  if (q.isLoading) return <Skeleton className="h-16 w-full" />;
  if (q.isError) {
    return (
      <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
        Daftar siswa gagal dimuat. Coba buka ulang kartu ini.
      </p>
    );
  }
  const members = q.data?.members ?? [];
  const subject = q.data?.program?.subject ?? q.data?.level?.subject;
  const levelSubjects = q.data?.level?.levelSubjects?.map((ls) => ls.subject.name) ?? [];
  if (!members.length) {
    return (
      <p className="rounded-lg border border-dashed px-3 py-3 text-center text-xs text-muted-foreground">
        Belum ada siswa di kelompok ini.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      {subject ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <BookOpen className="size-3.5" /> Mapel: {subject.name}
        </p>
      ) : levelSubjects.length ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <BookOpen className="size-3.5" /> Mapel: {levelSubjects.join(', ')}
        </p>
      ) : null}
      <ul className="divide-y rounded-lg border">
        {members.map((m, i) => {
          const u = m.student?.user;
          return (
            <li key={m.studentId} className="flex items-center gap-2.5 px-3 py-2 text-sm">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold tabular-nums">
                {i + 1}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-1.5 truncate font-medium">
                  <User className="size-3.5 shrink-0 text-muted-foreground" />
                  {u?.name ?? 'Tanpa nama'}
                </span>
                <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                  {u?.phone ? (
                    <span className="flex items-center gap-1"><Phone className="size-3" />{u.phone}</span>
                  ) : null}
                  {u?.email ? (
                    <span className="flex items-center gap-1 truncate"><Mail className="size-3" />{u.email}</span>
                  ) : null}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function TutorGroupsList() {
  const [openId, setOpenId] = useState<string | null>(null);
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
          {q.data?.length ? `${q.data.length} kelompok yang Anda ampu — ketuk kartu untuk melihat siswanya` : 'Memuat...'}
        </p>
      </div>
      {q.data?.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Belum ada kelompok"
          description="Anda belum ditugaskan ke kelompok mana pun."
        />
      ) : null}
      <div className="grid items-start gap-3 md:grid-cols-2">
        {q.data?.map((g) => {
          const open = openId === g.id;
          return (
            <Card
              key={g.id}
              className={cn('cursor-pointer transition-shadow hover:shadow-sm', open && 'ring-1 ring-primary/40')}
              onClick={() => setOpenId(open ? null : g.id)}
            >
              <CardContent className="flex gap-3 py-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-blue-50 text-primary">
                  <Users className="size-5" />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate font-medium">{g.name}</p>
                    <ChevronDown
                      className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
                    />
                  </div>
                  <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                    <GraduationCap className="size-3.5 shrink-0" /> {g.program.name}
                    {g.level ? <span className="flex items-center gap-1"><Layers className="size-3.5 shrink-0" />{g.level.name}</span> : null}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="tabular-nums"><Users />{g._count.members} siswa</Badge>
                    <Badge variant="outline" className="tabular-nums">{g._count.tutors} tutor</Badge>
                  </div>
                  {open ? (
                    <div className="mt-2 border-t pt-2.5" onClick={(e) => e.stopPropagation()}>
                      <GroupMembers groupId={g.id} />
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
