'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, BellRing, CalendarDays, GraduationCap, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { UserAvatar } from '@/components/shared/user-avatar';
import { apiFetch, ApiError } from '@/lib/api-client';
import type { TutorItem } from '@/lib/phase1a-types';
import type { SessionItem } from '@/lib/phase1c-types';

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('id-ID', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function weekBounds() {
  const now = new Date();
  const day = (now.getDay() + 6) % 7; // Senin = 0
  const start = new Date(now);
  start.setDate(now.getDate() - day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { from: start.toISOString(), to: end.toISOString() };
}

/** Detail tutor — informasi, kelompok yang diampu, jadwal minggu ini,
 *  dan tombol kirim reminder WA jadwal ke tutor tersebut. */
export function TutorDetailPage({ tutorId, basePath }: { tutorId: string; basePath: string }) {
  const router = useRouter();
  const tutorQ = useQuery({
    queryKey: ['tutor', tutorId],
    queryFn: () => apiFetch<TutorItem>(`/tutors/${tutorId}`),
  });

  const { from, to } = weekBounds();
  const sessionsQ = useQuery({
    queryKey: ['tutor-sessions', tutorId, from],
    queryFn: () =>
      apiFetch<SessionItem[]>(
        `/sessions?tutorId=${tutorId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      ),
  });

  const remindM = useMutation({
    mutationFn: () =>
      apiFetch<{ queued: number; recipients: number }>(
        `/tutors/${tutorId}/reminders/weekly-schedule`,
        { method: 'POST' },
      ),
    onSuccess: (r) =>
      toast.success(
        r.queued > 0
          ? 'Reminder jadwal terkirim ke WA tutor.'
          : 'Tidak ada nomor WA / tutor tidak punya sesi minggu ini.',
      ),
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : 'Gagal mengirim reminder.'),
  });

  const t = tutorQ.data;
  const groups = (t?.groupTutors ?? []).filter((g) => g.group.isActive);
  const sessions = sessionsQ.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={() => router.push(`${basePath}/tutor`)} aria-label="Kembali">
          <ArrowLeft className="size-4" />
        </Button>
        {t ? (
          <UserAvatar name={t.user.name} avatarUrl={t.user.avatarUrl} className="size-10" />
        ) : null}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {t ? t.user.name : 'Detail Tutor'}
          </h1>
          <p className="truncate text-sm text-muted-foreground">
            {t?.user.email ?? 'Memuat...'}
            {t?.user.phone ? ` · ${t.user.phone}` : ''}
          </p>
        </div>
        {t ? (
          <Button
            variant="outline"
            size="sm"
            disabled={remindM.isPending}
            onClick={() => remindM.mutate()}
          >
            <BellRing className="mr-1 size-4" />
            {remindM.isPending ? 'Mengirim…' : 'Reminder Jadwal'}
          </Button>
        ) : null}
      </div>

      {tutorQ.isLoading ? (
        <>
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-40 w-full" />
        </>
      ) : null}

      {tutorQ.isError ? (
        <EmptyState
          icon={GraduationCap}
          title="Tutor tidak ditemukan"
          description="Data tutor tidak ada atau Anda tidak memiliki akses."
          action={
            <Link href={`${basePath}/tutor`}>
              <Button size="sm" variant="outline">Kembali</Button>
            </Link>
          }
        />
      ) : null}

      {t ? (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="size-4" /> Kelompok yang Diampu
                <Badge variant="secondary" className="tabular-nums">{groups.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {groups.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Belum ditugaskan ke kelompok mana pun.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {groups.map((g) => (
                    <Link key={g.groupId} href={`${basePath}/kelompok/${g.groupId}`}>
                      <Badge
                        variant={g.isLead ? 'default' : 'outline'}
                        className="cursor-pointer px-3 py-1.5 text-sm"
                      >
                        {g.group.name}
                        {g.group.code ? ` (${g.group.code})` : ''}
                        {g.isLead ? ' · Lead' : ''}
                      </Badge>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarDays className="size-4" /> Jadwal Minggu Ini
                <Badge variant="secondary" className="tabular-nums">{sessions.length} sesi</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {sessionsQ.isLoading ? (
                <p className="text-sm text-muted-foreground">Memuat jadwal...</p>
              ) : sessions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Tidak ada sesi minggu ini.
                </p>
              ) : (
                <div className="flex flex-col divide-y">
                  {sessions.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between gap-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">
                          {s.subject?.name ??
                            s.schedule?.subject?.name ??
                            s.group.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {s.group.name} · {fmtDateTime(s.startsAt)} –{' '}
                          {new Date(s.endsAt).toLocaleTimeString('id-ID', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                          {s.room ? ` · ${s.room.name}` : ''}
                        </p>
                      </div>
                      <Badge
                        variant={
                          s.status === 'CANCELLED'
                            ? 'destructive'
                            : s.status === 'COMPLETED'
                              ? 'secondary'
                              : 'outline'
                        }
                        className="shrink-0"
                      >
                        {s.status === 'CANCELLED'
                          ? 'Batal'
                          : s.status === 'COMPLETED'
                            ? 'Selesai'
                            : 'Terjadwal'}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
