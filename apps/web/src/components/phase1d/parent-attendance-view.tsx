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

export interface MergedRow extends AttendanceRow {
  childName: string;
}

/** Chip ringkasan status — jumlah per status dengan warna statusnya. */
function StatusChip({ status, count }: { status: AttendanceStatus; count: number }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs', STATUS_STYLE[status])}>
      <span className="font-semibold tabular-nums">{count}</span> {ATTENDANCE_LABELS[status]}
    </span>
  );
}

/**
 * Kalender kehadiran gabungan — satu tanggal menampilkan
 * status tiap subjek sekaligus (chip "Nama · Status"). Dipakai
 * halaman ortu (semua anak) maupun siswa (milik sendiri).
 */
export function MergedAttendanceCalendar({ rows }: { rows: MergedRow[] }) {
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

function monthLabelId(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
}

/** Rekap bulanan satu anak: hadir+terlambat dibanding sesi seharusnya. */
function ChildMonthlyRecap({ child }: { child: ParentAttendanceRecap['children'][number] }) {
  // Status per bulan dari baris absensi anak ini.
  const byMonth = useMemo(() => {
    const m = new Map<string, Partial<Record<AttendanceStatus, number>>>();
    for (const r of child.rows) {
      const ym = r.session.startsAt.slice(0, 7);
      const cur = m.get(ym) ?? {};
      cur[r.status] = (cur[r.status] ?? 0) + 1;
      m.set(ym, cur);
    }
    return m;
  }, [child.rows]);

  const expected = child.expected?.byMonth ?? {};
  const months = [...new Set([...byMonth.keys(), ...Object.keys(expected)])].sort().reverse();

  const totalPresent = (child.byStatus.HADIR ?? 0) + (child.byStatus.TERLAMBAT ?? 0);
  const totalExpected = child.expected?.total ?? child.total;
  const pct = totalExpected ? Math.min(100, Math.round((totalPresent / totalExpected) * 100)) : 0;

  return (
    <div className="flex flex-col gap-3">
      {/* Ringkas: hadir (HADIR+TERLAMBAT) dari sesi seharusnya. */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Total keseluruhan</p>
        <Badge variant="secondary">
          {totalPresent}/{totalExpected} sesi hadir · {pct}%
        </Badge>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
      </div>

      {months.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          Belum ada sesi untuk anak ini.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b bg-muted/50 text-muted-foreground">
                <th className="px-3 py-2 font-medium">Bulan</th>
                <th className="px-3 py-2 font-medium">Sesi</th>
                <th className="px-3 py-2 font-medium">Hadir</th>
                <th className="px-3 py-2 font-medium">Terlambat</th>
                <th className="px-3 py-2 font-medium">Izin</th>
                <th className="px-3 py-2 font-medium">Sakit</th>
                <th className="px-3 py-2 font-medium">Alfa</th>
                <th className="px-3 py-2 font-medium">%</th>
              </tr>
            </thead>
            <tbody>
              {months.map((ym) => {
                const st = byMonth.get(ym) ?? {};
                const exp = expected[ym] ?? 0;
                const present = (st.HADIR ?? 0) + (st.TERLAMBAT ?? 0);
                const denom = exp || (st.HADIR ?? 0) + (st.TERLAMBAT ?? 0) + (st.IZIN ?? 0) + (st.SAKIT ?? 0) + (st.ALFA ?? 0);
                const mpct = denom ? Math.min(100, Math.round((present / denom) * 100)) : 0;
                return (
                  <tr key={ym} className="border-b last:border-0">
                    <td className="px-3 py-2 font-medium whitespace-nowrap">{monthLabelId(ym)}</td>
                    <td className="px-3 py-2 tabular-nums">{exp || '—'}</td>
                    <td className="px-3 py-2 tabular-nums text-emerald-700">{st.HADIR ?? 0}</td>
                    <td className="px-3 py-2 tabular-nums text-amber-700">{st.TERLAMBAT ?? 0}</td>
                    <td className="px-3 py-2 tabular-nums text-sky-700">{st.IZIN ?? 0}</td>
                    <td className="px-3 py-2 tabular-nums text-violet-700">{st.SAKIT ?? 0}</td>
                    <td className="px-3 py-2 tabular-nums text-red-700">{st.ALFA ?? 0}</td>
                    <td className="px-3 py-2">
                      <span className={cn(
                        'inline-block rounded px-1.5 py-0.5 font-semibold tabular-nums',
                        mpct >= 80 ? 'bg-emerald-500/15 text-emerald-700' : mpct >= 50 ? 'bg-amber-500/15 text-amber-700' : 'bg-red-500/15 text-red-700',
                      )}>
                        {mpct}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        “Sesi” = sesi kelompok yang sudah berlangsung bulan itu; selisih dengan
        total absen berarti sesi belum tercatat/absen belum diisi tutor.
      </p>
    </div>
  );
}

/** Halaman "Kehadiran" milik Orang Tua — kalender dulu, lalu pilih anak
 *  untuk melihat rekap kehadiran per bulan (hadir vs sesi seharusnya). */
export function ParentAttendanceView() {
  const q = useQuery({ queryKey: ['attendance-children'], queryFn: () => apiFetch<ParentAttendanceRecap>('/attendance/mine-children') });
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
  // Satu anak → langsung terpilih; multi-anak → ortu memilih dulu.
  const selected = children.find((c) => c.student.id === (selectedId ?? (children.length === 1 ? children[0].student.id : ''))) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Kehadiran</h1>
        <p className="text-sm text-muted-foreground">
          Klik tanggal di kalender untuk detail sesi; pilih anak di bawahnya untuk rekap per bulan.
        </p>
      </div>
      {children.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Belum ada data kehadiran untuk anak Anda.</CardContent></Card>
      ) : null}
      {children.length > 0 ? (
        <>
          {/* 1) Kalender gabungan semua anak — tampil pertama. */}
          <Card>
            <CardContent className="flex flex-col gap-3 py-4">
              <p className="flex items-center gap-2 font-medium">
                <CalendarCheck className="size-4 text-muted-foreground" />
                Kalender semua anak
              </p>
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

          {/* 2) Pilih anak — rekap bulanan baru tampil setelah dipilih. */}
          <Card>
            <CardContent className="flex flex-col gap-3 py-4">
              <p className="text-sm font-medium">Pilih siswa</p>
              <div className="flex flex-wrap gap-2">
                {children.map((c) => (
                  <Button
                    key={c.student.id}
                    size="sm"
                    variant={selected?.student.id === c.student.id ? 'default' : 'outline'}
                    onClick={() => setSelectedId(c.student.id)}
                  >
                    {c.student.user.name}
                  </Button>
                ))}
              </div>
              {selected ? (
                <div className="border-t pt-3">
                  <ChildMonthlyRecap child={selected} />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Pilih salah satu anak untuk melihat rekap kehadiran per bulannya.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

interface AttendanceRecapSelf {
  total: number;
  byStatus: Partial<Record<AttendanceStatus, number>>;
  rows: AttendanceRow[];
}

/** Halaman "Kehadiran" milik Siswa — ringkasan status + kalender sendiri. */
export function StudentAttendanceView() {
  const q = useQuery({
    queryKey: ['attendance-mine'],
    queryFn: () => apiFetch<AttendanceRecapSelf>('/attendance/mine-student'),
  });

  if (q.isLoading) return <Skeleton className="h-24 w-full" />;
  if (q.isError) {
    return <Card><CardContent className="py-10 text-center text-sm text-destructive">Gagal memuat kehadiran Anda.</CardContent></Card>;
  }
  const data = q.data;
  const rows: MergedRow[] = (data?.rows ?? []).map((r) => ({ ...r, childName: 'Anda' }));
  const pct = data && data.total ? Math.round(((data.byStatus.HADIR ?? 0) / data.total) * 100) : 0;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Kehadiran</h1>
        <p className="text-sm text-muted-foreground">Rekap absensi Anda — klik tanggal di kalender untuk detail sesi.</p>
      </div>
      <Card>
        <CardContent className="flex flex-col gap-2 py-4">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium">Ringkasan</p>
            <Badge variant="secondary">{data?.byStatus.HADIR ?? 0}/{data?.total ?? 0} hadir · {pct}%</Badge>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(STATUS_STYLE) as AttendanceStatus[]).map((s) =>
              (data?.byStatus[s] ?? 0) > 0 ? <StatusChip key={s} status={s} count={data!.byStatus[s]!} /> : null,
            )}
            {(data?.total ?? 0) === 0 ? <span className="text-xs text-muted-foreground">Belum ada absensi tercatat.</span> : null}
          </div>
        </CardContent>
      </Card>
      {rows.length > 0 ? (
        <Card>
          <CardContent className="flex flex-col gap-3 py-4">
            <p className="flex items-center gap-2 font-medium">
              <CalendarCheck className="size-4 text-muted-foreground" />
              Kalender kehadiran
            </p>
            <MergedAttendanceCalendar rows={rows} />
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
