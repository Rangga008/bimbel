"use client";
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ComboboxField } from '@/components/shared/combobox-field';
import { apiFetch, ApiError } from '@/lib/api-client';
import type { StudentItem } from '@/lib/phase1a-types';
import type { SessionItem } from '@/lib/phase1c-types';
import { fmtDateTime } from '@/lib/phase1c-types';
import { ATTENDANCE_LABELS, ATTENDANCE_STATUSES, type AttendanceStatus } from '@/lib/phase1d-types';

/** Koreksi 1 baris absensi (butuh permission attendance.correct, tercatat di audit log). */
export function AttendanceCorrectBox() {
  const qc = useQueryClient();
  const [f, setF] = useState({ sessionId: '', studentId: '', status: 'HADIR' as AttendanceStatus, note: '' });
  const sessionsQ = useQuery({ queryKey: ['correct-sessions'], queryFn: () => apiFetch<SessionItem[]>('/sessions') });
  const studentsQ = useQuery({ queryKey: ['correct-students'], queryFn: () => apiFetch<StudentItem[]>('/students') });
  const m = useMutation({
    mutationFn: () =>
      apiFetch(`/sessions/${f.sessionId}/attendance/${f.studentId}`, {
        method: 'PATCH',
        body: { status: f.status, note: f.note || null },
      }),
    onSuccess: () => {
      toast.success('Koreksi tersimpan & tercatat di audit log.');
      qc.invalidateQueries({ queryKey: ['attendance-recap'] });
      qc.invalidateQueries({ queryKey: ['attendance-roster'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Gagal menyimpan koreksi.'),
  });
  return (
    <Card><CardContent className="flex flex-col gap-2 py-4">
      <p className="font-medium">Koreksi Absensi (tercatat di audit log)</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5"><Label htmlFor="corr-session">Sesi</Label>
          <ComboboxField
            id="corr-session"
            value={f.sessionId}
            onChange={(v) => setF({ ...f, sessionId: v })}
            options={(sessionsQ.data ?? []).map((s) => ({
              value: s.id,
              label: `${s.group.name} — ${fmtDateTime(s.startsAt)}`,
            }))}
            placeholder="- Pilih sesi -"
          /></div>
        <div className="flex flex-col gap-1.5"><Label htmlFor="corr-student">Siswa</Label>
          <ComboboxField
            id="corr-student"
            value={f.studentId}
            onChange={(v) => setF({ ...f, studentId: v })}
            options={(studentsQ.data ?? []).map((s) => ({ value: s.id, label: s.user.name }))}
            placeholder="- Pilih siswa -"
          /></div>
        <div className="flex flex-col gap-1.5"><Label>Status baru</Label>
          <select className="h-10 rounded-md border px-3 text-sm" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as AttendanceStatus })}>
            {ATTENDANCE_STATUSES.map((s) => <option key={s} value={s}>{ATTENDANCE_LABELS[s]}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5"><Label>Catatan</Label><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Alasan koreksi" /></div>
      </div>
      <Button disabled={m.isPending || !f.sessionId || !f.studentId} onClick={() => m.mutate()}>Simpan Koreksi</Button>
    </CardContent></Card>
  );
}
