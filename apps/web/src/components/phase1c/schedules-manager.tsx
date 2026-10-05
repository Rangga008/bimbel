"use client";
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BookOpen, CalendarDays, CalendarPlus, Clock, DoorOpen, Pencil, Play, Trash2, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { ComboboxField } from '@/components/shared/combobox-field';
import { apiFetch, ApiError } from '@/lib/api-client';
import type { GroupListItem } from '@/lib/phase1b-types';
import type { SubjectItem } from '@/lib/phase3a-types';
import type { GenerateResult, RoomItem, ScheduleItem } from '@/lib/phase1c-types';
import { DAY_NAMES, clockToMin, minToClock } from '@/lib/phase1c-types';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

function err(e: unknown, fb: string) {
  return e instanceof ApiError ? e.message : fb;
}

export function SchedulesManager({
  canManage,
  groupId: groupIdProp,
  onGroupChange,
  hideGroupFilter,
}: {
  canManage: boolean;
  groupId?: string;
  onGroupChange?: (groupId: string) => void;
  hideGroupFilter?: boolean;
}) {
  const qc = useQueryClient();
  const [internalGroupId, setInternalGroupId] = useState('');
  const groupId = groupIdProp ?? internalGroupId;
  const setGroupId = onGroupChange ?? setInternalGroupId;
  const [form, setForm] = useState({ dayOfWeek: '1', start: '16:00', end: '17:30', validFrom: '', validTo: '' });
  const [detailTarget, setDetailTarget] = useState<ScheduleItem | null>(null);
  const [tutorId, setTutorId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [editTarget, setEditTarget] = useState<ScheduleItem | null>(null);
  const [editForm, setEditForm] = useState({ dayOfWeek: '1', start: '16:00', end: '17:30', validFrom: '', validTo: '', isActive: true });
  const [editTutorId, setEditTutorId] = useState('');
  const [editRoomId, setEditRoomId] = useState('');
  const [editSubjectId, setEditSubjectId] = useState('');
  const schedulesQ = useQuery({
    queryKey: ['schedules', groupId],
    queryFn: () => apiFetch<ScheduleItem[]>(`/schedules${groupId ? `?groupId=${groupId}` : ''}`),
  });
  const groupsQ = useQuery({ queryKey: ['groups'], queryFn: () => apiFetch<GroupListItem[]>('/groups') });
  const tutorsQ = useQuery({
    queryKey: ['tutors'],
    queryFn: () => apiFetch<Array<{ id: string; user: { name: string; avatarUrl?: string | null } }>>('/tutors'),
    enabled: canManage,
  });
  const roomsQ = useQuery({ queryKey: ['rooms'], queryFn: () => apiFetch<RoomItem[]>('/rooms') });
  const subjectsQ = useQuery({
    queryKey: ['subjects'],
    queryFn: () => apiFetch<SubjectItem[]>('/master/subjects'),
    enabled: canManage,
  });
  const createM = useMutation({
    mutationFn: () => {
      if (!groupId) throw new Error('Pilih kelompok dulu.');
      const startMin = clockToMin(form.start);
      const endMin = clockToMin(form.end);
      if (startMin === null || endMin === null) throw new Error('Format jam harus HH:MM.');
      if (!form.validFrom) throw new Error('Isi tanggal mulai berlaku.');
      if (form.validTo && form.validTo < form.validFrom) {
        throw new Error('Berlaku sampai harus setelah berlaku dari.');
      }
      return apiFetch<ScheduleItem>('/schedules', {
        method: 'POST',
        body: { groupId, tutorId: tutorId || undefined, roomId: roomId || undefined,
          subjectId: subjectId || undefined,
          dayOfWeek: Number(form.dayOfWeek), startMin, endMin,
          validFrom: form.validFrom, validTo: form.validTo || undefined },
      });
    },
    onSuccess: () => {
      toast.success('Jadwal dibuat. Generate sesi untuk mengisi tanggal konkret.');
      qc.invalidateQueries({ queryKey: ['schedules'] });
    },
    onError: (e) => toast.error(err(e, 'Gagal membuat jadwal.')),
  });
  const updateM = useMutation({
    mutationFn: () => {
      if (!editTarget) throw new Error('Jadwal belum dipilih.');
      const startMin = clockToMin(editForm.start);
      const endMin = clockToMin(editForm.end);
      if (startMin === null || endMin === null) throw new Error('Format jam harus HH:MM.');
      if (!editForm.validFrom) throw new Error('Isi tanggal mulai berlaku.');
      return apiFetch<ScheduleItem>(`/schedules/${editTarget.id}`, {
        method: 'PATCH',
        body: {
          dayOfWeek: Number(editForm.dayOfWeek),
          startMin,
          endMin,
          validFrom: editForm.validFrom,
          validTo: editForm.validTo || null,
          tutorId: editTutorId || null,
          roomId: editRoomId || null,
          subjectId: editSubjectId || null,
          isActive: editForm.isActive,
        },
      });
    },
    onSuccess: () => {
      toast.success('Jadwal diperbarui. Klik "Generate" untuk mengganti sesi lama yang masih kosong.');
      setEditTarget(null);
      qc.invalidateQueries({ queryKey: ['schedules'] });
      qc.invalidateQueries({ queryKey: ['sessions'] });
      qc.invalidateQueries({ queryKey: ['session-calendar'] });
    },
    onError: (e) => toast.error(err(e, 'Gagal memperbarui jadwal.')),
  });
  const generateM = useMutation({
    mutationFn: (id: string) =>
      apiFetch<GenerateResult>(`/schedules/${id}/generate`, { method: 'POST', body: { skipExisting: true, replaceGenerated: true } }),
    onSuccess: (r) => {
      toast.success(`Generate: ${r.created} sesi baru, ${r.removed ?? 0} sesi lama diganti (${r.skipped} dilewati).`);
      qc.invalidateQueries({ queryKey: ['schedules'] });
      qc.invalidateQueries({ queryKey: ['sessions'] });
      qc.invalidateQueries({ queryKey: ['session-calendar'] });
    },
    onError: (e) => toast.error(err(e, 'Gagal generate sesi.')),
  });
  const deleteM = useMutation({
    mutationFn: (id: string) => apiFetch(`/schedules/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Jadwal beserta sesinya dihapus.');
      setDetailTarget(null);
      qc.invalidateQueries({ queryKey: ['schedules'] });
      qc.invalidateQueries({ queryKey: ['sessions'] });
      qc.invalidateQueries({ queryKey: ['session-calendar'] });
    },
    onError: (e) => toast.error(err(e, 'Gagal menghapus jadwal.')),
  });
  const openEdit = (s: ScheduleItem) => {
    setEditTarget(s);
    setEditForm({
      dayOfWeek: String(s.dayOfWeek),
      start: minToClock(s.startMin),
      end: minToClock(s.endMin),
      validFrom: s.validFrom?.slice(0, 10) ?? '',
      validTo: s.validTo?.slice(0, 10) ?? '',
      isActive: s.isActive,
    });
    setEditTutorId(s.tutor?.id ?? '');
    setEditRoomId(s.room?.id ?? '');
    setEditSubjectId(s.subject?.id ?? s.subjectId ?? '');
  };
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Jadwal</h1>
        <p className="text-sm text-muted-foreground">Template mingguan — generate untuk sesi konkret.</p>
      </div>
      {!hideGroupFilter ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sched-group">Kelompok</Label>
          <div className="w-full max-w-md">
            <ComboboxField
              id="sched-group"
              value={groupId}
              onChange={setGroupId}
              options={(groupsQ.data ?? []).map((g) => ({ value: g.id, label: g.name }))}
              placeholder="- Semua kelompok -"
            />
          </div>
        </div>
      ) : null}
      {canManage && groupId ? (
        <Card><CardContent className="grid gap-3 py-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>Hari</Label>
            <select className="h-9 rounded-lg border border-input bg-input/30 px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50" value={form.dayOfWeek}
              onChange={(e) => setForm((p) => ({ ...p, dayOfWeek: e.target.value }))}>
              {DAY_NAMES.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5"><Label>Mulai</Label>
              <Input type="time" value={form.start} onChange={(e) => setForm((p) => ({ ...p, start: e.target.value }))} /></div>
            <div className="flex flex-col gap-1.5"><Label>Selesai</Label>
              <Input type="time" value={form.end} onChange={(e) => setForm((p) => ({ ...p, end: e.target.value }))} /></div>
          </div>
          <div className="flex flex-col gap-1.5"><Label>Berlaku dari</Label>
            <Input type="date" value={form.validFrom} onChange={(e) => setForm((p) => ({ ...p, validFrom: e.target.value }))} /></div>
          <div className="flex flex-col gap-1.5"><Label>Berlaku sampai (opsional)</Label>
            <Input type="date" value={form.validTo} onChange={(e) => setForm((p) => ({ ...p, validTo: e.target.value }))} /></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="sched-tutor">Tutor default</Label>
            <ComboboxField
              id="sched-tutor"
              value={tutorId}
              onChange={setTutorId}
              options={(tutorsQ.data ?? []).map((t) => ({ value: t.id, label: t.user.name, imageUrl: t.user.avatarUrl }))}
              placeholder="- Menyusul -"
            /></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="sched-room">Ruangan default</Label>
            <ComboboxField
              id="sched-room"
              value={roomId}
              onChange={setRoomId}
              options={(roomsQ.data ?? []).map((r) => ({ value: r.id, label: r.name }))}
              placeholder="- Menyusul -"
            /></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="sched-subject">Mapel (opsional)</Label>
            <ComboboxField
              id="sched-subject"
              value={subjectId}
              onChange={setSubjectId}
              options={(subjectsQ.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
              placeholder="- Ikut mapel level/program -"
            /></div>
          <div className="sm:col-span-2">
            <Button disabled={createM.isPending} onClick={() => createM.mutate()}>
              <CalendarPlus /> Buat Jadwal Mingguan
            </Button>
          </div>
        </CardContent></Card>
      ) : null}
      {schedulesQ.isLoading ? <Skeleton className="h-20 w-full" /> : null}
      {!schedulesQ.isLoading && schedulesQ.data?.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Belum ada jadwal"
          description="Belum ada template jadwal mingguan untuk filter ini."
        />
      ) : null}
      {/* Kalender mingguan — tiap kolom = 1 hari, chip = 1 jadwal berulang. */}
      <div className="overflow-x-auto">
        <div className="grid min-w-[720px] grid-cols-7 gap-2">
          {[1, 2, 3, 4, 5, 6, 0].map((dow) => {
            const daySchedules = (schedulesQ.data ?? [])
              .filter((s) => s.dayOfWeek === dow)
              .sort((a, b) => a.startMin - b.startMin);
            return (
              <div key={dow} className="flex min-h-32 flex-col gap-1.5 rounded-lg border bg-muted/20 p-2">
                <p className="border-b pb-1.5 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {DAY_NAMES[dow]}
                </p>
                {daySchedules.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setDetailTarget(s)}
                    className={`flex flex-col gap-0.5 rounded-md border px-2 py-1.5 text-left text-xs transition-colors hover:border-primary hover:bg-primary/5 ${
                      s.isActive ? 'bg-card' : 'bg-muted/50 opacity-60'
                    }`}
                  >
                    <span className="font-semibold tabular-nums">{minToClock(s.startMin)}–{minToClock(s.endMin)}</span>
                    <span className="line-clamp-2 font-medium leading-tight">{s.group.name}</span>
                    <span className="line-clamp-1 text-muted-foreground">{s.tutor ? s.tutor.user.name : 'Tutor menyusul'}</span>
                    {s.subject ? <span className="line-clamp-1 font-medium text-primary">{s.subject.name}</span> : null}
                    {!s.isActive ? <span className="text-muted-foreground">(nonaktif)</span> : null}
                  </button>
                ))}
                {daySchedules.length === 0 ? (
                  <p className="py-4 text-center text-[11px] text-muted-foreground/60">—</p>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      <Dialog open={detailTarget !== null} onOpenChange={(o) => { if (!o) setDetailTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{detailTarget?.group.name}</DialogTitle>
            <DialogDescription>
              Jadwal mingguan tiap {detailTarget ? DAY_NAMES[detailTarget.dayOfWeek] : ''}.
            </DialogDescription>
          </DialogHeader>
          {detailTarget ? (
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex items-center gap-2">
                <Clock className="size-4 shrink-0 text-muted-foreground" />
                <span className="tabular-nums">{minToClock(detailTarget.startMin)}–{minToClock(detailTarget.endMin)}</span>
                <Badge variant={detailTarget.isActive ? 'secondary' : 'outline'}>{detailTarget.isActive ? 'Aktif' : 'Nonaktif'}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <User className="size-4 shrink-0 text-muted-foreground" />
                {detailTarget.tutor ? detailTarget.tutor.user.name : 'Tutor menyusul'}
              </div>
              <div className="flex items-center gap-2">
                <DoorOpen className="size-4 shrink-0 text-muted-foreground" />
                {detailTarget.room ? detailTarget.room.name : 'Ruang menyusul'}
              </div>
              {detailTarget.subject ? (
                <div className="flex items-center gap-2">
                  <BookOpen className="size-4 shrink-0 text-muted-foreground" />
                  Mapel: {detailTarget.subject.name}
                </div>
              ) : null}
              <div className="flex items-center gap-2">
                <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
                Berlaku {new Date(detailTarget.validFrom).toLocaleDateString('id-ID')}
                {' – '}
                {detailTarget.validTo ? new Date(detailTarget.validTo).toLocaleDateString('id-ID') : 'seterusnya'}
              </div>
              {detailTarget.group.package ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">Paket {detailTarget.group.package.name}</Badge>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {detailTarget._count.sessions}/{detailTarget.group.package.totalSessions} sesi terpakai
                  </span>
                </div>
              ) : (
                <span className="text-xs text-muted-foreground tabular-nums">{detailTarget._count.sessions} sesi digenerate</span>
              )}
            </div>
          ) : null}
          {canManage && detailTarget ? (
            <DialogFooter className="gap-2">
              <Button variant="outline" disabled={generateM.isPending}
                onClick={() => { generateM.mutate(detailTarget.id); setDetailTarget(null); }}>
                <Play /> Generate Sesi
              </Button>
              <Button onClick={() => { openEdit(detailTarget); setDetailTarget(null); }}><Pencil /> Edit</Button>
              <Button variant="destructive" disabled={deleteM.isPending}
                onClick={() => {
                  if (confirm('Hapus jadwal ini beserta seluruh sesinya? Sesi yang sudah berisi absensi akan menolak penghapusan.'))
                    deleteM.mutate(detailTarget.id);
                }}>
                <Trash2 /> Hapus
              </Button>
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog open={editTarget !== null} onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Jadwal</DialogTitle>
            <DialogDescription>
              Ubah template mingguan{editTarget ? ` untuk ${editTarget.group.name}` : ''}. Setelah menyimpan, klik Generate untuk mengganti sesi lama yang belum ada absensinya.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>Hari</Label>
              <select className="h-9 rounded-lg border border-input bg-input/30 px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50" value={editForm.dayOfWeek}
                onChange={(e) => setEditForm((p) => ({ ...p, dayOfWeek: e.target.value }))}>
                {DAY_NAMES.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5"><Label>Mulai</Label>
                <Input type="time" value={editForm.start} onChange={(e) => setEditForm((p) => ({ ...p, start: e.target.value }))} /></div>
              <div className="flex flex-col gap-1.5"><Label>Selesai</Label>
                <Input type="time" value={editForm.end} onChange={(e) => setEditForm((p) => ({ ...p, end: e.target.value }))} /></div>
            </div>
            <div className="flex flex-col gap-1.5"><Label>Berlaku dari</Label>
              <Input type="date" value={editForm.validFrom} onChange={(e) => setEditForm((p) => ({ ...p, validFrom: e.target.value }))} /></div>
            <div className="flex flex-col gap-1.5"><Label>Berlaku sampai (opsional)</Label>
              <Input type="date" value={editForm.validTo} onChange={(e) => setEditForm((p) => ({ ...p, validTo: e.target.value }))} /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="edit-sched-tutor">Tutor default</Label>
              <ComboboxField
                id="edit-sched-tutor"
                value={editTutorId}
                onChange={setEditTutorId}
                options={(tutorsQ.data ?? []).map((t) => ({ value: t.id, label: t.user.name, imageUrl: t.user.avatarUrl }))}
                placeholder="- Menyusul -"
              /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="edit-sched-room">Ruangan default</Label>
              <ComboboxField
                id="edit-sched-room"
                value={editRoomId}
                onChange={setEditRoomId}
                options={(roomsQ.data ?? []).map((r) => ({ value: r.id, label: r.name }))}
                placeholder="- Menyusul -"
              /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="edit-sched-subject">Mapel (opsional)</Label>
              <ComboboxField
                id="edit-sched-subject"
                value={editSubjectId}
                onChange={setEditSubjectId}
                options={(subjectsQ.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
                placeholder="- Ikut mapel level/program -"
              /></div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" className="size-4 accent-primary" checked={editForm.isActive}
                onChange={(e) => setEditForm((p) => ({ ...p, isActive: e.target.checked }))} />
              Jadwal aktif
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Batal</Button>
            <Button disabled={updateM.isPending} onClick={() => updateM.mutate()}>Simpan Jadwal</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
