"use client";
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch, ApiError } from '@/lib/api-client';
import { ComboboxField } from '@/components/shared/combobox-field';
import type { SessionDetail } from '@/lib/phase1c-types';
import { fmtDateTime } from '@/lib/phase1c-types';
import type { AttendanceRoster, AttendanceStatus } from '@/lib/phase1d-types';
import { ATTENDANCE_LABELS, ATTENDANCE_STATUSES } from '@/lib/phase1d-types';

/** Panel detail sesi: absensi siswa (boleh tanggal lewat) + override susulan per-siswa. */
export function SessionOverrideBox({ sessionId, onDeleted }: { sessionId: string; onDeleted?: () => void }) {
  const qc = useQueryClient();
  const [studentId, setStudentId] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [note, setNote] = useState('');
  const [draft, setDraft] = useState<Record<string, { status: AttendanceStatus; note: string }>>({});
  const [tutorDraft, setTutorDraft] = useState<string | null>(null);
  const detailQ = useQuery({
    queryKey: ['sessions', sessionId],
    queryFn: () => apiFetch<SessionDetail>(`/sessions/${sessionId}`),
  });
  const rosterQ = useQuery({
    queryKey: ['attendance-roster', sessionId],
    queryFn: () => apiFetch<AttendanceRoster>(`/sessions/${sessionId}/attendance`),
  });
  const saveM = useMutation({
    mutationFn: () => {
      if (!studentId) throw new Error('Pilih siswa dulu.');
      return apiFetch(`/sessions/${sessionId}/overrides`, {
        method: 'POST',
        body: {
          studentId,
          startsAt: startsAt ? new Date(startsAt).toISOString() : undefined,
          endsAt: startsAt ? new Date(new Date(startsAt).getTime() + 90 * 60000).toISOString() : undefined,
          note: note || undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success('Override disimpan — sesi kelompok tidak berubah.');
      setStudentId('');
      qc.invalidateQueries({ queryKey: ['sessions', sessionId] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Gagal menyimpan override.'),
  });
  const attendanceM = useMutation({
    mutationFn: () =>
      apiFetch(`/sessions/${sessionId}/attendance`, {
        method: 'POST',
        body: {
          items: (rosterQ.data?.members ?? []).map((m) => ({
            studentId: m.studentId,
            status: draft[m.studentId]?.status ?? m.attendance?.status ?? 'HADIR',
            note: draft[m.studentId]?.note || undefined,
          })),
        },
      }),
    onSuccess: () => {
      toast.success('Absensi sesi tersimpan.');
      setDraft({});
      qc.invalidateQueries({ queryKey: ['attendance-roster', sessionId] });
      qc.invalidateQueries({ queryKey: ['attendance-recap'] });
      qc.invalidateQueries({ queryKey: ['sessions'] });
      qc.invalidateQueries({ queryKey: ['session-calendar'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Gagal menyimpan absensi.'),
  });
  const tutorM = useMutation({
    mutationFn: (tutorId: string | null) =>
      apiFetch(`/sessions/${sessionId}`, { method: 'PATCH', body: { tutorId } }),
    onSuccess: () => {
      toast.success('Pengajar sesi diperbarui.');
      setTutorDraft(null);
      qc.invalidateQueries({ queryKey: ['sessions', sessionId] });
      qc.invalidateQueries({ queryKey: ['sessions'] });
      qc.invalidateQueries({ queryKey: ['session-calendar'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Gagal mengganti pengajar.'),
  });
  const deleteM = useMutation({
    mutationFn: () => apiFetch(`/sessions/${sessionId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Sesi dihapus.');
      qc.invalidateQueries({ queryKey: ['sessions'] });
      qc.invalidateQueries({ queryKey: ['session-calendar'] });
      onDeleted?.();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Gagal menghapus sesi.'),
  });
  const d = detailQ.data;
  const roster = rosterQ.data;
  const isCancelled = roster?.session.status === 'CANCELLED';
  return (
    <Card><CardContent className="flex flex-col gap-4 py-4">
      <div>
        <p className="font-medium">Detail Sesi</p>
        {d ? <p className="text-xs text-muted-foreground">Sesi {d.group.name} - {fmtDateTime(d.startsAt)}.</p> : null}
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Pengajar sesi ini</p>
        <p className="text-xs text-muted-foreground">
          Tutor per sesi bisa berbeda-beda tiap minggu — pilih dari tutor yang ditugaskan ke kelompok ini.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            className="h-9 flex-1 rounded-md border px-2 text-sm"
            value={tutorDraft ?? d?.tutor?.id ?? ''}
            onChange={(e) => setTutorDraft(e.target.value)}
            disabled={isCancelled}
          >
            <option value="">— Belum ditentukan —</option>
            {(d?.group.tutors ?? []).map((t) => (
              <option key={t.tutorId} value={t.tutorId} disabled={!t.tutor.isActive}>
                {t.tutor.user.name}{t.isLead ? ' (lead)' : ''}{t.tutor.isActive ? '' : ' — nonaktif'}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="outline"
            disabled={tutorM.isPending || isCancelled || (tutorDraft ?? d?.tutor?.id ?? '') === (d?.tutor?.id ?? '')}
            onClick={() => tutorM.mutate((tutorDraft ?? d?.tutor?.id ?? '') || null)}
          >
            {tutorM.isPending ? 'Menyimpan...' : 'Simpan'}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t pt-3">
        <p className="text-sm font-medium">Absensi siswa</p>
        {rosterQ.isLoading ? <Skeleton className="h-20 w-full" /> : null}
        {isCancelled ? (
          <p className="text-xs text-muted-foreground">Sesi dibatalkan — absensi tidak bisa diisi.</p>
        ) : null}
        {roster?.members.map((m) => {
          const cur = draft[m.studentId]?.status ?? m.attendance?.status ?? 'HADIR';
          return (
            <div key={m.studentId} className="flex flex-col gap-1.5 rounded-md border p-2.5 sm:flex-row sm:items-center sm:gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{m.name}</p>
                {m.attendance ? (
                  <p className="text-xs text-muted-foreground">Tersimpan: {ATTENDANCE_LABELS[m.attendance.status] ?? m.attendance.status}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Belum diisi</p>
                )}
              </div>
              <select
                className="h-9 rounded-md border px-2 text-sm"
                disabled={isCancelled}
                value={cur}
                onChange={(e) => setDraft((prev) => ({ ...prev, [m.studentId]: { status: e.target.value as AttendanceStatus, note: prev[m.studentId]?.note ?? '' } }))}
              >
                {ATTENDANCE_STATUSES.map((s) => <option key={s} value={s}>{ATTENDANCE_LABELS[s]}</option>)}
              </select>
              <Input
                className="sm:max-w-44"
                placeholder="Catatan (opsional)"
                disabled={isCancelled}
                value={draft[m.studentId]?.note ?? ''}
                onChange={(e) => setDraft((prev) => ({ ...prev, [m.studentId]: { status: prev[m.studentId]?.status ?? (m.attendance?.status as AttendanceStatus) ?? 'HADIR', note: e.target.value } }))}
              />
            </div>
          );
        })}
        {roster && roster.members.length > 0 && !isCancelled ? (
          <div>
            <Button size="sm" disabled={attendanceM.isPending} onClick={() => attendanceM.mutate()}>
              {attendanceM.isPending ? 'Menyimpan...' : 'Simpan Absensi'}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 border-t pt-3">
        <p className="text-sm font-medium">Override per-siswa (susulan)</p>
        <div className="flex flex-col gap-1.5"><Label htmlFor="ovr-student">Siswa</Label>
          <ComboboxField
            id="ovr-student"
            value={studentId}
            onChange={setStudentId}
            options={(d?.group.members ?? []).map((m) => ({ value: m.studentId, label: m.student.user.name }))}
            placeholder="- Pilih siswa -"
          /></div>
        <div className="flex flex-col gap-1.5"><Label>Mulai susulan (opsional)</Label>
          <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></div>
        <div className="flex flex-col gap-1.5"><Label>Catatan</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Mis. susulan pukul 19:00" /></div>
        <div>
          <Button size="sm" variant="outline" disabled={saveM.isPending} onClick={() => saveM.mutate()}>Simpan Override</Button>
        </div>
      </div>

      <div className="border-t pt-3">
        <Button
          size="sm"
          variant="destructive"
          disabled={deleteM.isPending}
          onClick={() => {
            if (confirm('Hapus sesi ini? Sesi yang sudah berisi absensi akan menolak penghapusan.'))
              deleteM.mutate();
          }}
        >
          {deleteM.isPending ? 'Menghapus...' : 'Hapus Sesi'}
        </Button>
      </div>
    </CardContent></Card>
  );
}
