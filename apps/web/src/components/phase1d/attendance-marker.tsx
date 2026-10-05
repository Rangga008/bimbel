"use client";
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import { SessionCalendar } from '@/components/shared/session-calendar';
import { fmtDateTime } from '@/lib/phase1c-types';
import type { AttendanceRoster, AttendanceStatus } from '@/lib/phase1d-types';
import { ATTENDANCE_LABELS, ATTENDANCE_STATUSES } from '@/lib/phase1d-types';

function errMsg(e: unknown, fallback: string) {
  return e instanceof ApiError ? e.message : fallback;
}

/** Form input absensi 1 sesi penuh (DoD 1d): pilih sesi -> isi semua siswa. */
export function AttendanceMarker({ sessionsEndpoint }: { sessionsEndpoint: string }) {
  const qc = useQueryClient();
  const roles = useAuthStore((s) => s.user?.roles ?? []);
  const isAdmin = roles.includes('ADMIN_ACADEMIC') || roles.includes('OWNER');
  const isTutor = roles.includes('TUTOR');
  const [sessionId, setSessionId] = useState('');
  const [draft, setDraft] = useState<Record<string, { status: AttendanceStatus; note: string }>>({});
  const rosterQ = useQuery({
    queryKey: ['attendance-roster', sessionId],
    queryFn: () => apiFetch<AttendanceRoster>(`/sessions/${sessionId}/attendance`),
    enabled: !!sessionId,
  });

  const saveM = useMutation({
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
    },
    onError: (e) => toast.error(errMsg(e, 'Gagal menyimpan absensi.')),
  });

  // Kehadiran tutor per sesi (absen tutor mengajar) — memengaruhi payroll.
  const [tutorDraft, setTutorDraft] = useState<{ status: AttendanceStatus; note: string } | null>(null);
  const tutorPresenceM = useMutation({
    mutationFn: () =>
      apiFetch(`/sessions/${sessionId}/tutor-attendance`, {
        method: 'PUT',
        body: { status: tutorDraft?.status ?? 'HADIR', note: tutorDraft?.note || undefined },
      }),
    onSuccess: () => {
      toast.success('Kehadiran tutor tersimpan.');
      setTutorDraft(null);
      qc.invalidateQueries({ queryKey: ['attendance-roster', sessionId] });
    },
    onError: (e) => toast.error(errMsg(e, 'Gagal menyimpan kehadiran tutor.')),
  });

  // Tutor melaporkan berhalangan — sesi ditandai + WA terkirim ke ortu.
  const [absenceReason, setAbsenceReason] = useState('');
  const [absenceOpen, setAbsenceOpen] = useState(false);
  const absenceM = useMutation({
    mutationFn: () =>
      apiFetch<{ notified: number; recipients: number }>(`/sessions/${sessionId}/tutor-absence`, {
        method: 'POST',
        body: { reason: absenceReason.trim() },
      }),
    onSuccess: (r) => {
      toast.success(`Laporan tersimpan — ${r.notified} pesan WA dikirim ke orang tua.`);
      setAbsenceOpen(false);
      setAbsenceReason('');
      qc.invalidateQueries({ queryKey: ['session-calendar'] });
      qc.invalidateQueries({ queryKey: ['sessions'] });
      qc.invalidateQueries({ queryKey: ['attendance-roster', sessionId] });
    },
    onError: (e) => toast.error(errMsg(e, 'Gagal mengirim laporan.')),
  });

  // Tutor hanya bisa mengumpulkan absensi SEKALI per sesi — sesudahnya
  // terkunci; koreksi menjadi kewenangan Admin Academic/Owner.
  const alreadyMarked = (rosterQ.data?.members ?? []).some((m) => m.attendance);
  const locked = alreadyMarked && !isAdmin;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Absensi</h1>
        <p className="text-sm text-muted-foreground">Pilih tanggal di kalender, lalu pilih sesi — setelah itu isi kehadiran seluruh siswa kelompoknya.</p>
      </div>
      {locked ? (
        <Card><CardContent className="py-3 text-sm text-amber-700 dark:text-amber-400">
          Absensi sesi ini sudah dikumpulkan dan terkunci. Koreksi hanya bisa dilakukan oleh Admin Academic.
        </CardContent></Card>
      ) : null}
      <SessionCalendar
        endpoint={sessionsEndpoint}
        onSessionClick={(id) => { setSessionId(id); setDraft({}); }}
        selectedSessionId={sessionId}
      />
      {!sessionId ? (
        <Card><CardContent className="py-6 text-center text-sm text-muted-foreground">Belum ada sesi dipilih — klik tanggal yang ada sesinya, lalu pilih sesinya.</CardContent></Card>
      ) : null}
      {sessionId && rosterQ.isLoading ? <Skeleton className="h-24 w-full" /> : null}
      {rosterQ.data ? (
        <Card>
          <CardHeader><CardTitle className="text-base">{rosterQ.data.group.name} — {fmtDateTime(rosterQ.data.session.startsAt)}</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            {rosterQ.data.tutor ? (
              <div className="flex flex-col gap-1.5 rounded-md border border-brand-blue-200 bg-brand-blue-50/40 p-3 sm:flex-row sm:items-center sm:gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{rosterQ.data.tutor.name} <span className="text-xs font-normal text-muted-foreground">(kehadiran tutor — memengaruhi payroll)</span></p>
                  {rosterQ.data.tutorAttendance ? (
                    <p className="text-xs text-muted-foreground">Tersimpan: {ATTENDANCE_LABELS[rosterQ.data.tutorAttendance.status] ?? rosterQ.data.tutorAttendance.status}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Belum diisi — otomatis HADIR saat absen siswa disimpan</p>
                  )}
                </div>
                <select
                  className="h-10 rounded-md border px-3 text-sm"
                  disabled={locked}
                  value={tutorDraft?.status ?? rosterQ.data.tutorAttendance?.status ?? 'HADIR'}
                  onChange={(e) => setTutorDraft({ status: e.target.value as AttendanceStatus, note: tutorDraft?.note ?? rosterQ.data.tutorAttendance?.note ?? '' })}
                >
                  {ATTENDANCE_STATUSES.map((s) => <option key={s} value={s}>{ATTENDANCE_LABELS[s]}</option>)}
                </select>
                <Input
                  className="sm:max-w-48"
                  placeholder="Catatan (opsional)"
                  value={tutorDraft?.note ?? ''}
                  onChange={(e) => setTutorDraft({ status: tutorDraft?.status ?? rosterQ.data.tutorAttendance?.status ?? 'HADIR', note: e.target.value })}
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={tutorPresenceM.isPending || !tutorDraft || locked}
                  onClick={() => tutorPresenceM.mutate()}
                >
                  {tutorPresenceM.isPending ? 'Menyimpan...' : 'Simpan'}
                </Button>
              </div>
            ) : null}
            {isTutor && rosterQ.data.tutor && rosterQ.data.session.status === 'SCHEDULED' ? (
              <div className="rounded-md border border-amber-300/60 bg-amber-50/50 p-3 dark:border-amber-500/30 dark:bg-amber-500/10">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-amber-800 dark:text-amber-200">
                    Tidak bisa hadir di sesi ini? Laporkan — orang tua siswa otomatis diberi tahu lewat WhatsApp.
                  </p>
                  <Button variant="outline" size="sm" onClick={() => setAbsenceOpen(true)}>
                    Lapor Berhalangan
                  </Button>
                </div>
                {absenceOpen ? (
                  <form
                    className="mt-2 flex flex-col gap-2 sm:flex-row"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (absenceReason.trim().length < 3) { toast.error('Isi alasan berhalangan (mis. sakit).'); return; }
                      absenceM.mutate();
                    }}
                  >
                    <Input
                      placeholder="Alasan (mis. sakit, urusan keluarga)"
                      value={absenceReason}
                      onChange={(e) => setAbsenceReason(e.target.value)}
                      className="sm:flex-1"
                    />
                    <div className="flex gap-2">
                      <Button type="submit" size="sm" disabled={absenceM.isPending}>
                        {absenceM.isPending ? 'Mengirim...' : 'Kirim & Beri Tahu Ortu'}
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setAbsenceOpen(false)}>Batal</Button>
                    </div>
                  </form>
                ) : null}
              </div>
            ) : null}
            {rosterQ.data.members.length === 0 ? (
              <p className="text-sm text-muted-foreground">Kelompok ini belum punya siswa.</p>
            ) : null}
            {rosterQ.data.members.map((m) => {
              const cur = draft[m.studentId]?.status ?? m.attendance?.status ?? 'HADIR';
              return (
                <div key={m.studentId} className="flex flex-col gap-1.5 rounded-md border p-3 sm:flex-row sm:items-center sm:gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{m.name}</p>
                    {m.attendance ? (
                      <p className="text-xs text-muted-foreground">Tersimpan: {ATTENDANCE_LABELS[m.attendance.status as AttendanceStatus] ?? m.attendance.status}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Belum diisi</p>
                    )}
                  </div>
                  <select
                    className="h-10 rounded-md border px-3 text-sm"
                    disabled={locked}
                    value={cur}
                    onChange={(e) => setDraft((d) => ({ ...d, [m.studentId]: { status: e.target.value as AttendanceStatus, note: d[m.studentId]?.note ?? '' } }))}
                  >
                    {ATTENDANCE_STATUSES.map((s) => <option key={s} value={s}>{ATTENDANCE_LABELS[s]}</option>)}
                  </select>
                  <Input
                    className="sm:max-w-48"
                    placeholder="Catatan (opsional)"
                    disabled={locked}
                    value={draft[m.studentId]?.note ?? ''}
                    onChange={(e) => setDraft((d) => ({ ...d, [m.studentId]: { status: d[m.studentId]?.status ?? (m.attendance?.status as AttendanceStatus) ?? 'HADIR', note: e.target.value } }))}
                  />
                </div>
              );
            })}
            <div className="flex items-center gap-2">
              <Button disabled={saveM.isPending || rosterQ.data.members.length === 0 || locked} onClick={() => saveM.mutate()}>
                {saveM.isPending ? 'Menyimpan...' : 'Simpan Absensi 1 Sesi'}
              </Button>
              {rosterQ.data.session.status === 'COMPLETED' ? <Badge variant="secondary">COMPLETED</Badge> : null}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
