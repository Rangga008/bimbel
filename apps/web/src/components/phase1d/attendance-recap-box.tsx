"use client";
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ChevronDown, ChevronRight, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ComboboxField } from '@/components/shared/combobox-field';
import { apiFetch } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import type { AttendanceRecap } from '@/lib/phase1d-types';
import { ATTENDANCE_LABELS } from '@/lib/phase1d-types';
import type { GroupListItem } from '@/lib/phase1b-types';
import { fmtDateTime } from '@/lib/phase1c-types';

interface PersonOpt { id: string; user: { name: string; avatarUrl?: string | null } }

/**
 * Rekap attendance 4 dimensi (admin): filter siswa/kelompok/tutor/periode.
 * Detail dikelompokkan per sesi — klik baris sesi untuk melihat siapa saja
 * yang hadir/absen pada tanggal tersebut.
 */
export function AttendanceRecapBox() {
  const roles = useAuthStore((s) => s.user?.roles ?? []);
  // Filter daftar orang memerlukan people.view — tutor/ortu tidak punya (403).
  const canPickPeople = roles.includes('ADMIN_ACADEMIC') || roles.includes('OWNER') || roles.includes('ADMIN_FINANCE');
  const [f, setF] = useState({ studentId: '', groupId: '', tutorId: '', from: '', to: '' });
  const [openSession, setOpenSession] = useState<string | null>(null);

  const params = new URLSearchParams();
  if (f.studentId) params.set('studentId', f.studentId);
  if (f.groupId) params.set('groupId', f.groupId);
  if (f.tutorId) params.set('tutorId', f.tutorId);
  if (f.from) params.set('from', new Date(f.from).toISOString());
  if (f.to) params.set('to', new Date(f.to).toISOString());
  const qs = params.toString();

  const q = useQuery({ queryKey: ['attendance-recap', qs], queryFn: () => apiFetch<AttendanceRecap>(`/attendance/recap${qs ? `?${qs}` : ''}`) });
  const stale = { staleTime: 5 * 60 * 1000, retry: 1 };
  const studentsQ = useQuery({ queryKey: ['recap-opt-students'], queryFn: () => apiFetch<PersonOpt[]>('/students'), ...stale, enabled: canPickPeople });
  const tutorsQ = useQuery({ queryKey: ['recap-opt-tutors'], queryFn: () => apiFetch<PersonOpt[]>('/tutors'), ...stale, enabled: canPickPeople });
  const groupsQ = useQuery({ queryKey: ['recap-opt-groups'], queryFn: () => apiFetch<GroupListItem[]>('/groups'), ...stale });

  // Kelompokkan baris per sesi -> detail "siapa absen di tanggal tsb".
  const bySession = new Map<string, { key: string; label: string; rows: NonNullable<typeof q.data>['rows'] }>();
  for (const r of q.data?.rows ?? []) {
    const key = r.session.id;
    let bucket = bySession.get(key);
    if (!bucket) {
      bucket = {
        key,
        label: `${fmtDateTime(r.session.startsAt)} — ${r.session.group.name}${r.session.tutor ? ` · ${r.session.tutor.user.name}` : ''}`,
        rows: [],
      };
      bySession.set(key, bucket);
    }
    bucket.rows.push(r);
  }
  const sessions = [...bySession.values()];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Rekap Kehadiran</h2>
        <p className="text-sm text-muted-foreground">Filter per siswa / kelompok / tutor / rentang tanggal — klik sesi untuk detail per siswa.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {canPickPeople ? (
        <div className="flex flex-col gap-1.5">
          <Label>Siswa</Label>
          <ComboboxField
            id="recap-student"
            value={f.studentId}
            onChange={(v) => setF({ ...f, studentId: v })}
            options={(studentsQ.data ?? []).map((s) => ({ value: s.id, label: s.user.name, imageUrl: s.user.avatarUrl }))}
            placeholder="- Semua siswa -"
          />
        </div>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <Label>Kelompok</Label>
          <ComboboxField
            id="recap-group"
            value={f.groupId}
            onChange={(v) => setF({ ...f, groupId: v })}
            options={(groupsQ.data ?? []).map((g) => ({ value: g.id, label: g.name }))}
            placeholder="- Semua kelompok -"
          />
        </div>
        {canPickPeople ? (
        <div className="flex flex-col gap-1.5">
          <Label>Tutor</Label>
          <ComboboxField
            id="recap-tutor"
            value={f.tutorId}
            onChange={(v) => setF({ ...f, tutorId: v })}
            options={(tutorsQ.data ?? []).map((t) => ({ value: t.id, label: t.user.name, imageUrl: t.user.avatarUrl }))}
            placeholder="- Semua tutor -"
          />
        </div>
        ) : null}
        <div className="flex flex-col gap-1.5"><Label>Dari tanggal</Label><Input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></div>
        <div className="flex flex-col gap-1.5"><Label>Sampai tanggal</Label><Input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></div>
      </div>
      {q.isLoading ? <Skeleton className="h-20 w-full" /> : null}
      {q.data ? (
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">Total {q.data.total}</Badge>
          {Object.entries(q.data.byStatus).map(([s, n]) => (
            <Badge key={s} variant="outline">{ATTENDANCE_LABELS[s as keyof typeof ATTENDANCE_LABELS] ?? s}: {n}</Badge>
          ))}
        </div>
      ) : null}
      {q.data && sessions.length === 0 ? (
        <Card><CardContent className="flex items-center gap-3 py-8 text-sm text-muted-foreground"><Users className="size-4" /> Belum ada catatan absensi untuk filter ini.</CardContent></Card>
      ) : null}
      <div className="flex flex-col gap-2">
        {sessions.map((s) => {
          const open = openSession === s.key;
          const nonHadir = s.rows.filter((r) => r.status !== 'HADIR' && r.status !== 'TERLAMBAT').length;
          return (
            <Card key={s.key}>
              <CardContent className="flex flex-col gap-0 py-0">
                <button
                  type="button"
                  className="flex items-center justify-between gap-3 py-3 text-left"
                  onClick={() => setOpenSession(open ? null : s.key)}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {open ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
                    <p className="truncate text-sm font-medium">{s.label}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Badge variant="secondary" className="tabular-nums">{s.rows.length} siswa</Badge>
                    {nonHadir > 0 ? <Badge variant="outline" className="tabular-nums text-destructive">{nonHadir} tidak hadir</Badge> : null}
                  </div>
                </button>
                {open ? (
                  <div className="flex flex-col gap-1 border-t pb-3 pt-2">
                    {s.rows.map((r) => (
                      <div key={r.id} className="flex items-center justify-between gap-2 rounded px-1 py-1 text-sm">
                        <span className="truncate">{r.student.user.name}</span>
                        <Badge variant={r.status === 'HADIR' || r.status === 'TERLAMBAT' ? 'secondary' : 'outline'}>
                          {ATTENDANCE_LABELS[r.status] ?? r.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
