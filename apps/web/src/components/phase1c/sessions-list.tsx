"use client";
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, DoorOpen, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { ApiErrorState } from '@/components/shared/api-error-state';
import { apiFetch } from '@/lib/api-client';
import { SessionCalendar } from '@/components/shared/session-calendar';
import type { SessionItem } from '@/lib/phase1c-types';
import { fmtDateTime } from '@/lib/phase1c-types';

/** Daftar sesi konkret — dipakai read-only oleh Siswa/Ortu/Tutor/Admin. `hideList` = tampil kalender saja. */
export function SessionsList({ endpoint, title, subtitle, hideList = false }: { endpoint: string; title: string; subtitle: string; hideList?: boolean }) {
  const q = useQuery({ queryKey: ['sessions', endpoint], queryFn: () => apiFetch<SessionItem[]>(endpoint), enabled: !hideList });
  if (!hideList && q.isLoading) return <Skeleton className="h-20 w-full" />;
  if (!hideList && q.isError) {
    return <ApiErrorState error={q.error} onRetry={() => q.refetch()} />;
  }
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <SessionCalendar endpoint={endpoint} />
      {hideList ? null : q.data?.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="Belum ada sesi"
          description="Belum ada sesi terjadwal."
        />
      ) : null}
      {hideList ? null : <p className="text-sm font-medium">Semua sesi</p>}
      <div className="flex flex-col gap-2">
        {(hideList ? [] : q.data)?.map((s) => (
          <Card key={s.id}><CardContent className="flex items-center gap-3 py-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <CalendarClock className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{s.group.name}</p>
              <p className="truncate text-xs text-muted-foreground">{fmtDateTime(s.startsAt)}</p>
              <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                <User className="size-3.5 shrink-0" /> {s.tutor ? `${s.tutor.user.name}${s.tutor.user.phone ? ` · ${s.tutor.user.phone}` : ''}` : 'Tutor menyusul'}
                <DoorOpen className="ml-2 size-3.5 shrink-0" /> {s.room ? s.room.name : 'Ruang menyusul'}
              </p>
            </div>
            <Badge variant={s.status === 'SCHEDULED' ? 'secondary' : 'outline'}>{s.status}</Badge>
          </CardContent></Card>
        ))}
      </div>
    </div>
  );
}
