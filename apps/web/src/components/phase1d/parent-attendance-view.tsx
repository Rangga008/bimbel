"use client";
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarCheck, ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import type { AttendanceRow, AttendanceStatus, ParentAttendanceRecap } from '@/lib/phase1d-types';
import { ATTENDANCE_LABELS } from '@/lib/phase1d-types';

const DAY_NAMES = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

const STATUS_STYLE: Record<AttendanceStatus, string> = {
  HADIR: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/40',
  TERLAMBAT: 'bg-amber-500/15 text-amber-700 border-amber-500/40',
  IZIN: 'bg-sky-500/15 text-sky-700 border-sky-500/40',
  SAKIT: 'bg-violet-500/15 text-violet-700 border-violet-500/40',
  ALFA: 'bg-red-500/15 text-red-700 border-red-500/40',
};

const STATUS_BADGE_VARIANT: Record<AttendanceStatus, 'secondary' | 'outline' | 'destructive'> = {
  HADIR: 'secondary',
  TERLAMBAT: 'outline',
  IZIN: 'outline',
  SAKIT: 'outline',
  ALFA: 'destructive',
};

function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Nama pendek anak untuk chip kalender (kata pertama). */
function shortName(name: string) {
  return name.split(' ')[0] ?? name;
}

interface MergedRow extends AttendanceRow {
  childName: string;
}

/**
 * Kalender kehadiran gabungan semua anak — satu tanggal menampilkan
 * status tiap anak sekaligus (chip "Nama · Status").
 */
function MergedAttendanceCalendar({ rows }: { rows: MergedRow[] }) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selected, setSelected] = useState<string | null>(null);

  const byDay = useMemo(() => {
    const m = new Map<string, MergedRow[]>();
    for (const r of rows) {
      const k = dayKey(new Date(r.session.startsAt));
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    return m;
  }, [rows]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // Senin = kolom pertama (getDay: Min=0 → jadi index 6).
  const leadBlanks = (new Date(year, month, 1).getDay() + 6) % 7;
  const monthLabel = cursor.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  const selectedRows = selected ? (byDay.get(selected) ?? []) : [];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Button variant="outline" size="icon" className="size-8" aria-label="Bulan sebelumnya"
          onClick={() => { setCursor(new Date(year, month - 1, 1)); setSelected(null); }}>
          <ChevronLeft className="size-4" />
        </Button>
        <p className="text-sm font-medium capitalize">{monthLabel}</p>
        <Button variant="outline" size="icon" className="size-8" aria-label="Bulan berikutnya"
          onClick={() => { setCursor(new Date(year, month + 1, 1)); setSelected(null); }}>
          <ChevronRight className="size-4" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
        {DAY_NAMES.map((d) => <span key={d} className="py-1">{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: leadBlanks }).map((_, i) => <span key={`b${i}`} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const k = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const dayRows = byDay.get(k) ?? [];
          return (
            <button
              key={k}
              type="button"
              disabled={dayRows.length === 0}
              onClick={() => setSelected(selected === k ? null : k)}
              className={cn(
                'flex min-h-11 flex-col items-center justify-start gap-0.5 rounded-md border p-1 text-xs transition-colors',
                dayRows.length ? 'hover:bg-muted/60 cursor-pointer' : 'border-transparent text-muted-foreground/60',
                selected === k && 'ring-2 ring-primary',
              )}
            >
              <span className="font-medium">{day}</span>
              <span className="flex w-full flex-col gap-0.5">
                {dayRows.map((r) => (
                  <span
                    key={r.id}
                    title={`${r.childName} — ${r.session.group.name} — ${ATTENDANCE_LABELS[r.status]}`}
                    className={cn('truncate rounded-sm border px-0.5 text-[10px] leading-4', STATUS_STYLE[r.status])}
                  >
                    {shortName(r.childName)} · {ATTENDANCE_LABELS[r.status]}
                  </span>
                ))}
              </span>
            </button>
          );
        })}
      </div>
      {selected && (
        <div className="flex flex-col gap-1.5 rounded-md border p-2">
          <p className="text-xs font-medium text-muted-foreground">
            {new Date(selected + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          {selectedRows.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate">
                <span className="font-medium">{r.childName}</span>
                {' — '}
                {r.session.group.name} ·{' '}
                {new Date(r.session.startsAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                {r.note ? <span className="text-muted-foreground"> — {r.note}</span> : null}
              </span>
              <Badge variant={STATUS_BADGE_VARIANT[r.status]}>{ATTENDANCE_LABELS[r.status]}</Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Halaman "Kehadiran" milik Orang Tua — satu kalender untuk semua anak. */
export function ParentAttendanceView() {
  const q = useQuery({ queryKey: ['attendance-children'], queryFn: () => apiFetch<ParentAttendanceRecap>('/attendance/mine-children') });

  const mergedRows = useMemo<MergedRow[]>(
    () =>
      (q.data?.children ?? []).flatMap((c) =>
        c.rows.map((r) => ({ ...r, childName: c.student.user.name })),
      ),
    [q.data],
  );

  if (q.isLoading) return <Skeleton className="h-24 w-full" />;
  if (q.isError) {
    return <Card><CardContent className="py-10 text-center text-sm text-destructive">Gagal memuat kehadiran anak.</CardContent></Card>;
  }
  const children = q.data?.children ?? [];
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Kehadiran</h1>
        <p className="text-sm text-muted-foreground">
          Satu kalender untuk semua anak — tiap tanggal menampilkan status tiap anak. Klik tanggal untuk detail sesi.
        </p>
      </div>
      {children.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Belum ada data kehadiran untuk anak Anda.</CardContent></Card>
      ) : null}
      {children.length > 0 ? (
        <Card>
          <CardContent className="flex flex-col gap-3 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 font-medium">
                <CalendarCheck className="size-4 text-muted-foreground" />
                Semua anak
              </p>
              <div className="flex flex-wrap gap-1.5">
                {children.map((c) => (
                  <Badge key={c.student.id} variant="outline">
                    {c.student.user.name}: {c.byStatus.HADIR ?? 0}/{c.total} hadir
                  </Badge>
                ))}
              </div>
            </div>
            <MergedAttendanceCalendar rows={mergedRows} />
            {mergedRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada absensi tercatat.</p>
            ) : null}
            <div className="flex flex-wrap gap-1.5 border-t pt-3">
              {(Object.keys(STATUS_STYLE) as AttendanceStatus[]).map((s) => (
                <span key={s} className={cn('rounded-sm border px-1.5 py-0.5 text-[10px]', STATUS_STYLE[s])}>
                  {ATTENDANCE_LABELS[s]}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
