"use client";
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ComboboxField } from '@/components/shared/combobox-field';
import { useContentLevels } from '@/components/shared/content-drilldown';
import { tingkatCode } from '@/lib/content-taxonomy';
import { apiFetch, ApiError } from '@/lib/api-client';
import type { GroupListItem } from '@/lib/phase1b-types';
import type { SessionItem } from '@/lib/phase1c-types';
import { fmtDateTime } from '@/lib/phase1c-types';
import type { AttendanceRoster } from '@/lib/phase1d-types';
import { ATTENDANCE_LABELS, ATTENDANCE_STATUSES, type AttendanceStatus } from '@/lib/phase1d-types';

/** Koreksi absensi — drill Tingkat → Kelompok → Sesi → Siswa (roster sesi).
 *  Siswa dibatasi anggota sesi tsb supaya tidak bisa salah pilih siswa lain. */
export function AttendanceCorrectBox() {
  const qc = useQueryClient();
  const [tingkat, setTingkat] = useState('');
  const [groupId, setGroupId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [status, setStatus] = useState<AttendanceStatus>('HADIR');
  const [note, setNote] = useState('');

  const levelsQ = useContentLevels();
  const levels = levelsQ.data ?? [];
  const tingkats = useMemo(
    () => [...new Set(levels.map((l) => tingkatCode(l)).filter(Boolean) as string[])],
    [levels],
  );
  const levelTingkat = useMemo(
    () => new Map(levels.map((l) => [l.id, tingkatCode(l)])),
    [levels],
  );

  const groupsQ = useQuery({
    queryKey: ['correct-groups'],
    queryFn: () => apiFetch<GroupListItem[]>('/groups'),
  });
  const groups = useMemo(
    () =>
      (groupsQ.data ?? []).filter(
        (g) => g.levelId && levelTingkat.get(g.levelId) === tingkat,
      ),
    [groupsQ.data, tingkat, levelTingkat],
  );

  const sessionsQ = useQuery({
    queryKey: ['correct-sessions', groupId],
    queryFn: () => apiFetch<SessionItem[]>(`/sessions?groupId=${groupId}`),
    enabled: !!groupId,
  });
  const sessions = useMemo(
    () =>
      (sessionsQ.data ?? [])
        .slice()
        .sort((a, b) => +new Date(b.startsAt) - +new Date(a.startsAt)),
    [sessionsQ.data],
  );

  // Siswa = roster sesi itu — bukan semua siswa di sistem.
  const rosterQ = useQuery({
    queryKey: ['attendance-roster', sessionId],
    queryFn: () => apiFetch<AttendanceRoster>(`/sessions/${sessionId}/attendance`),
    enabled: !!sessionId,
  });

  const m = useMutation({
    mutationFn: () =>
      apiFetch(`/sessions/${sessionId}/attendance/${studentId}`, {
        method: 'PATCH',
        body: { status, note: note || null },
      }),
    onSuccess: () => {
      toast.success('Koreksi tersimpan & tercatat di audit log.');
      qc.invalidateQueries({ queryKey: ['attendance-recap'] });
      qc.invalidateQueries({ queryKey: ['attendance-roster'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Gagal menyimpan koreksi.'),
  });

  return (
    <Card><CardContent className="flex flex-col gap-3 py-4">
      <div>
        <p className="font-medium">Koreksi Absensi (tercatat di audit log)</p>
        <p className="text-xs text-muted-foreground">
          Pilih bertahap: Tingkat → Kelompok → Sesi → Siswa.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1.5"><Label htmlFor="corr-tingkat">Tingkat</Label>
          <select
            id="corr-tingkat"
            className="h-10 rounded-md border px-3 text-sm"
            value={tingkat}
            onChange={(e) => {
              setTingkat(e.target.value);
              setGroupId(''); setSessionId(''); setStudentId('');
            }}
          >
            <option value="">- Pilih tingkat -</option>
            {tingkats.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5"><Label htmlFor="corr-group">Kelompok</Label>
          <ComboboxField
            id="corr-group"
            value={groupId}
            onChange={(v) => { setGroupId(v); setSessionId(''); setStudentId(''); }}
            options={groups.map((g) => ({
              value: g.id,
              label: `${g.name}${g.level ? ` — ${g.level.name}` : ''}`,
            }))}
            placeholder={tingkat ? '- Pilih kelompok -' : 'Pilih tingkat dulu'}
            disabled={!tingkat}
          /></div>
        <div className="flex flex-col gap-1.5"><Label htmlFor="corr-session">Sesi</Label>
          <ComboboxField
            id="corr-session"
            value={sessionId}
            onChange={(v) => { setSessionId(v); setStudentId(''); }}
            options={sessions.map((s) => ({
              value: s.id,
              label: `${fmtDateTime(s.startsAt)}${s.subject ? ` — ${s.subject.name}` : ''}`,
            }))}
            placeholder={groupId ? '- Pilih sesi -' : 'Pilih kelompok dulu'}
            disabled={!groupId}
          /></div>
        <div className="flex flex-col gap-1.5"><Label htmlFor="corr-student">Siswa</Label>
          <ComboboxField
            id="corr-student"
            value={studentId}
            onChange={setStudentId}
            options={(rosterQ.data?.members ?? []).map((mm) => ({
              value: mm.studentId,
              label: `${mm.name}${mm.attendance ? ` — kini: ${ATTENDANCE_LABELS[mm.attendance.status] ?? mm.attendance.status}` : ' — belum diisi'}`,
            }))}
            placeholder={sessionId ? '- Pilih siswa -' : 'Pilih sesi dulu'}
            disabled={!sessionId}
          /></div>
        <div className="flex flex-col gap-1.5"><Label>Status baru</Label>
          <select className="h-10 rounded-md border px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value as AttendanceStatus)}>
            {ATTENDANCE_STATUSES.map((s) => <option key={s} value={s}>{ATTENDANCE_LABELS[s]}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5"><Label>Catatan</Label><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Alasan koreksi" /></div>
      </div>
      <div>
        <Button disabled={m.isPending || !sessionId || !studentId} onClick={() => m.mutate()}>Simpan Koreksi</Button>
      </div>
    </CardContent></Card>
  );
}
